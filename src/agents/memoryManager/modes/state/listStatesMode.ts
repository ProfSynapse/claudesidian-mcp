import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { ListStatesParams, StateResult } from '../../types';

/**
 * Mode for listing workspace states with filtering options
 */
export class ListStatesMode extends BaseMode<ListStatesParams, StateResult> {
  /**
   * Create a new ListStatesMode
   * @param agent MemoryManager agent instance
   */
  constructor(private agent: MemoryManagerAgent) {
    super(
      'listStates',
      'List States',
      'Lists workspace states with filtering options',
      '1.0.0'
    );
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  async execute(params: ListStatesParams): Promise<StateResult> {
    try {
      // Validate workspace context
      if (!params.workspaceContext?.workspaceId) {
        return this.prepareResult(false, undefined, 'Workspace ID is required');
      }
      
      const workspaceId = params.workspaceContext.workspaceId;
      const includeContext = params.includeContext || false;
      const limit = params.limit || 20;
      const targetSessionId = params.targetSessionId;
      const order = params.order || 'desc';
      const filterTags = params.tags || [];
      
      // Get the workspace database
      const workspaceDb = this.agent.getWorkspaceDb();
      if (!workspaceDb) {
        return this.prepareResult(false, undefined, 'Workspace database not available');
      }
      
      // Initialize the database if needed
      if (typeof workspaceDb.initialize === 'function') {
        await workspaceDb.initialize();
      }
      
      // Get states (snapshots) for the workspace
      let states = await workspaceDb.getSnapshots(workspaceId, targetSessionId);
      
      // Apply tags filtering if provided
      if (filterTags.length > 0) {
        states = states.filter((state: any) => {
          // Get tags from state metadata
          const stateTags = state.state.metadata?.tags;
          if (!stateTags || !Array.isArray(stateTags)) {
            return false;
          }
          
          // Check if the state has all the required tags
          return filterTags.every(tag => 
            stateTags.some(stateTag => 
              stateTag.toLowerCase().includes(tag.toLowerCase())
            )
          );
        });
      }
      
      // Sort states by timestamp
      states.sort((a: any, b: any) => {
        return order === 'desc' 
          ? b.timestamp - a.timestamp 
          : a.timestamp - b.timestamp;
      });
      
      // Apply limit
      const totalCount = states.length;
      states = states.slice(0, limit);
      
      // Map to result format
      const mappedStates = states.map((state: any) => {
        // Base state info
        const result: {
          id: string;
          name: string;
          workspaceId: string;
          sessionId: string;
          timestamp: number;
          description?: string;
          context?: {
            files: string[];
            traceCount: number;
            tags: string[];
            summary?: string;
          };
        } = {
          id: state.id,
          name: state.name,
          workspaceId: state.workspaceId,
          sessionId: state.sessionId,
          timestamp: state.timestamp,
          description: state.description,
        };
        
        // Add context if requested
        if (includeContext) {
          const contextFiles = state.state.contextFiles || [];
          const traceCount = state.state.recentTraces?.length || 0;
          const stateTags = state.state.metadata?.tags || [];
          
          result.context = {
            files: contextFiles,
            traceCount,
            tags: stateTags,
          };
          
          // Add summary if available
          if (state.state.metadata?.summary) {
            result.context.summary = state.state.metadata.summary;
          }
        }
        
        return result;
      });
      
      // Return result
      return this.prepareResult(true, {
        states: mappedStates,
        total: totalCount
      });
    } catch (error) {
      return this.prepareResult(false, undefined, `Error listing states: ${error.message}`);
    }
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    // Create the mode-specific schema
    const modeSchema = {
      type: 'object',
      properties: {
        includeContext: {
          type: 'boolean',
          description: 'Whether to include state context information',
          default: false
        },
        limit: {
          type: 'number',
          description: 'Maximum number of states to return',
          default: 20
        },
        targetSessionId: {
          type: 'string',
          description: 'Filter states by target session ID'
        },
        order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort order for states (asc: oldest first, desc: newest first)',
          default: 'desc'
        },
        tags: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Return states that match specific tags'
        }
      }
    };
    
    // Merge with common schema
    return this.getMergedSchema(modeSchema);
  }
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    // Use the base result schema from BaseMode
    const baseSchema = super.getResultSchema();
    
    // Add mode-specific data properties
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        states: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'State ID'
              },
              name: {
                type: 'string',
                description: 'State name'
              },
              workspaceId: {
                type: 'string',
                description: 'Workspace ID'
              },
              sessionId: {
                type: 'string',
                description: 'Session ID'
              },
              timestamp: {
                type: 'number',
                description: 'State creation timestamp'
              },
              description: {
                type: 'string',
                description: 'State description'
              },
              context: {
                type: 'object',
                description: 'State context information (if requested)',
                properties: {
                  files: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    description: 'List of key files included in the state'
                  },
                  traceCount: {
                    type: 'number',
                    description: 'Number of memory traces included'
                  },
                  tags: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    description: 'Tags associated with this state'
                  },
                  summary: {
                    type: 'string',
                    description: 'State summary (if available)'
                  }
                },
                required: ['files', 'traceCount', 'tags']
              }
            },
            required: ['id', 'name', 'workspaceId', 'sessionId', 'timestamp']
          },
          description: 'List of states'
        },
        total: {
          type: 'number',
          description: 'Total number of states matching criteria before limit was applied'
        }
      },
      required: ['states', 'total']
    };
    
    return baseSchema;
  }
}