import { Plugin } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { getErrorMessage } from '../../../utils/errorUtils';
import {
  MemorySearchParameters,
  MemorySearchResult,
  SearchMemoryModeResult,
  MemoryFilterOptions,
  FormatOptions,
  DateRange
} from '../../../types/memory/MemorySearchTypes';
import { MemorySearchProcessor, MemorySearchProcessorInterface } from '../services/MemorySearchProcessor';
import { MemorySearchFilters, MemorySearchFiltersInterface } from '../services/MemorySearchFilters';
import { ResultFormatter, ResultFormatterInterface } from '../services/ResultFormatter';
import { CommonParameters } from '../../../types/mcp/AgentTypes';
import { MemoryService } from "../../agents/memoryManager/services/MemoryService";
import { WorkspaceService } from "../memoryManager/services/WorkspaceService";

/**
 * Memory types available for search (aligned with MemorySearchParameters)
 */
export type MemoryType = 'traces' | 'sessions' | 'states' | 'workspaces' | 'toolCalls';

/**
 * Session filtering options
 */
export interface SessionFilterOptions {
  currentSessionOnly?: boolean;     // Filter to current session (default: false)
  specificSessions?: string[];      // Filter to specific session IDs
  excludeSessions?: string[];       // Exclude specific session IDs
}

/**
 * Temporal filtering options for time-based search
 */
export interface TemporalFilterOptions {
  since?: string | Date;           // Results since this timestamp
  until?: string | Date;           // Results until this timestamp
  lastNHours?: number;             // Results from last N hours
  lastNDays?: number;              // Results from last N days
}

/**
 * Memory search parameters interface (aligned with MemorySearchParameters)
 */
export interface SearchMemoryParams extends CommonParameters {
  // REQUIRED PARAMETERS
  query: string;
  workspaceId: string;  // Defaults to global workspace if not provided

  // OPTIONAL PARAMETERS
  memoryTypes?: MemoryType[];
  searchMethod?: 'semantic' | 'exact' | 'mixed';
  sessionFiltering?: SessionFilterOptions;
  temporalFiltering?: TemporalFilterOptions;
  limit?: number;
  includeMetadata?: boolean;
  includeContent?: boolean;
  
  // Additional properties to match MemorySearchParameters
  workspace?: string;
  dateRange?: DateRange;
  toolCallFilters?: any;
  filterBySession?: boolean;
}

interface SearchModeCapabilities {
  semanticSearch: boolean;
  workspaceFiltering: boolean;
  memorySearch: boolean;
  hybridSearch: boolean;
}

// Enhanced SearchMemoryResult with capabilities and execution time
export interface SearchMemoryResult extends SearchMemoryModeResult {
  searchCapabilities?: SearchModeCapabilities;
  executionTime?: number;
}

// Legacy interface names for backward compatibility
export type { MemorySearchResult };
export type { SearchMemoryModeResult };

/**
 * Search mode focused on memory traces, sessions, states, and workspaces
 * Optimized with extracted services for better maintainability and testability
 */
export class SearchMemoryMode extends BaseMode<SearchMemoryParams, SearchMemoryResult> {
  private plugin: Plugin;
  private processor: MemorySearchProcessorInterface;
  private filters: MemorySearchFiltersInterface;
  private formatter: ResultFormatterInterface;
  private memoryService?: MemoryService;
  private workspaceService?: WorkspaceService;

  constructor(
    plugin: Plugin,
    memoryService?: MemoryService,
    workspaceService?: WorkspaceService,
    processor?: MemorySearchProcessorInterface,
    filters?: MemorySearchFiltersInterface,
    formatter?: ResultFormatterInterface
  ) {
    super(
      'searchMemoryMode', 
      'Search Memory', 
      'MEMORY-FOCUSED search with mandatory workspaceId parameter. Search through memory traces, sessions, states, and activities with workspace context and temporal filtering. Requires: query (search terms) and workspaceId (workspace context - defaults to "global-workspace-default").', 
      '2.0.0'
    );
    
    this.plugin = plugin;
    this.memoryService = memoryService;
    this.workspaceService = workspaceService;
    
    // Initialize services with dependency injection support
    this.processor = processor || new MemorySearchProcessor(plugin);
    this.filters = filters || new MemorySearchFilters();
    this.formatter = formatter || new ResultFormatter();
  }

