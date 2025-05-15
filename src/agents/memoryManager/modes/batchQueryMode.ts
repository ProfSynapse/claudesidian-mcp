import { BaseMode } from '../../baseMode';
import { MemoryManager } from '../memoryManager';
import { BatchQueryParams, BatchQueryResult } from '../types';
import { schema } from '../config';

/**
 * Mode for batch querying multiple queries in the memory storage
 * Executes multiple semantic searches in a single operation
 */
export class BatchQueryMode extends BaseMode<BatchQueryParams, BatchQueryResult> {
    constructor(private memoryManager: MemoryManager) {
        super('batch-query', 'Batch Query', 'Executes multiple queries in the memory system', '1.0.0');
    }

    /**
     * Execute the batch query mode
     * 
     * @param params Batch query parameters
     * @returns Batch query result
     */
    async execute(params: BatchQueryParams): Promise<BatchQueryResult> {
        try {
            // Validate queries aren't empty
            if (!params.queries || params.queries.length === 0) {
                throw new Error('Queries cannot be empty');
            }
            
            const results = [];
            
            // Process each query in the batch
            for (const query of params.queries) {
                try {
                    const result = await this.memoryManager.query(query);
                    results.push({
                        query: query.query,
                        success: true,
                        matches: result.matches
                    });
                } catch (error) {
                    results.push({
                        query: query.query,
                        success: false,
                        error: error.message,
                        matches: []
                    });
                }
            }
            
            // Determine overall success
            const failedCount = results.filter(r => !r.success).length;
            
            return {
                success: failedCount === 0,
                totalProcessed: params.queries.length,
                successCount: params.queries.length - failedCount,
                failedCount,
                results
            };
        } catch (error) {
            console.error('Error batch querying memory:', error);
            return {
                success: false,
                totalProcessed: 0,
                successCount: 0, 
                failedCount: 0,
                error: error.message,
                results: []
            };
        }
    }

    /**
     * Get parameter JSON schema
     */
    getParameterSchema(): Record<string, any> {
        return schema.batchQueryParams;
    }

    /**
     * Get result JSON schema
     */
    getResultSchema(): Record<string, any> {
        return schema.batchQueryResults;
    }
}