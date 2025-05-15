import { VectorStore } from '../db/memory-db';
import { BaseEmbeddingProvider } from '../providers/embeddings-provider';
import { MemorySettings, MemoryQueryParams, MemoryQueryResult } from '../../../types';

/**
 * Utility class for query operations related to memory management
 * Centralizes logic for semantic searches and result processing
 */
export class QueryOperations {
    /**
     * Query the memory database for semantically similar content
     * 
     * @param db Vector store instance
     * @param provider Embedding provider
     * @param params Query parameters
     * @param settings Memory settings
     * @returns Query results
     */
    static async query(
        db: VectorStore | null,
        provider: BaseEmbeddingProvider | null,
        params: MemoryQueryParams,
        settings: MemorySettings
    ): Promise<MemoryQueryResult> {
        if (!settings.enabled || !db || !provider) {
            return { matches: [] };
        }
        
        try {
            // Get embedding for the query text
            const embedding = await provider.getEmbedding(params.query);
            
            // Apply default values from settings
            const searchParams: MemoryQueryParams = {
                ...params,
                limit: params.limit || settings.defaultResultLimit,
                threshold: params.threshold || settings.defaultThreshold
            };
            
            // Add graph options if not explicitly disabled
            if (settings.includeNeighbors && !searchParams.graphOptions) {
                searchParams.graphOptions = {
                    useGraphBoost: true,
                    boostFactor: settings.graphBoostFactor,
                    includeNeighbors: true,
                    maxDistance: 1
                };
            }
            
            // Search the database
            const results = await db.findSimilar(embedding, searchParams);
            
            return results;
        } catch (error) {
            console.error('Error querying memory:', error);
            throw new Error(`Failed to query memory: ${error.message}`);
        }
    }
    
    /**
     * Process and enhance query results
     * This could be expanded to add additional context, backlinks, etc.
     * 
     * @param results The raw query results
     * @param settings Memory settings
     * @returns Enhanced query results
     */
    static enhanceQueryResults(
        results: MemoryQueryResult,
        settings: MemorySettings
    ): MemoryQueryResult {
        // Currently just returns the results as-is
        // This is a placeholder for future enhancements like:
        // - Adding contextual information
        // - Incorporating backlinks if enabled
        // - Applying additional filters
        // - Grouping by file/section
        
        return results;
    }
}