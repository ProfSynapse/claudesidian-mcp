import { BaseMode } from '../../baseMode';
import { MemoryManagerAgent } from '../memoryManager';
import { MemoryQuery, MemoryQueryResult } from '../types';

/**
 * Query memory mode parameters
 */
interface QueryMemoryParams {
    query: string;
    limit?: number;
    filters?: {
        paths?: string[];
        tags?: string[];
        dateRange?: {
            start?: number;
            end?: number;
        };
    };
}

/**
 * Query memory mode result
 */
interface QueryMemoryResult {
    results: Array<{
        text: string;
        path: string;
        score: number;
        metadata?: Record<string, any>;
    }>;
    enabled: boolean;
}

/**
 * Query memory mode for memory manager
 * Searches the vector database using semantic similarity
 */
export class QueryMemoryMode extends BaseMode<QueryMemoryParams, QueryMemoryResult> {
    private agent: MemoryManagerAgent;
    
    /**
     * Create a new query memory mode
     * @param agent Memory manager agent
     */
    constructor(agent: MemoryManagerAgent) {
        super(
            'queryMemory',
            'Query Memory',
            'Search for information in the memory database',
            '1.0.0'
        );
        this.agent = agent;
    }
    
    /**
     * Execute the mode
     * @param params Query parameters
     * @returns Query results
     */
    async execute(params: QueryMemoryParams): Promise<QueryMemoryResult> {
        try {
            // Check if memory is enabled
            if (!this.agent.isMemoryEnabled()) {
                return {
                    results: [],
                    enabled: false
                };
            }
            
            // In a real implementation, this would:
            // 1. Generate an embedding for the query text
            // 2. Perform a similarity search in the vector database
            // 3. Apply filters
            // 4. Return results
            
            // For now, return empty results
            return {
                results: [],
                enabled: true
            };
        } catch (error) {
            console.error(`Error querying memory: ${params.query}`, error);
            throw error;
        }
    }
    
    /**
     * Get parameter schema for this mode
     * @returns Parameter schema
     */
    getParameterSchema(): Record<string, any> {
        return {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The query text to search for'
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results to return'
                },
                filters: {
                    type: 'object',
                    properties: {
                        paths: {
                            type: 'array',
                            items: {
                                type: 'string'
                            },
                            description: 'Filter by file paths'
                        },
                        tags: {
                            type: 'array',
                            items: {
                                type: 'string'
                            },
                            description: 'Filter by tags'
                        },
                        dateRange: {
                            type: 'object',
                            properties: {
                                start: {
                                    type: 'number',
                                    description: 'Filter by creation date (start timestamp)'
                                },
                                end: {
                                    type: 'number',
                                    description: 'Filter by creation date (end timestamp)'
                                }
                            }
                        }
                    }
                }
            },
            required: ['query']
        };
    }
    
    /**
     * Get result schema for this mode
     * @returns Result schema
     */
    getResultSchema(): Record<string, any> {
        return {
            type: 'object',
            properties: {
                results: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            text: {
                                type: 'string',
                                description: 'The text content that matched'
                            },
                            path: {
                                type: 'string',
                                description: 'Path to the file containing the match'
                            },
                            score: {
                                type: 'number',
                                description: 'Similarity score (0-1)'
                            },
                            metadata: {
                                type: 'object',
                                description: 'Additional metadata about the result'
                            }
                        },
                        required: ['text', 'path', 'score']
                    }
                },
                enabled: {
                    type: 'boolean',
                    description: 'Whether the memory system is enabled'
                }
            },
            required: ['results', 'enabled']
        };
    }
}