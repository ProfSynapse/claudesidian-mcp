import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { EditStateParams, StateResult } from '../../types';
import { parseWorkspaceContext } from '../../../../utils/contextUtils';

/**
 * Mode for editing a workspace state
 */
export class EditStateMode extends BaseMode<EditStateParams, StateResult> {
  /**
   * Create a new EditStateMode
   * @param agent MemoryManager agent instance
   */
  constructor(private agent: MemoryManagerAgent) {
    super(
      'editState',
      'Edit State',
      'Edits properties of an existing workspace state',
      '1.0.0'
    );
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  async execute(params: EditStateParams): Promise<StateResult> {
    try {
      // Validate parameters
      if (!params.stateId) {
        return this.prepareResult(false, undefined, 'State ID is required');
      }
      
      // If no workspace ID is provided, set it to a default value for system-wide states
      let parsedContext = parseWorkspaceContext(params.workspaceContext);
      if (!parsedContext?.workspaceId) {
        params.workspaceContext = {
          ...(typeof params.workspaceContext === 'object' ? params.workspaceContext : {}),
          workspaceId: 'system'
        };
        parsedContext = parseWorkspaceContext(params.workspaceContext);
      }
      
      const workspaceId = parsedContext?.workspaceId;
      const stateId = params.stateId;
      const name = params.name;
      const description = params.description;
      const addTags = params.addTags || [];
      const removeTags = params.removeTags || [];
      
      // Get the activity embedder
      const activityEmbedder = this.agent.getActivityEmbedder();
      if (!activityEmbedder) {
        return this.prepareResult(false, undefined, 'Activity embedder not available');
      }
      
      // Get workspace database
      const workspaceDb = this.agent.getWorkspaceDb();
      if (!workspaceDb) {
        return this.prepareResult(false, undefined, 'Workspace database not available');
      }
      
      // Initialize workspace database if needed
      if (typeof workspaceDb.initialize === 'function') {
        await workspaceDb.initialize();
      }
      
      // Get the workspace data
      const workspace = await workspaceDb.getWorkspace(workspaceId);
      if (!workspace) {
        return this.prepareResult(false, undefined, `Workspace with ID ${workspaceId} not found`);
      }
      
      // Get the state to edit
      const state = await workspaceDb.getState(stateId);
      if (!state) {
        return this.prepareResult(false, undefined, `State with ID ${stateId} not found`);
      }
      
      // Ensure the state belongs to the specified workspace
      if (state.workspaceId !== workspaceId) {
        return this.prepareResult(
          false, 
          undefined, 
          `State with ID ${stateId} does not belong to workspace with ID ${workspaceId}`
        );
      }
      
      // Edit the state
      const updatedState = { ...state };
      let isModified = false;
      
      // Update name if provided
      if (name !== undefined && name !== state.name) {
        updatedState.name = name;
        isModified = true;
      }
      
      // Update description if provided
      if (description !== undefined && description !== state.description) {
        updatedState.description = description;
        isModified = true;
      }
      
      // Update tags if provided
      if (addTags.length > 0 || removeTags.length > 0) {
        // Get current tags
        const currentTags = state.metadata?.tags || [];
        
        // Add new tags (skip duplicates)
        const tagsToAdd = addTags.filter(tag => !currentTags.includes(tag));
        
        // Remove tags
        const updatedTags = [
          ...currentTags.filter((tag: string) => !removeTags.includes(tag)),
          ...tagsToAdd
        ];
        
        // Update metadata
        updatedState.metadata = {
          ...(updatedState.metadata || {}),
          tags: updatedTags
        };
        
        isModified = isModified || tagsToAdd.length > 0 || removeTags.length > 0;
      }
      
      // Skip update if nothing changed
      if (!isModified) {
        return this.prepareResult(true, {
          stateId,
          name: state.name,
          description: state.description,
          workspaceId,
          sessionId: state.sessionId,
          timestamp: state.timestamp
        }, 'No changes were made to the state');
      }
      
      // Update the state
      await workspaceDb.updateState(stateId, updatedState);
      
      // Record a memory trace about the state update
      const stateTraceContent = `Updated state "${updatedState.name}" of workspace "${workspace.name}"
${name !== undefined ? `Updated name: ${name}\n` : ''}
${description !== undefined ? `Updated description: ${description}\n` : ''}
${addTags.length > 0 ? `Added tags: ${addTags.join(', ')}\n` : ''}
${removeTags.length > 0 ? `Removed tags: ${removeTags.join(', ')}\n` : ''}`;

      try {
        await activityEmbedder.recordActivity(
          workspaceId,
          workspace.path,
          'edit', // Using edit type for state updates
          stateTraceContent,
          {
            tool: 'memoryManager.editState',
            params: {
              stateId,
              name,
              description,
              addTags,
              removeTags,
              workspaceId
            },
            result: {
              stateId,
              name: updatedState.name,
              description: updatedState.description
            }
          },
          [], // No related files for this operation
          state.sessionId // Use the state's session ID for continuity
        );
      } catch (error) {
        console.warn(`Failed to create memory trace for state update: ${error.message}`);
      }
      
      // Return result
      return this.prepareResult(true, {
        stateId,
        name: updatedState.name,
        description: updatedState.description,
        workspaceId,
        sessionId: state.sessionId,
        timestamp: state.timestamp,
        capturedContext: {
          tags: updatedState.metadata?.tags || []
        }
      });
    } catch (error) {
      return this.prepareResult(false, undefined, `Error editing state: ${error.message}`);
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
          description: 'ID of the state to edit'
        },
        name: {
          type: 'string',
          description: 'New state name'
        },
        description: {
          type: 'string',
          description: 'New state description'
        },
        addTags: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Tags to add to the state'
        },
        removeTags: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Tags to remove from the state'
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
          description: 'ID of the updated state'
        },
        name: {
          type: 'string',
          description: 'Name of the state'
        },
        description: {
          type: 'string',
          description: 'Description of the state'
        },
        workspaceId: {
          type: 'string',
          description: 'ID of the workspace'
        },
        sessionId: {
          type: 'string',
          description: 'ID of the associated session'
        },
        timestamp: {
          type: 'number',
          description: 'State creation timestamp'
        },
        capturedContext: {
          type: 'object',
          description: 'Information about the captured context',
          properties: {
            tags: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Updated tags associated with this state'
            }
          }
        }
      },
      required: ['stateId', 'name', 'workspaceId', 'timestamp']
    };
    
    return baseSchema;
  }
}