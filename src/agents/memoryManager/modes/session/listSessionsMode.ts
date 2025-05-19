import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { WorkspaceSession } from '../../../../database/workspace-types';
import { ListSessionsParams, SessionResult } from '../../types';
import { parseWorkspaceContext } from '../../../../utils/contextUtils';
// Memory service is used indirectly through the agent

/**
 * Mode for listing sessions for a workspace with enhanced filtering
 */
export class ListSessionsMode extends BaseMode<ListSessionsParams, SessionResult> {
  /**
   * Create a new ListSessionsMode
   * @param agent MemoryManager agent instance
   */
  constructor(private agent: MemoryManagerAgent) {
    super(
      'listSessions',
      'List Sessions',
      'Lists sessions for a workspace with filtering options',
      '1.0.0'
    );
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  async execute(params: ListSessionsParams): Promise<SessionResult> {
    try {
      // Get the memory service
      const memoryService = this.agent.getMemoryService();
      if (!memoryService) {
        return this.prepareResult(false, undefined, 'Memory service not available');
      }
      
      const activeOnly = params.activeOnly || false;
      const limit = params.limit || 50;
      const order = params.order || 'desc';
      const filterTags = params.tags || [];
      
      // Parse workspace context, but don't require workspaceId
      const parsedContext = parseWorkspaceContext(params.workspaceContext);
      const workspaceId = parsedContext?.workspaceId;
      
      // Get sessions for specific workspace or all sessions if no workspaceId
      let sessions: WorkspaceSession[] = [];
      
      if (workspaceId) {
        // Get sessions for specific workspace
        sessions = await memoryService.getSessions(workspaceId, activeOnly);
      } else {
        // Get all sessions when no workspaceId is provided
        sessions = await memoryService.getAllSessions(activeOnly);
      }
      
      // Apply tag filtering if requested
      if (filterTags.length > 0) {
        // Note: This is a simplification as we don't yet store tags with sessions directly
        // In a real implementation, we would need to enhance the session storage to include tags
        // For now, we'll just filter by partial match in name or description
        sessions = sessions.filter((session: WorkspaceSession) => {
          const sessionText = `${session.name || ''} ${session.description || ''}`.toLowerCase();
          return filterTags.some(tag => sessionText.includes(tag.toLowerCase()));
        });
      }
      
      // Apply sorting
      sessions.sort((a: WorkspaceSession, b: WorkspaceSession) => {
        if (order === 'asc') {
          return a.startTime - b.startTime;
        } else {
          return b.startTime - a.startTime;
        }
      });
      
      // Apply limit
      // Track total count for potential future pagination implementation
      sessions = sessions.slice(0, limit);
      
      // Return result
      return this.prepareResult(true, {
        sessions: sessions.map((session: WorkspaceSession) => ({
          id: session.id,
          name: session.name || `Session ${new Date(session.startTime).toLocaleString()}`,
          workspaceId: session.workspaceId,
          startTime: session.startTime,
          endTime: session.endTime,
          isActive: session.isActive,
          description: session.description,
          toolCalls: session.toolCalls || 0,
          tags: (session as any).tags || []
        }))
      });
    } catch (error) {
      return this.prepareResult(false, undefined, `Error listing sessions: ${error instanceof Error ? error.message : String(error)}`);
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
        activeOnly: {
          type: 'boolean',
          description: 'Whether to only include active sessions',
          default: false
        },
        limit: {
          type: 'number',
          description: 'Maximum number of sessions to return',
          default: 50
        },
        order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort order for sessions (asc: oldest first, desc: newest first)',
          default: 'desc'
        },
        tags: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Filter sessions by tags (partial match on name/description)'
        },
        workspaceContext: {
          type: ['object', 'string', 'null'],
          description: 'Optional workspace context. If not provided, returns sessions from all workspaces.'
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
        sessions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Session ID'
              },
              name: {
                type: 'string',
                description: 'Session name'
              },
              workspaceId: {
                type: 'string',
                description: 'Workspace ID'
              },
              startTime: {
                type: 'number',
                description: 'Session start timestamp'
              },
              endTime: {
                type: 'number',
                description: 'Session end timestamp (if ended)'
              },
              isActive: {
                type: 'boolean',
                description: 'Whether the session is active'
              },
              description: {
                type: 'string',
                description: 'Session description'
              },
              toolCalls: {
                type: 'number',
                description: 'Number of tool calls in this session'
              },
              tags: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Tags associated with this session'
              }
            },
            required: ['id', 'workspaceId', 'startTime', 'isActive']
          },
          description: 'List of sessions'
        }
      },
      required: ['sessions']
    };
    
    return baseSchema;
  }
}