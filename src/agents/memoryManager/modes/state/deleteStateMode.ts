import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { DeleteStateParams, StateResult } from '../../types';

/**
 * Mode for deleting a workspace state/snapshot
 */
export class DeleteStateMode extends BaseMode<DeleteStateParams, StateResult> {
  /**
   * Create a new DeleteStateMode
   * @param agent MemoryManager agent instance
   */
  constructor(private agent: MemoryManagerAgent) {
    super(
      'deleteState',
      'Delete State',
      'Deletes a workspace state/snapshot',
      '1.0.0'
    );
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  async execute(params: DeleteStateParams): Promise<StateResult> {
    try {
      // Validate required parameters
      if (!params.stateId) {
        return this.prepareResult(false, undefined, 'State ID is required');
      }
      
      // Extract parameters
      const stateId = params.stateId;
      
      // Get the workspace database
      const workspaceDb = this.agent.getWorkspaceDb();
      if (!workspaceDb) {
        return this.prepareResult(false, undefined, 'Workspace database not available');
      }
      
      // Initialize the database if needed
      if (typeof workspaceDb.initialize === 'function') {
        await workspaceDb.initialize();
      }
      
      // Get the state to verify it exists and capture metadata for response
      const state = await workspaceDb.getSnapshot(stateId);
      if (!state) {
        return this.prepareResult(false, undefined, `State with ID ${stateId} not found`);
      }
      
      // Capture state details before deletion for the response
      const stateData = {
        stateId: state.id,
        name: state.name,
        workspaceId: state.workspaceId,
        sessionId: state.sessionId,
        timestamp: state.timestamp,
        description: state.description
      };
      
      // Get the activity embedder
      const activityEmbedder = this.agent.getActivityEmbedder();
      if (!activityEmbedder) {
        return this.prepareResult(false, undefined, 'Activity embedder not available');
      }
      
      // Delete the state snapshot
      await workspaceDb.deleteSnapshot(stateId);
      
      // Record a memory trace about the state deletion
      try {
        const workspace = await workspaceDb.getWorkspace(state.workspaceId);
        if (workspace) {
          const traceContent = `Deleted state "${state.name}" from workspace "${workspace.name}"
State was created on ${new Date(state.timestamp).toLocaleString()}
${state.description ? `Description: ${state.description}` : ''}`;
          
          await activityEmbedder.recordActivity(
            state.workspaceId,
            workspace.path,
            'checkpoint',
            traceContent,
            {
              tool: 'memoryManager.deleteState',
              params: {
                stateId
              },
              result: {
                success: true,
                stateId,
                name: state.name
              }
            },
            [], // No related files for deletion operation
            activityEmbedder.getActiveSession(state.workspaceId)
          );
        }
      } catch (error) {
        console.warn(`Failed to create memory trace for state deletion: ${error.message}`);
        // Continue with normal response even if trace creation fails
      }
      
      // Return result with the deleted state info
      return this.prepareResult(true, stateData, 'State deleted successfully');
    } catch (error) {
      return this.prepareResult(false, undefined, `Error deleting state: ${error.message}`);
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
        stateId: {
          type: 'string',
          description: 'ID of the state to delete'
        }
      },
      required: ['stateId']
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
        stateId: {
          type: 'string',
          description: 'ID of the deleted state'
        },
        name: {
          type: 'string',
          description: 'Name of the deleted state'
        },
        workspaceId: {
          type: 'string',
          description: 'Workspace ID'
        },
        sessionId: {
          type: 'string',
          description: 'Session ID associated with the state'
        },
        timestamp: {
          type: 'number',
          description: 'State creation timestamp'
        },
        description: {
          type: 'string',
          description: 'State description'
        }
      },
      required: ['stateId', 'workspaceId', 'timestamp']
    };
    
    return baseSchema;
  }
}