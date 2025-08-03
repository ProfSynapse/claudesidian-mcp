import { Plugin } from 'obsidian';
import { CommonParameters } from '../../../types';
import { BaseMode } from '../../baseMode';
import { MemoryService } from '../../../database/services/MemoryService';
import { MemoryTraceService } from '../../../database/services/memory/MemoryTraceService';
import { WorkspaceService } from '../../../database/services/WorkspaceService';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { getErrorMessage } from '../../../utils/errorUtils';

export interface SearchMemoryParams extends CommonParameters {
  query: string;
  memoryTypes?: ('traces' | 'toolCalls' | 'sessions' | 'states' | 'workspaces')[];
  workspace?: string;
  dateRange?: {
    start?: string;
    end?: string;
  };
  limit?: number;
  // Tool call specific filters
  toolCallFilters?: {
    agent?: string;
    mode?: string;
    success?: boolean;
    minExecutionTime?: number;
    maxExecutionTime?: number;
  };
  // Search method selection
  searchMethod?: 'semantic' | 'exact' | 'mixed';
  // Session filtering control
  filterBySession?: boolean; // If true, only return traces from the current sessionId
}

export interface MemorySearchResult {
  type: 'trace' | 'toolCall' | 'session' | 'state' | 'workspace';
  id: string;
  highlight: string;
  metadata: {
    created: string;
    updated?: string;
    sessionId?: string;
    workspaceId?: string;
    primaryGoal?: string;
    filesReferenced?: string[];
    activityType?: string;
    toolUsed?: string;
    modeUsed?: string;
    // Tool call specific metadata
    toolCallId?: string;
    agent?: string;
    mode?: string;
    executionTime?: number;
    success?: boolean;
    errorMessage?: string;
    affectedResources?: string[];
  };
  context: {
    before: string;
    match: string;
    after: string;
  };
  score: number;
}

export interface SearchMemoryResult {
  success: boolean;
  query: string;
  results: MemorySearchResult[];
  totalResults: number;
  error?: string;
}

/**
 * Search mode focused on memory traces, sessions, states, and workspaces
 */
export class SearchMemoryMode extends BaseMode<SearchMemoryParams, SearchMemoryResult> {
  private memoryService?: MemoryService;
  private memoryTraceService?: MemoryTraceService;
  private workspaceService?: WorkspaceService;
  private embeddingService?: EmbeddingService;
  private plugin: Plugin;

  constructor(
    plugin: Plugin,
    memoryService?: MemoryService,
    workspaceService?: WorkspaceService,
    embeddingService?: EmbeddingService,
    memoryTraceService?: MemoryTraceService
  ) {
    super(
      'searchMemory', 
      'Search Memory', 
      'Search through memory traces, sessions, states, and workspaces. Enables finding past conversations and context.', 
      '1.0.0'
    );
    
    this.plugin = plugin;
    this.memoryService = memoryService;
    this.memoryTraceService = memoryTraceService;
    this.workspaceService = workspaceService;
    this.embeddingService = embeddingService;
    
    // Try to get MemoryTraceService from plugin services if not provided
    if (!this.memoryTraceService && plugin && (plugin as any).services?.memoryTraceService) {
      this.memoryTraceService = (plugin as any).services.memoryTraceService;
    }
  }

