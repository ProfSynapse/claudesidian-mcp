/**
 * ResponseMinimizer - Strips redundant context from MCP responses for token efficiency
 *
 * Problem: Mode results echo context fields (primaryGoal, subgoal, sessionMemory, toolContext)
 * that the LLM already knows from the request, adding 700-3500 chars of overhead per response.
 *
 * Solution: Strip context/workspaceContext at the response formatting layer, preserving only
 * valuable data (recommendations, actual content for reads, minimal confirmations for writes).
 */

export class ResponseMinimizer {
    // Read operations preserve full data.content
    private static readonly READ_PATTERNS = [
        'read', 'search', 'list', 'get', 'load', 'find', 'query'
    ];

    // Write operations return minimal confirmation
    private static readonly WRITE_PATTERNS = [
        'create', 'append', 'prepend', 'replace', 'delete', 'update',
        'move', 'duplicate', 'edit', 'execute', 'toggle', 'generate'
    ];

    /**
     * Main entry point - minimizes a result for MCP output
     */
    minimize(result: any, modeName?: string): any {
        if (!result) return result;

        // Error responses
        if (!result.success && result.error) {
            return this.minimizeError(result);
        }

        // Batch operations (recursive handling)
        if (Array.isArray(result.data?.results)) {
            return this.minimizeBatch(result);
        }

        // Standard operations - differentiate by type
        const isRead = this.isReadOperation(modeName);
        return isRead ? this.minimizeRead(result) : this.minimizeWrite(result);
    }

    /**
     * Detect if operation is a read (preserve data) or write (minimal response)
     */
    private isReadOperation(modeName?: string): boolean {
        if (!modeName) return true; // Conservative default: preserve data

        const lower = modeName.toLowerCase();

        // Special case: findReplace is a write operation despite containing "find"
        if (lower.includes('findreplace')) {
            return false;
        }

        // Special case: executePrompt and batchExecutePrompt are read operations (return content)
        // despite containing "execute"
        if (lower.includes('executeprompt')) {
            return true;
        }

        // Check read patterns first
        if (ResponseMinimizer.READ_PATTERNS.some(p => lower.includes(p))) {
            return true;
        }

        // Check write patterns
        if (ResponseMinimizer.WRITE_PATTERNS.some(p => lower.includes(p))) {
            return false;
        }

        // Default to read (preserve data) for unknown operations
        return true;
    }

    /**
     * Read operations: keep full data, strip context
     */
    private minimizeRead(result: any): any {
        const minimized: any = {
            success: result.success
        };

        // Preserve data (the actual content)
        if (result.data !== undefined) {
            minimized.data = result.data;
        }

        // Preserve top-level results (common in search modes)
        if (result.results !== undefined) {
            minimized.results = result.results;
        }

        // Preserve search metadata
        if (result.totalResults !== undefined) {
            minimized.totalResults = result.totalResults;
        }
        if (result.query !== undefined) {
            minimized.query = result.query;
        }
        if (result.searchedPaths !== undefined) {
            minimized.searchedPaths = result.searchedPaths;
        }

        // Preserve recommendations
        if (result.recommendations) {
            minimized.recommendations = result.recommendations;
        }

        return minimized;
    }

    /**
     * Write operations: minimal confirmation with just success + filePath
     */
    private minimizeWrite(result: any): any {
        const minimized: any = {
            success: result.success
        };

        // Extract filePath for confirmation
        const filePath = result.data?.filePath || result.filePath;
        if (filePath) {
            minimized.filePath = filePath;
        }

        // Extract minimal confirmation data (counts, timestamps)
        if (result.data) {
            const confirm = this.extractWriteConfirmation(result.data);
            if (confirm) {
                minimized.data = confirm;
            }
        }

        // Preserve recommendations
        if (result.recommendations) {
            minimized.recommendations = result.recommendations;
        }

        return minimized;
    }

    /**
     * Extract only confirmation-relevant fields from write data
     */
    private extractWriteConfirmation(data: any): any {
        const confirmFields = [
            'filePath',
            'imagePath',
            'created',
            'appendedLength',
            'prependedLength',
            'replacements',
            'deletions',
            'linesReplaced',
            'totalLength',
            'count'
        ];

        const confirm: any = {};
        for (const field of confirmFields) {
            if (data[field] !== undefined) {
                confirm[field] = data[field];
            }
        }

        return Object.keys(confirm).length > 0 ? confirm : undefined;
    }

    /**
     * Batch operations: recursively minimize nested results
     */
    private minimizeBatch(result: any): any {
        const minimizedResults = result.data.results.map((sub: any) => {
            const isRead = sub.type === 'read';

            const minimizedSub: any = {
                success: sub.success,
                type: sub.type,
                filePath: sub.filePath
            };

            // Include data only for read operations
            if (isRead && sub.data) {
                minimizedSub.data = sub.data;
            }

            // Include error if present
            if (sub.error) {
                minimizedSub.error = sub.error;
            }

            return minimizedSub;
        });

        const minimized: any = {
            success: result.success,
            data: { results: minimizedResults }
        };

        // Preserve recommendations
        if (result.recommendations) {
            minimized.recommendations = result.recommendations;
        }

        return minimized;
    }

    /**
     * Error responses: keep error-helpful fields, strip verbose context
     */
    private minimizeError(result: any): any {
        const minimized: any = {
            success: false,
            error: result.error
        };

        // Keep fields that help fix the error
        if (result.parameterHints) {
            minimized.parameterHints = result.parameterHints;
        }
        if (result.suggestions) {
            minimized.suggestions = result.suggestions;
        }
        if (result.expectedParams) {
            minimized.expectedParams = result.expectedParams;
        }

        return minimized;
    }
}
