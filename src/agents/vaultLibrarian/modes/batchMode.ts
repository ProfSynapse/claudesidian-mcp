import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { SearchMode, UnifiedSearchParams, UnifiedSearchResult } from './searchMode';
import { VectorMode, VectorSearchParams, VectorSearchResult } from './vectorMode';
import { CommonParameters, CommonResult } from '../../../types';
import { GraphBoostOptions } from '../types';
import { MemoryService } from '../../../database/services/MemoryService';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';
import { EmbeddingService } from '../../../database/services/EmbeddingService';

/**
 * Batch operation type
 */
export type BatchOperationType = 'search' | 'vector' | 'hybrid';

/**
 * Basic batch operation interface
 */
export interface BatchOperation {
  /**
   * Type of operation
   */
  type: BatchOperationType;
  
  /**
   * Optional operation ID for tracking
   */
  id?: string;
}

/**
 * Search operation
 */
export interface SearchOperation extends BatchOperation {
  type: 'search';
  
  /**
   * Search parameters
   */
  params: UnifiedSearchParams;
}

/**
 * Vector operation
 */
export interface VectorOperation extends BatchOperation {
  type: 'vector';
  
  /**
   * Vector search parameters
   */
  params: VectorSearchParams;
}

/**
 * Hybrid operation (combine vector and regular search)
 */
export interface HybridOperation extends BatchOperation {
  type: 'hybrid';
  
  /**
   * Vector search parameters
   */
  vectorParams: VectorSearchParams;
  
  /**
   * Regular search parameters
   */
  searchParams: UnifiedSearchParams;
  
  /**
   * Weights for combining results (0-1)
   */
  weights?: {
    /**
     * Weight for vector results
     */
    vector?: number;
    
    /**
     * Weight for search results
     */
    search?: number;
  };
}

/**
 * Batch mode parameters
 */
export interface BatchModeParams extends CommonParameters, GraphBoostOptions {
  /**
   * Array of operations to execute
   */
  operations: Array<SearchOperation | VectorOperation | HybridOperation>;
  
}

/**
 * Operation result
 */
export interface OperationResult {
  /**
   * Type of operation
   */
  type: BatchOperationType;
  
  /**
   * Operation ID (if provided)
   */
  id?: string;
  
  /**
   * Whether the operation was successful
   */
  success: boolean;
  
  /**
   * Error message if the operation failed
   */
  error?: string;
  
  /**
   * Search results (if type is 'search')
   */
  searchResults?: UnifiedSearchResult;
  
  /**
   * Vector results (if type is 'vector')
   */
  vectorResults?: VectorSearchResult;
  
  /**
   * Hybrid results (if type is 'hybrid')
   */
  hybridResults?: {
    /**
     * Vector search results
     */
    vectorResults: VectorSearchResult;
    
    /**
     * Regular search results
     */
    searchResults: UnifiedSearchResult;
    
    /**
     * Combined matches with weighted scores
     */
    combinedMatches?: Array<{
      /**
       * Path to the file
       */
      path: string;
      
      /**
       * Content snippet
       */
      snippet: string;
      
      /**
       * Combined score
       */
      score: number;
      
      /**
       * Weighted vector score component
       */
      vectorScore?: number;
      
      /**
       * Weighted search score component
       */
      searchScore?: number;
    }>;
  };
}

/**
 * Batch mode result
 */
export interface BatchModeResult extends CommonResult {
  /**
   * Array of operation results
   */
  results?: OperationResult[];
  
  /**
   * Total number of operations
   */
  total?: number;
  
  /**
   * Number of successful operations
   */
  successful?: number;
  
  /**
   * Number of failed operations
   */
  failed?: number;
}

/**
 * Mode for executing batch operations combining search and vector approaches
 */
export class BatchMode extends BaseMode<BatchModeParams, BatchModeResult> {
  private searchMode: SearchMode;
  private vectorMode: VectorMode;
  private batchParams: BatchModeParams | null = null;
  
