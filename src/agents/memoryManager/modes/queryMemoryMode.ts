import { BaseMode } from '../../baseMode';
import { MemoryManager } from '../memoryManager';
import { SearchMemoryParams } from '../types';
import { MemoryQueryResult } from '../../../types';
import { schema } from '../config';

/**
 * Mode for querying memory storage
 * Performs semantic search across embeddings in the vault
 */
export class QueryMemoryMode extends BaseMode<SearchMemoryParams, MemoryQueryResult> {
    constructor(private memoryManager: MemoryManager) {
        super('query-memory', 'Query Memory', 'Searches the memory system for relevant content', '1.0.0');
    }

    /**
     * Execute the query mode
     * 
     * @param params Search parameters
     * @returns Search results
     */
    async execute(params: SearchMemoryParams): Promise<MemoryQueryResult> {
        try {
            // Validate query isn't empty
            if (!params.query || params.query.trim() === '') {
                throw new Error('Query cannot be empty');
            }
            
            // Execute the search
            return await this.memoryManager.query(params);
        } catch (error) {
            console.error('Error executing query:', error);
            throw error;
        }
    }

    /**
     * Get parameter JSON schema
     */
    getParameterSchema(): Record<string, any> {
        return schema.searchParams;
    }

    /**
     * Get result JSON schema
     */
    getResultSchema(): Record<string, any> {
        return schema.searchResults;
    }
}