  async execute(params: SearchMemoryParams): Promise<SearchMemoryResult> {
    const startTime = Date.now();
    
    try {
      // Simple parameter validation
      if (!params.query || params.query.trim().length === 0) {
        return {
          success: false,
          query: params.query || '',
          results: [],
          totalResults: 0,
          searchCapabilities: this.getCapabilities(),
          executionTime: Date.now() - startTime,
          error: 'Query parameter is required and cannot be empty'
        };
      }

      // Apply default workspace if not provided
      const workspaceId = params.workspaceId || 'global-workspace-default';
      const searchParams = { ...params, workspaceId };

      // Core processing through extracted services
      let results = await this.processor.process(searchParams);
      
      // Apply filters if specified
      if (this.shouldApplyFilters(searchParams)) {
        const filterOptions = this.buildFilterOptions(searchParams);
        results = this.filters.filter(results, filterOptions);
      }
      
      // Format results if needed (currently returns results as-is for compatibility)
      const formatOptions = this.buildFormatOptions(searchParams);
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
        totalResults: results.length,
        searchCapabilities: this.getCapabilities(),
        executionTime: Date.now() - startTime
      };
      
    } catch (error) {
      console.error('[SearchMemoryMode] Search error:', error);
      return {
        success: false,
        query: params.query || '',
        results: [],
        totalResults: 0,
        searchCapabilities: this.getCapabilities(),
        executionTime: Date.now() - startTime,
        error: `Memory search failed: ${getErrorMessage(error)}`
      };
    }
  }

  getParameterSchema() {
    // Create the enhanced mode-specific schema
    const modeSchema = {
      type: 'object',
      title: 'Memory Search Parameters',
      description: 'MEMORY-FOCUSED search with workspace context. Search through memory traces, sessions, states, and activities with temporal filtering.',
      properties: {
        query: {
          type: 'string',
          description: 'REQUIRED: Search query to find in memory content',
          minLength: 1,
          examples: ['project discussion', 'error handling', 'user feedback', 'deployment process']
        },
        workspaceId: {
          type: 'string',
          description: 'REQUIRED: Workspace context for memory search. IMPORTANT: If not provided or empty, defaults to "global-workspace-default" which has minimal memory content. Specify a proper workspace ID to access workspace-specific memory traces, sessions, and activities.',
          default: 'global-workspace-default',
          examples: ['project-alpha', 'research-workspace', 'global-workspace-default']
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
      required: ['query', 'workspaceId']
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
        searchCapabilities: {
          type: 'object',
          properties: {
            semanticSearch: { type: 'boolean' },
            workspaceFiltering: { type: 'boolean' },
            memorySearch: { type: 'boolean' },
            hybridSearch: { type: 'boolean' }
          }
        },
        executionTime: {
          type: 'number',
          description: 'Search execution time in milliseconds'
        },
        error: {
          type: 'string',
          description: 'Error message if search failed'
        }
      },
      required: ['success', 'query', 'results', 'totalResults', 'searchCapabilities']
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
              params.workspace || params.workspaceId);
  }
  
  /**
   * Build filter options from parameters
   */
  private buildFilterOptions(params: SearchMemoryParams): MemoryFilterOptions {
    return {
      dateRange: params.dateRange,
      toolCallFilters: params.toolCallFilters,
      sessionId: params.sessionId,
      workspaceId: params.workspace || params.workspaceId,
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

  private getCapabilities(): SearchModeCapabilities {
    return {
      semanticSearch: false, // Memory search typically uses exact/fuzzy matching
      workspaceFiltering: !!this.workspaceService,
      memorySearch: !!this.memoryService,
      hybridSearch: false
    };
  }
}