  /**
   * Create a new BatchMode
   * @param app Obsidian app instance
   * @param memoryService Optional memory service
   * @param searchService Optional search service
   * @param embeddingService Optional embedding service
   */
  constructor(
    app: App,
    memoryService?: MemoryService | null,
    searchService?: ChromaSearchService | null,
    embeddingService?: EmbeddingService | null
  ) {
    super(
      'batch',
      'Batch Search',
      'Execute multiple search operations (regular and vector) in a batch',
      '1.0.0'
    );
    
    
    // Initialize the search modes
    this.searchMode = new SearchMode(app);
    this.vectorMode = new VectorMode(app, memoryService, searchService, embeddingService);
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with batch operation results
   */
  async execute(params: BatchModeParams): Promise<BatchModeResult> {
    // Store the batch parameters for use in individual operations
    this.batchParams = params;
    
    // Validate operations array
    if (!params.operations || !Array.isArray(params.operations) || params.operations.length === 0) {
      return {
        success: false,
        error: 'No operations provided',
        total: 0,
        successful: 0,
        failed: 0
      };
    }
    
    const results: OperationResult[] = [];
    let successful = 0;
    let failed = 0;
    
    // Process each operation
    for (const operation of params.operations) {
      try {
        let result: OperationResult;
        
        switch (operation.type) {
          case 'search':
            result = await this.executeSearchOperation(operation);
            break;
          case 'vector':
            result = await this.executeVectorOperation(operation);
            break;
          case 'hybrid':
            result = await this.executeHybridOperation(operation);
            break;
          default:
            // Handle unknown operation type with type assertion
            const unknownOp = operation as unknown as BatchOperation;
            result = {
              type: unknownOp.type || 'search',
              id: unknownOp.id,
              success: false,
              error: `Unsupported operation type: ${unknownOp.type || 'unknown'}`
            };
            break;
        }
        
        results.push(result);
        
        if (result.success) {
          successful++;
        } else {
          failed++;
          
        }
      } catch (error) {
        results.push({
          type: operation.type,
          id: operation.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        failed++;
        
      }
    }
    
    // Return the batch results
    return {
      success: failed === 0,
      results,
      total: params.operations.length,
      successful,
      failed,
      error: failed > 0 ? `${failed} operations failed` : undefined
    };
  }
  
  /**
   * Execute a search operation
   * @param operation Search operation
   * @returns Promise that resolves with operation result
   */
  private async executeSearchOperation(operation: SearchOperation): Promise<OperationResult> {
    try {
      // Add sessionId if not provided
      if (!operation.params.sessionId) {
        operation.params.sessionId = 'batch-' + Date.now();
      }
      
      // Pass through graph boost parameters from the batch operation to the search operation
      if (this.batchParams) {
        operation.params.useGraphBoost = operation.params.useGraphBoost ?? this.batchParams.useGraphBoost;
        operation.params.graphBoostFactor = operation.params.graphBoostFactor ?? this.batchParams.graphBoostFactor;
        operation.params.graphMaxDistance = operation.params.graphMaxDistance ?? this.batchParams.graphMaxDistance;
        operation.params.seedNotes = operation.params.seedNotes ?? this.batchParams.seedNotes;
      }
      
      // Execute the search operation
      const result = await this.searchMode.execute(operation.params);
      
      return {
        type: 'search',
        id: operation.id,
        success: result.success,
        error: result.error,
        searchResults: result
      };
    } catch (error) {
      console.error('Error executing search operation:', error);
      return {
        type: 'search',
        id: operation.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during search operation'
      };
    }
  }
  
  /**
   * Execute a vector operation
   * @param operation Vector operation
   * @returns Promise that resolves with operation result
   */
  private async executeVectorOperation(operation: VectorOperation): Promise<OperationResult> {
    try {
      // Add sessionId if not provided
      if (!operation.params.sessionId) {
        operation.params.sessionId = 'batch-' + Date.now();
      }
      
      // Pass through graph boost parameters from the batch operation to the vector operation
      if (this.batchParams) {
        operation.params.useGraphBoost = operation.params.useGraphBoost ?? this.batchParams.useGraphBoost;
        operation.params.graphBoostFactor = operation.params.graphBoostFactor ?? this.batchParams.graphBoostFactor;
        operation.params.graphMaxDistance = operation.params.graphMaxDistance ?? this.batchParams.graphMaxDistance;
        operation.params.seedNotes = operation.params.seedNotes ?? this.batchParams.seedNotes;
      }
      
      // Execute the vector operation
      const result = await this.vectorMode.execute(operation.params);
      
      return {
        type: 'vector',
        id: operation.id,
        success: result.success,
        error: result.error,
        vectorResults: result
      };
    } catch (error) {
      console.error('Error executing vector operation:', error);
      return {
        type: 'vector',
        id: operation.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during vector operation'
      };
    }
  }
  
  /**
   * Execute a hybrid operation
   * @param operation Hybrid operation
   * @returns Promise that resolves with operation result
   */
  private async executeHybridOperation(operation: HybridOperation): Promise<OperationResult> {
    try {
      // Add sessionId if not provided
      if (!operation.vectorParams.sessionId) {
        operation.vectorParams.sessionId = 'hybrid-vector-' + Date.now();
      }
      
      if (!operation.searchParams.sessionId) {
        operation.searchParams.sessionId = 'hybrid-search-' + Date.now();
      }
      
      // Pass through graph boost parameters from the batch operation to both operations
      if (this.batchParams) {
        // Vector params
        operation.vectorParams.useGraphBoost = operation.vectorParams.useGraphBoost ?? this.batchParams.useGraphBoost;
        operation.vectorParams.graphBoostFactor = operation.vectorParams.graphBoostFactor ?? this.batchParams.graphBoostFactor;
        operation.vectorParams.graphMaxDistance = operation.vectorParams.graphMaxDistance ?? this.batchParams.graphMaxDistance;
        operation.vectorParams.seedNotes = operation.vectorParams.seedNotes ?? this.batchParams.seedNotes;
        
        // Search params
        operation.searchParams.useGraphBoost = operation.searchParams.useGraphBoost ?? this.batchParams.useGraphBoost;
        operation.searchParams.graphBoostFactor = operation.searchParams.graphBoostFactor ?? this.batchParams.graphBoostFactor;
        operation.searchParams.graphMaxDistance = operation.searchParams.graphMaxDistance ?? this.batchParams.graphMaxDistance;
        operation.searchParams.seedNotes = operation.searchParams.seedNotes ?? this.batchParams.seedNotes;
      }
      
      // Default weights if not provided
      const weights = {
        vector: operation.weights?.vector ?? 0.7,
        search: operation.weights?.search ?? 0.3
      };
      
      // Execute both operations
      const [vectorResult, searchResult] = await Promise.all([
        this.vectorMode.execute(operation.vectorParams),
        this.searchMode.execute(operation.searchParams)
      ]);
      
      // Create hybrid result
      const hybridResult: OperationResult = {
        type: 'hybrid',
        id: operation.id,
        success: vectorResult.success || searchResult.success,
        error: vectorResult.success ? searchResult.error : vectorResult.error,
        hybridResults: {
          vectorResults: vectorResult,
          searchResults: searchResult
        }
      };
      
      // Combine results if both successful
      if (vectorResult.success && searchResult.success && vectorResult.matches && searchResult.success) {
        const combinedMatches = this.combineResults(vectorResult, searchResult, weights);
        
        if (hybridResult.hybridResults) {
          hybridResult.hybridResults.combinedMatches = combinedMatches;
        }
      }
      
      return hybridResult;
    } catch (error) {
      console.error('Error executing hybrid operation:', error);
      return {
        type: 'hybrid',
        id: operation.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during hybrid operation'
      };
    }
  }
  
  /**
   * Combine vector and search results with weights
   * @param vectorResult Vector search result
   * @param searchResult Regular search result
   * @param weights Weights for combining scores
   * @returns Combined matches with weighted scores
   */
  private combineResults(
    vectorResult: VectorSearchResult,
    searchResult: UnifiedSearchResult,
    weights: { vector: number; search: number }
  ): Array<{
    path: string;
    snippet: string;
    score: number;
    vectorScore?: number;
    searchScore?: number;
  }> {
    // Create a map to track combined results
    const resultMap = new Map<string, {
      path: string;
      snippets: string[];
      vectorScore?: number;
      searchScore?: number;
    }>();
    
    // Add vector results
    if (vectorResult.matches) {
      for (const match of vectorResult.matches) {
        resultMap.set(match.filePath, {
          path: match.filePath,
          snippets: [match.content],
          vectorScore: match.similarity * weights.vector
        });
      }
    }
    
    // Add search results
    if (searchResult.type === 'content' && searchResult.contentResults?.results) {
      for (const result of searchResult.contentResults.results) {
        if (resultMap.has(result.path)) {
          // Update existing entry
          const existing = resultMap.get(result.path)!;
          existing.snippets.push(result.snippet);
          existing.searchScore = (result.score || 0) * weights.search;
        } else {
          // Create new entry
          resultMap.set(result.path, {
            path: result.path,
            snippets: [result.snippet],
            searchScore: (result.score || 0) * weights.search
          });
        }
      }
    }
    
    // Convert map to array and calculate combined scores
    const combined = Array.from(resultMap.values()).map(item => {
      const vectorScore = item.vectorScore || 0;
      const searchScore = item.searchScore || 0;
      
      // Select the best snippet (prefer the vector snippet if available)
      const snippet = item.snippets[0] || '';
      
      return {
        path: item.path,
        snippet,
        score: vectorScore + searchScore,
        vectorScore,
        searchScore
      };
    });
    
    // Sort by combined score
    combined.sort((a, b) => b.score - a.score);
    
    return combined;
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session identifier to track related tool calls'
        },
        // Graph boost parameters (shared across operations)
        useGraphBoost: {
          type: 'boolean',
          description: 'Whether to use graph-based relevance boosting (applied to all operations)',
          default: false
        },
        graphBoostFactor: {
          type: 'number',
          description: 'Graph boost factor (0-1) (applied to all operations)',
          default: 0.3
        },
        graphMaxDistance: {
          type: 'number',
          description: 'Maximum distance for graph connections (applied to all operations)',
          default: 1
        },
        seedNotes: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of seed note paths to prioritize in results (applied to all operations)'
        },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['search', 'vector', 'hybrid'],
                description: 'Type of operation'
              },
              id: {
                type: 'string',
                description: 'Optional operation ID for tracking'
              }
            },
            allOf: [
              {
                if: {
                  properties: { type: { enum: ['search'] } }
                },
                then: {
                  properties: {
                    params: {
                      type: 'object',
                      description: 'Search parameters'
                    }
                  },
                  required: ['params']
                }
              },
              {
                if: {
                  properties: { type: { enum: ['vector'] } }
                },
                then: {
                  properties: {
                    params: {
                      type: 'object',
                      description: 'Vector search parameters'
                    }
                  },
                  required: ['params']
                }
              },
              {
                if: {
                  properties: { type: { enum: ['hybrid'] } }
                },
                then: {
                  properties: {
                    vectorParams: {
                      type: 'object',
                      description: 'Vector search parameters'
                    },
                    searchParams: {
                      type: 'object',
                      description: 'Regular search parameters'
                    },
                    weights: {
                      type: 'object',
                      properties: {
                        vector: {
                          type: 'number',
                          description: 'Weight for vector results (0-1)'
                        },
                        search: {
                          type: 'number',
                          description: 'Weight for search results (0-1)'
                        }
                      }
                    }
                  },
                  required: ['vectorParams', 'searchParams']
                }
              }
            ],
            required: ['type']
          },
          description: 'Array of operations to execute'
        },
      },
      required: ['operations'],
      description: 'Execute multiple search operations (regular and vector) in a batch'
    };
  }
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether all operations were successful'
        },
        error: {
          type: 'string',
          description: 'Error message if any operation failed'
        },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['search', 'vector', 'hybrid'],
                description: 'Type of operation'
              },
              id: {
                type: 'string',
                description: 'Operation ID (if provided)'
              },
              success: {
                type: 'boolean',
                description: 'Whether the operation was successful'
              },
              error: {
                type: 'string',
                description: 'Error message if the operation failed'
              }
            },
            allOf: [
              {
                if: {
                  properties: { type: { enum: ['search'] } }
                },
                then: {
                  properties: {
                    searchResults: {
                      type: 'object',
                      description: 'Search results'
                    }
                  }
                }
              },
              {
                if: {
                  properties: { type: { enum: ['vector'] } }
                },
                then: {
                  properties: {
                    vectorResults: {
                      type: 'object',
                      description: 'Vector search results'
                    }
                  }
                }
              },
              {
                if: {
                  properties: { type: { enum: ['hybrid'] } }
                },
                then: {
                  properties: {
                    hybridResults: {
                      type: 'object',
                      properties: {
                        vectorResults: {
                          type: 'object',
                          description: 'Vector search results'
                        },
                        searchResults: {
                          type: 'object',
                          description: 'Regular search results'
                        },
                        combinedMatches: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              path: {
                                type: 'string',
                                description: 'Path to the file'
                              },
                              snippet: {
                                type: 'string',
                                description: 'Content snippet'
                              },
                              score: {
                                type: 'number',
                                description: 'Combined score'
                              },
                              vectorScore: {
                                type: 'number',
                                description: 'Weighted vector score component'
                              },
                              searchScore: {
                                type: 'number',
                                description: 'Weighted search score component'
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            ],
            required: ['type', 'success']
          }
        },
        total: {
          type: 'number',
          description: 'Total number of operations'
        },
        successful: {
          type: 'number',
          description: 'Number of successful operations'
        },
        failed: {
          type: 'number',
          description: 'Number of failed operations'
        }
      },
      required: ['success', 'total', 'successful', 'failed']
    };
  }
}