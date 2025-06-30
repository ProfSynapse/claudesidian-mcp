import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { DeleteSessionParams, SessionResult } from '../../types';
import { extractContextFromParams } from '../../../../utils/contextUtils';

/**
 * Mode for deleting a session and optionally its associated data
 */
export class DeleteSessionMode extends BaseMode<DeleteSessionParams, SessionResult> {
  /**
   * Create a new DeleteSessionMode
   * @param agent MemoryManager agent instance
   */
  constructor(private agent: MemoryManagerAgent) {
    super(
      'deleteSession',
      'Delete Session',
      'Deletes a session and optionally its associated memory traces and states',
      '1.0.0'
    );
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  async execute(params: DeleteSessionParams): Promise<SessionResult> {
    try {
      // Validate required parameters
      if (!params.sessionId) {
        return this.prepareResult(false, undefined, 'Session ID is required');
      }
      
      // Get services
      const memoryService = this.agent.getMemoryService();
      if (!memoryService) {
        return this.prepareResult(false, undefined, 'Memory service not available');
      }
      
      // Extract parameters
      const sessionId = params.sessionId;
      const deleteMemoryTraces = params.deleteMemoryTraces || false;
      const deleteAssociatedStates = params.deleteAssociatedStates || false;
      
      // Get the session to verify it exists and capture metadata for response
      const session = await memoryService.getSession(sessionId);
      if (!session) {
        return this.prepareResult(false, undefined, `Session with ID ${sessionId} not found`);
      }
      
      // Capture session details before deletion for the response
      const sessionData: {
        sessionId: string;
        name: string | undefined;
        workspaceId: string;
        startTime: number;
        endTime: number | undefined;
        isActive: boolean;
        description: string | undefined;
        tags: any;
        deletionStats?: {
          tracesDeleted?: number;
          snapshotsDeleted?: number;
        };
      } = {
        sessionId: session.id,
        name: session.name,
        workspaceId: session.workspaceId,
        startTime: session.startTime,
        endTime: session.endTime,
        isActive: session.isActive,
        description: session.description,
        tags: (session as any).tags || []
      };
      
      // Delete the session and optionally its associated data
      // The deleteSession method handles traces and snapshots based on options
      try {
        const deleteResult = await memoryService.deleteSession(sessionId, {
          deleteMemoryTraces: deleteMemoryTraces,
          deleteSnapshots: deleteAssociatedStates
        });
        
        // Add deletion stats to sessionData for response
        sessionData.deletionStats = {
          tracesDeleted: deleteResult.tracesDeleted,
          snapshotsDeleted: deleteResult.snapshotsDeleted
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to delete session: ${errorMessage}`);
        return this.prepareResult(false, undefined, `Failed to delete session: ${errorMessage}`);
      }
      
      // Return result with the deleted session info
      return this.prepareResult(true, sessionData, 'Session deleted successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.prepareResult(false, undefined, `Error deleting session: ${errorMessage}`);
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
        sessionId: {
          type: 'string',
          description: 'ID of the session to delete'
        },
        deleteMemoryTraces: {
          type: 'boolean',
          description: 'Whether to also delete associated memory traces',
          default: false
        },
        deleteAssociatedStates: {
          type: 'boolean',
          description: 'Whether to also delete associated state snapshots',
          default: false
        }
      },
      required: ['sessionId']
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
        sessionId: {
          type: 'string',
          description: 'ID of the deleted session'
        },
        name: {
          type: 'string',
          description: 'Name of the deleted session'
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
          description: 'Session end timestamp'
        },
        isActive: {
          type: 'boolean',
          description: 'Whether the session was active'
        },
        description: {
          type: 'string',
          description: 'Session description'
        },
        deletionStats: {
          type: 'object',
          description: 'Statistics about deletion of associated data',
          properties: {
            tracesDeleted: {
              type: 'number',
              description: 'Number of memory traces deleted'
            },
            snapshotsDeleted: {
              type: 'number', 
              description: 'Number of snapshots deleted'
            }
          }
        }
      },
      required: ['sessionId', 'workspaceId']
    };
    
    return baseSchema;
  }
}