  async execute(params: SearchMemoryParams): Promise<SearchMemoryResult> {
    try {
      if (!params.query || params.query.trim().length === 0) {
        return {
          success: false,
          query: params.query || '',
          results: [],
          totalResults: 0,
          error: 'Query parameter is required and cannot be empty'
        };
      }

      // Default to all memory types if not specified
      const memoryTypes = params.memoryTypes || ['traces', 'toolCalls', 'sessions', 'states', 'workspaces'];
      const limit = params.limit || 20;
      const searchMethod = params.searchMethod || 'mixed';
      const results: MemorySearchResult[] = [];

      // Access services from ServiceContainer
      const memoryService = this.getMemoryService();
      const workspaceService = this.getWorkspaceService();
      
      console.log('[SearchMemoryMode] Service access status:', {
        memoryService: !!memoryService,
        workspaceService: !!workspaceService,
        memoryTypes: memoryTypes,
        query: params.query
      });
      
      // Try async access for MemoryTraceService if sync access fails
      let memoryTraceService = this.getMemoryTraceService();
      console.log('[SearchMemoryMode] Initial MemoryTraceService access:', !!memoryTraceService);
      
      if (!memoryTraceService) {
        try {
          memoryTraceService = await this.getMemoryTraceServiceAsync() || undefined;
          console.log('[SearchMemoryMode] Async MemoryTraceService access:', !!memoryTraceService);
        } catch (error) {
          console.warn('[SearchMemoryMode] Failed to access MemoryTraceService:', error);
        }
      }


      // Search memory traces (legacy traces)
      if (memoryTypes.includes('traces') && (memoryService || this.memoryService)) {
        const activeMemoryService = memoryService || this.memoryService;
        try {
          const traceResults = await activeMemoryService!.searchMemoryTraces(
            params.query,
            {
              workspaceId: params.workspace,
              limit: limit,
              sessionId: params.sessionId
            }
          );

          for (const result of traceResults) {
            const trace = result.trace;
            
            // Apply filters
            if (!this.passesFilters(trace, params)) continue;
            
            results.push({
              type: 'trace',
              id: trace.id,
              highlight: this.generateHighlight(trace.content, params.query),
              metadata: {
                created: new Date(trace.timestamp).toISOString(),
                sessionId: trace.sessionId,
                workspaceId: trace.workspaceId,
                primaryGoal: '',
                filesReferenced: trace.metadata?.relatedFiles || [],
                activityType: trace.activityType,
                toolUsed: trace.metadata?.tool,
                modeUsed: ''
              },
              context: this.generateContext(trace.content, params.query),
              score: result.similarity || 0
            });
          }
        } catch (error) {
          console.error('[SearchMemoryMode] Error searching legacy traces:', error);
        }
      }
      
      // Search tool call traces (enhanced memory traces)
      if (memoryTypes.includes('toolCalls') && (memoryTraceService || this.memoryTraceService)) {
        const activeMemoryTraceService = memoryTraceService || this.memoryTraceService;
        console.log('[SearchMemoryMode] Searching toolCalls with activeMemoryTraceService:', !!activeMemoryTraceService);
        
        try {
          let toolCallResults: any[] = [];
          
          if (searchMethod === 'semantic' || searchMethod === 'mixed') {
            // Use semantic search
            console.log('[SearchMemoryMode] Performing semantic search with options:', {
              query: params.query,
              workspaceId: params.workspace,
              sessionId: params.sessionId,
              limit: limit
            });
            
            const semanticResults = await activeMemoryTraceService!.searchMemoryTraces(
              params.query,
              {
                workspaceId: params.workspace,
                limit: limit,
                sessionId: params.sessionId
              }
            );
            console.log('[SearchMemoryMode] Semantic search returned:', semanticResults.length, 'results');
            toolCallResults.push(...semanticResults);
          }
          
          if (searchMethod === 'exact' || searchMethod === 'mixed') {
            // Use exact text search on tool call traces
            const exactResults = await this.searchToolCallsExact(
              params.query,
              {
                workspaceId: params.workspace,
                sessionId: params.sessionId,
                limit: limit,
                toolCallFilters: params.toolCallFilters
              }
            );
            toolCallResults.push(...exactResults);
          }
          
          // Remove duplicates and sort by score
          const uniqueResults = this.deduplicateResults(toolCallResults);
          console.log('[SearchMemoryMode] After deduplication:', uniqueResults.length, 'unique results');
          
          for (const result of uniqueResults) {
            const trace = result.trace;
            
            // Apply filters
            if (!this.passesFilters(trace, params)) {
              console.log('[SearchMemoryMode] Trace failed general filters:', trace.id);
              continue;
            }
            if (!this.passesToolCallFilters(trace, params.toolCallFilters)) {
              console.log('[SearchMemoryMode] Trace failed tool call filters:', trace.id);
              continue;
            }
            
            // Check if this is a tool call trace (has toolCallId)
            const isToolCall = !!(trace as any).toolCallId;
            
            if (isToolCall) {
              const toolCallTrace = trace as any; // ToolCallMemoryTrace
              
              results.push({
                type: 'toolCall',
                id: trace.id,
                highlight: this.generateHighlight(trace.content, params.query),
                metadata: {
                  created: new Date(trace.timestamp).toISOString(),
                  sessionId: trace.sessionId,
                  workspaceId: trace.workspaceId,
                  primaryGoal: '',
                  filesReferenced: toolCallTrace.relationships?.relatedFiles || [],
                  activityType: trace.activityType,
                  toolUsed: toolCallTrace.toolName,
                  modeUsed: toolCallTrace.mode,
                  // Tool call specific metadata
                  toolCallId: toolCallTrace.toolCallId,
                  agent: toolCallTrace.agent,
                  mode: toolCallTrace.mode,
                  executionTime: toolCallTrace.executionContext?.timing?.executionTime,
                  success: toolCallTrace.metadata?.response?.success,
                  errorMessage: toolCallTrace.metadata?.response?.error?.message,
                  affectedResources: toolCallTrace.relationships?.affectedResources || []
                },
                context: this.generateToolCallContext(toolCallTrace, params.query),
                score: result.similarity || 0
              });
            } else {
              // Regular memory trace
              results.push({
                type: 'trace',
                id: trace.id,
                highlight: this.generateHighlight(trace.content, params.query),
                metadata: {
                  created: new Date(trace.timestamp).toISOString(),
                  sessionId: trace.sessionId,
                  workspaceId: trace.workspaceId,
                  primaryGoal: '',
                  filesReferenced: trace.metadata?.relatedFiles || [],
                  activityType: trace.activityType,
                  toolUsed: trace.metadata?.tool,
                  modeUsed: ''
                },
                context: this.generateContext(trace.content, params.query),
                score: result.similarity || 0
              });
            }
          }
        } catch (error) {
          console.error('[SearchMemoryMode] Error searching tool call traces:', error);
        }
      }

      // Search sessions
      if (memoryTypes.includes('sessions') && (memoryService || this.memoryService)) {
        const activeMemoryService = memoryService || this.memoryService;
        try {
          const sessions = await activeMemoryService!.getAllSessions();
          const queryLower = params.query.toLowerCase();
          
          for (const session of sessions) {
            // Check if session matches query
            if ((session.name || '').toLowerCase().includes(queryLower) ||
                session.description?.toLowerCase().includes(queryLower)) {
              
              // Apply workspace filter if specified
              if (params.workspace && session.workspaceId !== params.workspace) {
                continue;
              }

              // Apply date filter if specified
              if (params.dateRange) {
                const sessionDate = session.startTime;
                const startDate = params.dateRange.start ? new Date(params.dateRange.start).getTime() : 0;
                const endDate = params.dateRange.end ? new Date(params.dateRange.end).getTime() : Date.now();
                
                if (sessionDate < startDate || sessionDate > endDate) {
                  continue;
                }
              }

              results.push({
                type: 'session',
                id: session.id,
                highlight: session.description || session.name || 'Unnamed session',
                metadata: {
                  created: new Date(session.startTime).toISOString(),
                  updated: session.endTime ? new Date(session.endTime).toISOString() : undefined,
                  workspaceId: session.workspaceId
                },
                context: {
                  before: `Session: ${session.name || 'Unnamed session'}`,
                  match: session.description || '',
                  after: `Tool calls: ${session.toolCalls}`
                },
                score: 0.8 // Fixed score for non-semantic matches
              });
            }
          }
        } catch (error) {
        }
      }

      // Search states
      if (memoryTypes.includes('states') && (memoryService || this.memoryService)) {
        const activeMemoryService = memoryService || this.memoryService;
        try {
          const states = await activeMemoryService!.getSnapshots();
          const queryLower = params.query.toLowerCase();
          
          for (const state of states) {
            // Check if state matches query
            if (state.name.toLowerCase().includes(queryLower) ||
                state.description?.toLowerCase().includes(queryLower)) {
                // Note: context property doesn't exist on WorkspaceStateSnapshot
              
              // Apply workspace filter if specified
              if (params.workspace && state.workspaceId !== params.workspace) {
                continue;
              }

              // Apply session filter if specified
              if (params.sessionId && state.sessionId !== params.sessionId) {
                continue;
              }

              // Apply date filter if specified
              if (params.dateRange) {
                const stateDate = state.timestamp;
                const startDate = params.dateRange.start ? new Date(params.dateRange.start).getTime() : 0;
                const endDate = params.dateRange.end ? new Date(params.dateRange.end).getTime() : Date.now();
                
                if (stateDate < startDate || stateDate > endDate) {
                  continue;
                }
              }

              results.push({
                type: 'state',
                id: state.id,
                highlight: state.description || state.name,
                metadata: {
                  created: new Date(state.timestamp).toISOString(),
                  sessionId: state.sessionId,
                  workspaceId: state.workspaceId,
                  filesReferenced: [] // context property doesn't exist
                },
                context: {
                  before: `State: ${state.name}`,
                  match: state.description || '',
                  after: `Created: ${new Date(state.timestamp).toISOString()}`
                },
                score: 0.8
              });
            }
          }
        } catch (error) {
        }
      }

      // Search workspaces
      if (memoryTypes.includes('workspaces') && (workspaceService || this.workspaceService)) {
        const activeWorkspaceService = workspaceService || this.workspaceService;
        try {
          const workspaces = await activeWorkspaceService!.getWorkspaces();
          const queryLower = params.query.toLowerCase();
          
          for (const workspace of workspaces) {
            // Check if workspace matches query
            if (workspace.name.toLowerCase().includes(queryLower) ||
                workspace.description?.toLowerCase().includes(queryLower)) {
              
              results.push({
                type: 'workspace',
                id: workspace.id,
                highlight: workspace.description || workspace.name,
                metadata: {
                  created: new Date(workspace.created).toISOString(),
                  updated: new Date(workspace.lastAccessed).toISOString()
                },
                context: {
                  before: `Workspace: ${workspace.name}`,
                  match: workspace.description || '',
                  after: workspace.status === 'active' ? 'Active workspace' : `Status: ${workspace.status}`
                },
                score: 0.8
              });
            }
          }
        } catch (error) {
        }
      }

      // Sort results by score (highest first) and apply limit
      results.sort((a, b) => b.score - a.score);
      const limitedResults = results.slice(0, limit);

      console.log('[SearchMemoryMode] Final search results:', {
        totalFound: results.length,
        limitedTo: limitedResults.length,
        query: params.query,
        memoryTypes: memoryTypes
      });

      return {
        success: true,
        query: params.query,
        results: limitedResults,
        totalResults: results.length
      };
      
    } catch (error) {
      return {
        success: false,
        query: params.query,
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
  
  /**
   * Check if a trace passes the common filters
   * @private
   */
  private passesFilters(trace: any, params: SearchMemoryParams): boolean {
    console.log('[SearchMemoryMode] Checking filters for trace:', {
      traceId: trace.id,
      traceSessionId: trace.sessionId,
      paramSessionId: params.sessionId,
      hasDateRange: !!params.dateRange,
      traceTimestamp: trace.timestamp
    });
    
    // Apply date filter if specified
    if (params.dateRange) {
      const traceDate = new Date(trace.timestamp).getTime();
      const startDate = params.dateRange.start ? new Date(params.dateRange.start).getTime() : 0;
      const endDate = params.dateRange.end ? new Date(params.dateRange.end).getTime() : Date.now();
      
      if (traceDate < startDate || traceDate > endDate) {
        console.log('[SearchMemoryMode] Trace failed date filter:', {
          traceDate, startDate, endDate
        });
        return false;
      }
    }

    // Apply session filter ONLY if explicitly requested via filterBySession parameter
    if (params.filterBySession && params.sessionId && trace.sessionId !== params.sessionId) {
      console.log('[SearchMemoryMode] Trace failed session filter (filterBySession=true):', {
        traceSessionId: trace.sessionId,
        paramSessionId: params.sessionId
      });
      return false;
    }
    
    console.log('[SearchMemoryMode] Trace passed all filters');
    return true;
  }
  
  /**
   * Check if a tool call trace passes the tool call specific filters
   * @private
   */
  private passesToolCallFilters(trace: any, filters?: SearchMemoryParams['toolCallFilters']): boolean {
    if (!filters) return true;
    
    const toolCallTrace = trace as any; // ToolCallMemoryTrace
    
    // Check if this is actually a tool call trace
    if (!toolCallTrace.toolCallId) return true;
    
    // Agent filter
    if (filters.agent && toolCallTrace.agent !== filters.agent) {
      return false;
    }
    
    // Mode filter
    if (filters.mode && toolCallTrace.mode !== filters.mode) {
      return false;
    }
    
    // Success filter
    if (filters.success !== undefined && toolCallTrace.metadata?.response?.success !== filters.success) {
      return false;
    }
    
    // Execution time filters
    const executionTime = toolCallTrace.executionContext?.timing?.executionTime;
    if (executionTime !== undefined) {
      if (filters.minExecutionTime !== undefined && executionTime < filters.minExecutionTime) {
        return false;
      }
      if (filters.maxExecutionTime !== undefined && executionTime > filters.maxExecutionTime) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Generate highlighted snippet from content
   * @private
   */
  private generateHighlight(content: string, query: string): string {
    const maxLength = 200;
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    
    const index = contentLower.indexOf(queryLower);
    if (index === -1) {
      return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
    }
    
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + query.length + 50);
    
    let highlight = content.substring(start, end);
    if (start > 0) highlight = '...' + highlight;
    if (end < content.length) highlight = highlight + '...';
    
    return highlight;
  }
  
  /**
   * Generate context object from content
   * @private
   */
  private generateContext(content: string, query: string): { before: string; match: string; after: string } {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    const index = contentLower.indexOf(queryLower);
    
    if (index === -1) {
      return {
        before: '',
        match: content.substring(0, 100),
        after: ''
      };
    }
    
    const matchStart = index;
    const matchEnd = index + query.length;
    
    return {
      before: content.substring(Math.max(0, matchStart - 50), matchStart),
      match: content.substring(matchStart, matchEnd),
      after: content.substring(matchEnd, Math.min(content.length, matchEnd + 50))
    };
  }
  
  /**
   * Generate context for tool call traces
   * @private
   */
  private generateToolCallContext(toolCallTrace: any, query: string): { before: string; match: string; after: string } {
    const context = this.generateContext(toolCallTrace.content, query);
    
    // Enhance with tool call specific context
    const toolInfo = `${toolCallTrace.agent}.${toolCallTrace.mode}`;
    const statusInfo = toolCallTrace.metadata?.response?.success ? 'SUCCESS' : 'FAILED';
    const executionTime = toolCallTrace.executionContext?.timing?.executionTime;
    
    return {
      before: `[${toolInfo}] ${context.before}`,
      match: context.match,
      after: `${context.after} [${statusInfo}${executionTime ? ` - ${executionTime}ms` : ''}]`
    };
  }
  
  /**
   * Perform exact text search on tool call traces
   * @private
   */
  private async searchToolCallsExact(
    query: string,
    options: {
      workspaceId?: string;
      sessionId?: string;
      limit?: number;
      toolCallFilters?: SearchMemoryParams['toolCallFilters'];
    }
  ): Promise<any[]> {
    let memoryTraceService = this.getMemoryTraceService() || this.memoryTraceService;
    if (!memoryTraceService) {
      memoryTraceService = await this.getMemoryTraceServiceAsync() || undefined;
    }
    if (!memoryTraceService) return [];
    
    try {
      // Get all memory traces for the workspace/session
      const traces = options.workspaceId 
        ? await memoryTraceService.getMemoryTraces(options.workspaceId, options.limit)
        : options.sessionId
        ? await memoryTraceService.getSessionTraces(options.sessionId, options.limit)
        : [];
      
      const queryLower = query.toLowerCase();
      const results: any[] = [];
      
      for (const trace of traces) {
        // Check if this is a tool call trace
        const isToolCall = !!(trace as any).toolCallId;
        if (!isToolCall) continue;
        
        // Perform exact text matching
        const contentLower = trace.content.toLowerCase();
        const metadataText = JSON.stringify(trace.metadata).toLowerCase();
        
        let score = 0;
        if (contentLower.includes(queryLower)) {
          score += 0.8;
        }
        if (metadataText.includes(queryLower)) {
          score += 0.6;
        }
        
        // Check tool call specific fields
        const toolCallTrace = trace as any;
        if (toolCallTrace.agent?.toLowerCase().includes(queryLower)) score += 0.9;
        if (toolCallTrace.mode?.toLowerCase().includes(queryLower)) score += 0.9;
        if (toolCallTrace.toolName?.toLowerCase().includes(queryLower)) score += 0.9;
        
        if (score > 0) {
          results.push({
            trace: trace,
            similarity: score
          });
        }
      }
      
      // Sort by score and apply limit
      results.sort((a, b) => b.similarity - a.similarity);
      return results.slice(0, options.limit || 20);
      
    } catch (error) {
      console.error('[SearchMemoryMode] Error in exact tool call search:', error);
      return [];
    }
  }
  
  /**
   * Remove duplicate results based on trace ID
   * @private
   */
  private deduplicateResults(results: any[]): any[] {
    const seen = new Set<string>();
    const unique: any[] = [];
    
    for (const result of results) {
      const id = result.trace?.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        unique.push(result);
      }
    }
    
    return unique;
  }

  /**
   * Get MemoryService from ServiceContainer
   * @private
   */
  private getMemoryService(): MemoryService | undefined {
    try {
      const plugin = (this.plugin as any)?.app?.plugins?.getPlugin('claudesidian-mcp');
      if (plugin?.serviceContainer) {
        return plugin.serviceContainer.getIfReady('memoryService') || undefined;
      }
      return undefined;
    } catch (error) {
      console.warn('[SearchMemoryMode] Failed to get MemoryService:', error);
      return undefined;
    }
  }

  /**
   * Get MemoryTraceService from ServiceContainer with async wait
   * @private
   */
  private async getMemoryTraceServiceAsync(): Promise<MemoryTraceService | undefined> {
    try {
      const plugin = (this.plugin as any)?.app?.plugins?.getPlugin('claudesidian-mcp');
      
      if (plugin?.getService) {
        return await plugin.getService('memoryTraceService', 5000);
      }
      
      // Fallback to synchronous access
      if (plugin?.serviceContainer) {
        return plugin.serviceContainer.getIfReady('memoryTraceService');
      }
      
      return undefined;
    } catch (error) {
      console.warn('[SearchMemoryMode] Failed to get MemoryTraceService:', error);
      return undefined;
    }
  }

  private getMemoryTraceService(): MemoryTraceService | undefined {
    try {
      const plugin = (this.plugin as any)?.app?.plugins?.getPlugin('claudesidian-mcp');
      
      if (plugin?.serviceContainer) {
        const service = plugin.serviceContainer.getIfReady('memoryTraceService');
        return service || undefined;
      }
      
      return undefined;
    } catch (error) {
      console.warn('[SearchMemoryMode] Failed to get MemoryTraceService:', error);
      return undefined;
    }
  }

  /**
   * Get WorkspaceService from ServiceContainer
   * @private
   */
  private getWorkspaceService(): WorkspaceService | undefined {
    try {
      const plugin = (this.plugin as any)?.app?.plugins?.getPlugin('claudesidian-mcp');
      if (plugin?.serviceContainer) {
        return plugin.serviceContainer.getIfReady('workspaceService') || undefined;
      }
      return undefined;
    } catch (error) {
      console.warn('[SearchMemoryMode] Failed to get WorkspaceService:', error);
      return undefined;
    }
  }
}