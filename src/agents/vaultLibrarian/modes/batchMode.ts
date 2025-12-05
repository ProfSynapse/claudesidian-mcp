import { Plugin } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { MemoryService } from "../../memoryManager/services/MemoryService";
import { WorkspaceService } from '../../../services/WorkspaceService';
import { 
  BatchUniversalSearchParams, 
  BatchUniversalSearchResult,
  UniversalSearchResult
} from '../types';
import { getErrorMessage } from '../../../utils/errorUtils';
import { UniversalSearchService } from './services/universal/UniversalSearchService';

/**
 * Batch mode for executing multiple universal searches concurrently
 * Updated to use vector search for semantic search
 */
export class BatchMode extends BaseMode<BatchUniversalSearchParams, BatchUniversalSearchResult> {
  private universalSearchService: UniversalSearchService;

  constructor(
    plugin: Plugin,
    memoryService?: MemoryService,
    workspaceService?: WorkspaceService
  ) {
    super('batch', 'Batch Universal Search', 'Execute multiple universal searches concurrently. Each search automatically covers all content types (files, folders, content, workspaces, sessions, etc.). Use this for complex multi-query operations.', '2.0.0');
    
    this.universalSearchService = new UniversalSearchService(
      plugin,
      memoryService,
      workspaceService
    );
  }

