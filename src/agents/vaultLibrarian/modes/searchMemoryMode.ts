import { Plugin } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { getErrorMessage } from '../../../utils/errorUtils';
import {
  MemorySearchParameters,
  MemorySearchResult,
  SearchMemoryModeResult,
  MemoryFilterOptions,
  FormatOptions
} from '../../../types/memory/MemorySearchTypes';
import { MemorySearchProcessor, MemorySearchProcessorInterface } from '../services/MemorySearchProcessor';
import { MemorySearchFilters, MemorySearchFiltersInterface } from '../services/MemorySearchFilters';
import { ResultFormatter, ResultFormatterInterface } from '../services/ResultFormatter';

// Legacy interface names for backward compatibility
export interface SearchMemoryParams extends MemorySearchParameters {}
export type { MemorySearchResult };
export type { SearchMemoryModeResult as SearchMemoryResult };

/**
 * Search mode focused on memory traces, sessions, states, and workspaces
 * Optimized with extracted services for better maintainability and testability
 */
export class SearchMemoryMode extends BaseMode<SearchMemoryParams, SearchMemoryModeResult> {
  private plugin: Plugin;
  private processor: MemorySearchProcessorInterface;
  private filters: MemorySearchFiltersInterface;
  private formatter: ResultFormatterInterface;

  constructor(
    plugin: Plugin,
    processor?: MemorySearchProcessorInterface,
    filters?: MemorySearchFiltersInterface,
    formatter?: ResultFormatterInterface
  ) {
    super(
      'searchMemory', 
      'Search Memory', 
      'Search through memory traces, sessions, states, and workspaces. Enables finding past conversations and context.', 
      '1.0.0'
    );
    
    this.plugin = plugin;
    
    // Initialize services with dependency injection support
    this.processor = processor || new MemorySearchProcessor(plugin);
    this.filters = filters || new MemorySearchFilters();
    this.formatter = formatter || new ResultFormatter();
  }

  async execute(params: SearchMemoryParams): Promise<SearchMemoryModeResult> {
    const startTime = Date.now();
    
    try {
      // Basic validation
      if (!params.query || params.query.trim().length === 0) {
        return {
          success: false,
          query: params.query || '',
          results: [],
          totalResults: 0,
          error: 'Query parameter is required and cannot be empty'
        };
      }

      // Core processing through extracted services
      let results = await this.processor.process(params);
      
      // Apply filters if specified
      if (this.shouldApplyFilters(params)) {
        const filterOptions = this.buildFilterOptions(params);
        results = this.filters.filter(results, filterOptions);
      }
      
      // Format results if needed (currently returns results as-is for compatibility)
      const formatOptions = this.buildFormatOptions(params);
      // Note: Formatting is available but not applied by default to maintain compatibility
      
      // Build summary
      const summary = await this.formatter.buildSummary(results);
      const executionTime = Date.now() - startTime;
      summary.executionTime = executionTime;

      console.log('[SearchMemoryMode] Search completed:', {
        totalResults: results.length,
        executionTime: `${executionTime}ms`,
        query: params.query
      });

      return {
        success: true,
        query: params.query,
        results: results,
        totalResults: results.length
      };
      
    } catch (error) {
      console.error('[SearchMemoryMode] Search error:', error);
      return {
        success: false,
        query: params.query || '',
        results: [],
        totalResults: 0,
        error: `Search failed: ${getErrorMessage(error)}`
      };
    }
  }

  getParameterSchema() {
    // Create the mode-specific schema
    const modeSchema = {
      type: 'object',
      title: 'Search Memory Parameters',
      description: 'Search through memory traces, sessions, states, and workspaces',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find in memory content',
          minLength: 1
        },
        memoryTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['traces', 'toolCalls', 'sessions', 'states', 'workspaces']
          },
          description: 'Types of memory to search (defaults to all)',
          default: ['traces', 'toolCalls', 'sessions', 'states', 'workspaces']
        },
        workspace: {
          type: 'string',
          description: 'Filter results by workspace ID'
        },
        dateRange: {
          type: 'object',
          properties: {
            start: {
              type: 'string',
              format: 'date',
              description: 'Start date for filtering results (ISO format)'
            },
            end: {
              type: 'string',
              format: 'date',
              description: 'End date for filtering results (ISO format)'
            }
          },
          description: 'Filter results by date range'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 20,
          minimum: 1,
          maximum: 100
        },
        toolCallFilters: {
          type: 'object',
          properties: {
            agent: {
              type: 'string',
              description: 'Filter by agent name (e.g., contentManager, vaultLibrarian)'
            },
            mode: {
              type: 'string',
              description: 'Filter by mode name (e.g., createNote, searchMode)'
            },
            success: {
              type: 'boolean',
              description: 'Filter by success status (true for successful, false for failed)'
            },
            minExecutionTime: {
              type: 'number',
              description: 'Minimum execution time in milliseconds'
            },
            maxExecutionTime: {
              type: 'number',
              description: 'Maximum execution time in milliseconds'
            }
          },
          description: 'Additional filters for tool call traces'
        },
        searchMethod: {
          type: 'string',
          enum: ['semantic', 'exact', 'mixed'],
          description: 'Search method to use',
          default: 'mixed'
        },
        filterBySession: {
          type: 'boolean',
          description: 'If true, only return traces from the current sessionId. If false or omitted, search across all sessions.',
          default: false
        }
      },
      required: ['query']
    };
    
    // Merge with common schema (sessionId and context) - removing duplicate definitions
    return this.getMergedSchema(modeSchema);
  }

  getResultSchema() {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the search was successful'
        },
        query: {
          type: 'string',
          description: 'The search query'
        },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['trace', 'toolCall', 'session', 'state', 'workspace'],
                description: 'Type of memory result'
              },
              id: {
                type: 'string',
                description: 'Unique identifier of the memory item'
              },
              highlight: {
                type: 'string',
                description: 'Relevant snippet from the memory item'
              },
              metadata: {
                type: 'object',
                description: 'Metadata about the memory item'
              },
              context: {
                type: 'object',
                properties: {
                  before: {
                    type: 'string',
                    description: 'Context before the match'
                  },
                  match: {
                    type: 'string',
                    description: 'The matching content'
                  },
                  after: {
                    type: 'string',
                    description: 'Context after the match'
                  }
                }
              },
              score: {
                type: 'number',
                description: 'Search relevance score'
              }
            }
          }
        },
        totalResults: {
          type: 'number',
          description: 'Total number of results found'
        },
        error: {
          type: 'string',
          description: 'Error message if search failed'
        }
      },
      required: ['success', 'query', 'results', 'totalResults']
    };
  }

  // Private helper methods for the refactored implementation
  
  /**
   * Determine if filters should be applied
   */
  private shouldApplyFilters(params: SearchMemoryParams): boolean {
    return !!(params.dateRange || 
              params.toolCallFilters || 
              params.filterBySession || 
              params.workspace);
  }
  
  /**
   * Build filter options from parameters
   */
  private buildFilterOptions(params: SearchMemoryParams): MemoryFilterOptions {
    return {
      dateRange: params.dateRange,
      toolCallFilters: params.toolCallFilters,
      sessionId: params.sessionId,
      workspaceId: params.workspace,
      filterBySession: params.filterBySession
    };
  }
  
  /**
   * Build format options from parameters
   */
  private buildFormatOptions(params: SearchMemoryParams): FormatOptions {
    return {
      maxHighlightLength: 200,
      contextLength: 50,
      enhanceToolCallContext: true
    };
  }
}