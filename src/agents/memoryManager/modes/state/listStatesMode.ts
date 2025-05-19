import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { ListStatesParams, StateResult } from '../../types';
import { parseWorkspaceContext } from '../../../../utils/contextUtils';
// Memory service is used indirectly through the agent
import { WorkspaceStateSnapshot } from '../../../../database/workspace-types';

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
      // Get the memory service
      const memoryService = this.agent.getMemoryService();
      if (!memoryService) {
        return this.prepareResult(false, undefined, 'Memory service not available');
      }
      
      // Parse workspace context
      const parsedContext = parseWorkspaceContext(params.workspaceContext);
      const workspaceId = parsedContext?.workspaceId;
      const includeContext = params.includeContext || false;
      const limit = params.limit || 20;
      const targetSessionId = params.targetSessionId;
      const order = params.order || 'desc';
      const filterTags = params.tags || [];
      
      // Enhanced logging to aid debugging
      console.log(`ListStatesMode - Query parameters:`, {
        workspaceId: workspaceId || 'undefined',
        sessionId: targetSessionId || 'undefined',
        limit,
        order,
        filterTags
      });
      
      // Get states (snapshots) prioritizing session over workspace
      let states: WorkspaceStateSnapshot[] = [];
      try {
        if (targetSessionId) {
          // If session ID is provided, use that as primary filter
          console.log(`Retrieving snapshots for session: ${targetSessionId}`);
          states = await memoryService.getSnapshotsBySession(targetSessionId);
        } else if (workspaceId) {
          // If only workspace ID is provided, use that
          console.log(`Retrieving snapshots for workspace: ${workspaceId}`);
          states = await memoryService.getSnapshots(workspaceId);
        } else {
          // If neither is provided, get all states
          console.log(`Retrieving all snapshots (limited to ${limit})`);
          states = await memoryService.getSnapshots();
        }
        
        console.log(`Retrieved ${states.length} snapshots`);
        
        // If no states found with specific criteria, try a broader search
        if (states.length === 0 && (workspaceId || targetSessionId)) {
          console.log(`No snapshots found with specific criteria, trying broader search`);
          states = await memoryService.getSnapshots();
          console.log(`Broader search retrieved ${states.length} snapshots`);
        }
      } catch (error) {
        console.error(`Error retrieving snapshots:`, error);
        return this.prepareResult(false, undefined, `Error retrieving snapshots: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Apply tags filtering if provided
      if (filterTags.length > 0 && states.length > 0) {
        states = states.filter((state: WorkspaceStateSnapshot) => {
          // Get tags from state metadata
          const stateTags = state.state?.metadata?.tags;
          if (!stateTags || !Array.isArray(stateTags)) {
            return false;
          }
          
          // Check if the state has all the required tags
          return filterTags.every(tag => 
            stateTags.some(stateTag => 
              typeof stateTag === 'string' && stateTag.toLowerCase().includes(tag.toLowerCase())
            )
          );
        });
      }
      
      // Sort states by timestamp
      states.sort((a: WorkspaceStateSnapshot, b: WorkspaceStateSnapshot) => {
        return order === 'desc' 
          ? b.timestamp - a.timestamp 
          : a.timestamp - b.timestamp;
      });
      
      // Apply limit
      const totalCount = states.length;
      states = states.slice(0, limit);
      
      // Map to result format
      const mappedStates = states.map((state: WorkspaceStateSnapshot) => {
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
          const contextFiles = state.state?.contextFiles || [];
          const traceCount = Array.isArray(state.state?.recentTraces) ? state.state.recentTraces.length : 0;
          const stateTags = state.state?.metadata?.tags || [];
          
          result.context = {
            files: contextFiles,
            traceCount,
            tags: stateTags,
          };
          
          // Add summary if available
          if (state.state?.metadata?.summary) {
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
      return this.prepareResult(false, undefined, `Error listing states: ${error instanceof Error ? error.message : String(error)}`);
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