  /**
   * Execute multiple universal searches concurrently
   */
  async execute(params: BatchUniversalSearchParams): Promise<BatchUniversalSearchResult> {
    try {
      // Validate parameters
      if (!params.searches || params.searches.length === 0) {
        return this.prepareResult(false, undefined, 'At least one search query is required');
      }

      if (params.searches.length > (params.maxConcurrency || 10)) {
        return this.prepareResult(false, undefined, `Too many searches requested. Maximum allowed: ${params.maxConcurrency || 10}`);
      }

      const startTime = performance.now();
      const maxConcurrency = params.maxConcurrency || 5;
      
      // Execute searches with concurrency control
      const results = await this.executeConcurrentSearches(params.searches, maxConcurrency);
      
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      // Build response based on merge preference
      if (params.mergeResults) {
        const merged = this.mergeSearchResults(successful);

        return this.prepareResult(true, {
          merged: {
            totalResults: merged.totalResults,
            combinedCategories: merged.categories!
          },
          queriesFailed: failed.length
        });
      } else {
        return this.prepareResult(true, {
          searches: results,
          queriesFailed: failed.length
        });
      }
      
    } catch (error) {
      return this.prepareResult(false, undefined, `Batch search failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Execute searches with concurrency control
   */
  private async executeConcurrentSearches(
    searches: BatchUniversalSearchParams['searches'],
    maxConcurrency: number
  ): Promise<UniversalSearchResult[]> {
    const results: UniversalSearchResult[] = [];
    
    // Process searches in batches to control concurrency
    for (let i = 0; i < searches.length; i += maxConcurrency) {
      const batch = searches.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (searchParams, index) => {
        try {
          // Add a small delay between concurrent searches to avoid overwhelming the system
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, index * 50));
          }
          
          return await this.universalSearchService.executeUniversalSearch(searchParams);
        } catch (error) {
          return {
            success: false,
            error: `Search failed: ${getErrorMessage(error)}`
          } as UniversalSearchResult;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Merge multiple search results into a single unified result
   */
  private mergeSearchResults(results: UniversalSearchResult[]): {
    totalResults: number;
    categories: NonNullable<BatchUniversalSearchResult['merged']>['combinedCategories'];
  } {
    const combinedCategories: NonNullable<BatchUniversalSearchResult['merged']>['combinedCategories'] = {};
    let totalResults = 0;

    // Combine results from each category across all searches
    const categoryNames = ['files', 'folders', 'content', 'workspaces', 'sessions', 'states', 'memory_traces', 'tags', 'properties'] as const;
    
    for (const categoryName of categoryNames) {
      const categoryResults = results
        .map(result => result.categories[categoryName])
        .filter(Boolean);
      
      if (categoryResults.length > 0) {
        // Combine all results from this category
        const allResults = categoryResults.flatMap(cat => cat!.results);
        
        // Remove duplicates based on ID
        const uniqueResults = allResults.filter((result, index, arr) => 
          arr.findIndex(r => r.id === result.id) === index
        );
        
        // Sort by score and take top results
        uniqueResults.sort((a, b) => b.score - a.score);
        const topResults = uniqueResults.slice(0, 10); // Limit merged results
        
        combinedCategories[categoryName] = {
          count: uniqueResults.length,
          results: topResults,
          hasMore: uniqueResults.length > 10,
          searchMethod: categoryResults[0]!.searchMethod,
          semanticAvailable: categoryResults[0]!.semanticAvailable
        };
        
        totalResults += uniqueResults.length;
      }
    }

    return {
      totalResults,
      categories: combinedCategories
    };
  }

  /**
   * Get parameter schema for MCP tool definition
   */
  getParameterSchema() {
    const batchSchema = {
      type: 'object',
      title: 'Batch Universal Search Params',
      description: 'Execute multiple universal searches concurrently. Each search automatically covers all content types. Use this when you need to run several different searches at once.',
      properties: {
        searches: {
          type: 'array',
          description: 'Array of universal search queries to execute concurrently. Each search automatically covers all content types.',
          items: {
            type: 'object',
            title: 'Individual Universal Search',
            description: 'A single universal search that automatically searches across all categories (files, folders, content, workspaces, sessions, etc.)',
            properties: {
              query: {
                type: 'string',
                description: 'Search query to find content across all categories. No type parameter needed - automatically searches everything.',
                examples: [
                  'project planning',
                  'machine learning notes',
                  'typescript documentation'
                ]
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results per category (default: 5)',
                minimum: 1,
                maximum: 20,
                default: 5
              },
              excludeCategories: {
                type: 'array',
                description: 'Categories to exclude from this search',
                items: {
                  type: 'string',
                  enum: ['files', 'folders', 'content', 'workspaces', 'sessions', 'states', 'memory_traces', 'tags', 'properties']
                }
              },
              prioritizeCategories: {
                type: 'array',
                description: 'Categories to prioritize for this search',
                items: {
                  type: 'string',
                  enum: ['files', 'folders', 'content', 'workspaces', 'sessions', 'states', 'memory_traces', 'tags', 'properties']
                }
              },
              paths: {
                type: 'array',
                description: 'Restrict this search to specific folder paths. Supports glob patterns (e.g., "folder/*.md", "**/*.ts").',
                items: { type: 'string' }
              },
              includeContent: {
                type: 'boolean',
                description: 'Whether to include full content in results',
                default: true
              },
              forceSemanticSearch: {
                type: 'boolean',
                description: 'Force semantic search for this query',
                default: false
              }
            },
            required: ['query']
          },
          minItems: 1,
          maxItems: 100
        },
        mergeResults: {
          type: 'boolean',
          description: 'Whether to merge all search results into a single unified response (default: false)',
          default: false
        },
        maxConcurrency: {
          type: 'number',
          description: 'Maximum number of concurrent searches to execute (default: 5)',
          minimum: 1,
          maximum: 10,
          default: 5
        }
      },
      required: ['searches'],
      additionalProperties: false
    };
    
    // Merge with common schema (sessionId and context)
    return this.getMergedSchema(batchSchema);
  }

  /**
   * Get result schema for MCP tool definition
   */
  getResultSchema() {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the batch search was successful'
        },
        searches: {
          type: 'array',
          description: 'Individual search results (if mergeResults is false)',
          items: {
            $ref: '#/definitions/UniversalSearchResult'
          }
        },
        merged: {
          type: 'object',
          description: 'Merged search results (if mergeResults is true)',
          properties: {
            totalQueries: {
              type: 'number',
              description: 'Total number of queries executed'
            },
            totalResults: {
              type: 'number',
              description: 'Total number of unique results across all searches'
            },
            combinedCategories: {
              type: 'object',
              description: 'Combined results organized by category'
            }
          }
        },
        stats: {
          type: 'object',
          description: 'Execution statistics',
          properties: {
            totalExecutionTimeMS: {
              type: 'number',
              description: 'Total execution time in milliseconds'
            },
            queriesExecuted: {
              type: 'number',
              description: 'Number of queries executed'
            },
            queriesFailed: {
              type: 'number',
              description: 'Number of queries that failed'
            },
            avgExecutionTimeMS: {
              type: 'number',
              description: 'Average execution time per query'
            }
          }
        },
        error: {
          type: 'string',
          description: 'Error message if batch search failed'
        }
      },
      required: ['success'],
      additionalProperties: false
    };
  }
}