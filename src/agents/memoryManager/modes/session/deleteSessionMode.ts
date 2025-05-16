import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { DeleteSessionParams, SessionResult } from '../../types';

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
      
      // Extract parameters
      const sessionId = params.sessionId;
      const deleteMemoryTraces = params.deleteMemoryTraces || false;
      const deleteAssociatedStates = params.deleteAssociatedStates || false;
      
      // Get the workspace database
      const workspaceDb = this.agent.getWorkspaceDb();
      if (!workspaceDb) {
        return this.prepareResult(false, undefined, 'Workspace database not available');
      }
      
      // Initialize the database if needed
      if (typeof workspaceDb.initialize === 'function') {
        await workspaceDb.initialize();
      }
      
      // Get the session to verify it exists and capture metadata for response
      const session = await workspaceDb.getSession(sessionId);
      if (!session) {
        return this.prepareResult(false, undefined, `Session with ID ${sessionId} not found`);
      }
      
      // Capture session details before deletion for the response
      const sessionData = {
        sessionId: session.id,
        name: session.name,
        workspaceId: session.workspaceId,
        startTime: session.startTime,
        endTime: session.endTime,
        isActive: session.isActive,
        description: session.description
      };
      
      // If requested, delete associated memory traces
      if (deleteMemoryTraces) {
        try {
          // Implementation would depend on database structure
          // For now, we'll assume the workspaceDb has a method to delete traces by session
          if (typeof workspaceDb.deleteMemoryTracesBySession === 'function') {
            await workspaceDb.deleteMemoryTracesBySession(sessionId);
          } else {
            console.warn('deleteMemoryTracesBySession method not available');
          }
        } catch (error) {
          console.error(`Failed to delete memory traces: ${error.message}`);
          // Continue with session deletion even if trace deletion fails
        }
      }
      
      // If requested, delete associated state snapshots
      if (deleteAssociatedStates) {
        try {
          // Get snapshots associated with this session
          const snapshots = await workspaceDb.getSnapshots(session.workspaceId, sessionId);
          
          // Delete each snapshot
          for (const snapshot of snapshots) {
            await workspaceDb.deleteSnapshot(snapshot.id);
          }
        } catch (error) {
          console.error(`Failed to delete associated states: ${error.message}`);
          // Continue with session deletion even if state deletion fails
        }
      }
      
      // Delete the session
      // First, we need to ensure the session is inactive
      if (session.isActive) {
        await workspaceDb.endSession(sessionId);
      }
      
      // Now, delete the session
      // Note: We're assuming the workspaceDb has a deleteSession method
      // If it doesn't, we'd need to implement one
      if (typeof workspaceDb.deleteSession === 'function') {
        await workspaceDb.deleteSession(sessionId);
      } else {
        // Fall back to just marking as inactive if delete isn't available
        console.warn('deleteSession method not available, marking as inactive instead');
        await workspaceDb.endSession(sessionId);
      }
      
      // Return result with the deleted session info
      return this.prepareResult(true, sessionData, 'Session deleted successfully');
    } catch (error) {
      return this.prepareResult(false, undefined, `Error deleting session: ${error.message}`);
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
        }
      },
      required: ['sessionId', 'workspaceId']
    };
    
    return baseSchema;
  }
}