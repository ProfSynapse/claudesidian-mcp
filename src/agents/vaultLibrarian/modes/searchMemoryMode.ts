import { Plugin } from 'obsidian';
import { CommonParameters } from '../../../types';
import { BaseMode } from '../../baseMode';
import { MemoryService } from '../../../database/services/MemoryService';
import { WorkspaceService } from '../../../database/services/WorkspaceService';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { getErrorMessage } from '../../../utils/errorUtils';

export interface SearchMemoryParams extends CommonParameters {
  query: string;
  memoryTypes?: ('traces' | 'sessions' | 'states' | 'workspaces')[];
  workspace?: string;
  dateRange?: {
    start?: string;
    end?: string;
  };
  limit?: number;
}

export interface MemorySearchResult {
  type: 'trace' | 'session' | 'state' | 'workspace';
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
  private workspaceService?: WorkspaceService;
  private embeddingService?: EmbeddingService;
  private plugin: Plugin;

  constructor(
    plugin: Plugin,
    memoryService?: MemoryService,
    workspaceService?: WorkspaceService,
    embeddingService?: EmbeddingService
  ) {
    super(
      'searchMemory', 
      'Search Memory', 
      'Search through memory traces, sessions, states, and workspaces. Enables finding past conversations and context.', 
      '1.0.0'
    );
    
    this.plugin = plugin;
    this.memoryService = memoryService;
    this.workspaceService = workspaceService;
    this.embeddingService = embeddingService;
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
      const memoryTypes = params.memoryTypes || ['traces', 'sessions', 'states', 'workspaces'];
      const limit = params.limit || 20;
      const results: MemorySearchResult[] = [];

      // Search memory traces
      if (memoryTypes.includes('traces') && this.memoryService) {
        try {
          const traceResults = await this.memoryService.searchMemoryTraces(
            params.query,
            {
              workspaceId: params.workspace,
              limit: limit,
              sessionId: params.sessionId
            }
          );

          for (const result of traceResults) {
            const trace = result.trace;
            // Apply date filter if specified
            if (params.dateRange) {
              const traceDate = new Date(trace.timestamp).getTime();
              const startDate = params.dateRange.start ? new Date(params.dateRange.start).getTime() : 0;
              const endDate = params.dateRange.end ? new Date(params.dateRange.end).getTime() : Date.now();
              
              if (traceDate < startDate || traceDate > endDate) {
                continue;
              }
            }

            // Apply session filter if specified
            if (params.sessionId && trace.sessionId !== params.sessionId) {
              continue;
            }

            // Note: contextDetail property doesn't exist in metadata type
            
            results.push({
              type: 'trace',
              id: trace.id,
              highlight: trace.content.substring(0, 200) + '...',
              metadata: {
                created: new Date(trace.timestamp).toISOString(),
                sessionId: trace.sessionId,
                workspaceId: trace.workspaceId,
                primaryGoal: '', // contextDetail doesn't exist
                filesReferenced: trace.metadata?.relatedFiles || [],
                activityType: trace.activityType,
                toolUsed: trace.metadata?.tool,
                modeUsed: '' // mode doesn't exist in metadata
              },
              context: {
                before: '', // contextDetail doesn't exist
                match: trace.content,
                after: '' // contextDetail doesn't exist
              },
              score: result.similarity || 0
            });
          }
        } catch (error) {
          console.error('Error searching memory traces:', error);
        }
      }

      // Search sessions
      if (memoryTypes.includes('sessions') && this.memoryService) {
        try {
          const sessions = await this.memoryService.getAllSessions();
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
          console.error('Error searching sessions:', error);
        }
      }

      // Search states
      if (memoryTypes.includes('states') && this.memoryService) {
        try {
          const states = await this.memoryService.getSnapshots();
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
          console.error('Error searching states:', error);
        }
      }

      // Search workspaces
      if (memoryTypes.includes('workspaces') && this.workspaceService) {
        try {
          const workspaces = await this.workspaceService.getWorkspaces();
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
          console.error('Error searching workspaces:', error);
        }
      }

      // Sort results by score (highest first) and apply limit
      results.sort((a, b) => b.score - a.score);
      const limitedResults = results.slice(0, limit);

      return {
        success: true,
        query: params.query,
        results: limitedResults,
        totalResults: results.length
      };
      
    } catch (error) {
      console.error('Memory search failed:', error);
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
            enum: ['traces', 'sessions', 'states', 'workspaces']
          },
          description: 'Types of memory to search (defaults to all)',
          default: ['traces', 'sessions', 'states', 'workspaces']
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
                enum: ['trace', 'session', 'state', 'workspace'],
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
}