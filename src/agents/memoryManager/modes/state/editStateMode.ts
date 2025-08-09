import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../MemoryManager';
import { EditStateParams, StateResult } from '../../types';
import { parseWorkspaceContext } from '../../../../utils/contextUtils';
// Memory service is used indirectly through the agent
// Workspace service is used indirectly through the agent
import { WorkspaceStateSnapshot } from '../../../../database/workspace-types';
import { extractContextFromParams } from '../../../../utils/contextUtils';

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
      
      // Get services asynchronously to ensure they're initialized
      const memoryService = await this.agent.getMemoryServiceAsync();
      const workspaceService = await this.agent.getWorkspaceServiceAsync();
      
      if (!memoryService || !workspaceService) {
        return this.prepareResult(false, undefined, 'Memory or workspace services not available');
      }
      
      // Resolve workspace ID properly
      let workspaceId: string;
      let parsedContext = parseWorkspaceContext(params.workspaceContext);
      
      if (parsedContext?.workspaceId) {
        // Use provided workspace ID
        workspaceId = parsedContext.workspaceId;
      } else {
        // Find the first available workspace
        const workspaces = await workspaceService.getWorkspaces({ 
          sortBy: 'lastAccessed', 
          sortOrder: 'desc'
        });
        
        if (workspaces && workspaces.length > 0) {
          workspaceId = workspaces[0].id;
        } else {
          return this.prepareResult(false, undefined, 'No workspace available. Please create a workspace first.');
        }
      }
      const stateId = params.stateId;
      const name = params.name;
      const description = params.description;
      const addTags = params.addTags || [];
      const removeTags = params.removeTags || [];
      
      // Get the workspace data
      const workspace = await workspaceService.getWorkspace(workspaceId || '');
      if (!workspace) {
        return this.prepareResult(false, undefined, `Workspace with ID ${workspaceId} not found`);
      }
      
      // Get the state to edit
      const state = await memoryService.getSnapshot(stateId);
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
      const updatedState: Partial<WorkspaceStateSnapshot> = {};
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
      let updatedTags: string[] = [];
      if (addTags.length > 0 || removeTags.length > 0) {
        // Get current tags from state metadata
        const currentTags = state.state?.metadata?.tags || [];
        
        // Add new tags (skip duplicates)
        const tagsToAdd = addTags.filter(tag => !currentTags.includes(tag));
        
        // Remove tags
        updatedTags = [
          ...currentTags.filter((tag: string) => !removeTags.includes(tag)),
          ...tagsToAdd
        ];
        
        // Check if tags actually changed
        const currentTagsSet = new Set(currentTags.filter((tag: any) => typeof tag === 'string') as string[]);
        const updatedTagsSet = new Set(updatedTags);
        const tagsChanged = currentTags.length !== updatedTags.length || 
                           ![...currentTagsSet].every((tag: string) => updatedTagsSet.has(tag));
        
        // Update state if tags changed
        if (tagsChanged) {
          // We need to make a deep copy of the state to modify the nested metadata
          updatedState.state = {
            workspace: state.state?.workspace || {},
            recentTraces: state.state?.recentTraces || [],
            contextFiles: state.state?.contextFiles || [],
            metadata: {
              ...(state.state?.metadata || {}),
              tags: updatedTags
            }
          };
          
          isModified = true;
        }
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
      
      // Note: This would be a good place to add an updateSnapshot method to MemoryService
      // TODO: Add updateSnapshot method to MemoryService
      console.warn('Missing updateSnapshot method in MemoryService - consider implementing for ChromaDB integration');
      
      // Record a memory trace about the state update
      const stateTraceContent = `Updated state "${updatedState.name || state.name}" of workspace "${workspace.name}"
${name !== undefined ? `Updated name: ${name}\n` : ''}
${description !== undefined ? `Updated description: ${description}\n` : ''}
${addTags.length > 0 ? `Added tags: ${addTags.join(', ')}\n` : ''}
${removeTags.length > 0 ? `Removed tags: ${removeTags.join(', ')}\n` : ''}`;

      try {
        // Create memory trace using MemoryService
        await memoryService.storeMemoryTrace({
          sessionId: state.sessionId,
          workspaceId: workspaceId,
          timestamp: Date.now(),
          content: stateTraceContent,
          activityType: 'checkpoint',
          metadata: {
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
              name: updatedState.name || state.name,
              description: updatedState.description || state.description
            },
            relatedFiles: []
          },
          workspacePath: workspace.path || [],
          contextLevel: workspace.hierarchyType || 'workspace',
          importance: 0.5,
          tags: []
        });
        
        // For backward compatibility
        // Note: This is a transitional approach during Chroma integration
        const activityEmbedder = (this.agent as any).plugin?.getActivityEmbedder?.();
        if (activityEmbedder && typeof activityEmbedder.recordActivity === 'function') {
          await activityEmbedder.recordActivity(
            workspaceId,
            workspace.path || [],
            'edit',
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
                name: updatedState.name || state.name,
                description: updatedState.description || state.description
              }
            },
            [], // No related files for this operation
            state.sessionId
          );
        }
      } catch (error) {
        console.warn(`Failed to create memory trace for state update: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Return result
      return this.prepareResult(true, {
        stateId,
        name: updatedState.name || state.name,
        description: updatedState.description || state.description,
        workspaceId,
        sessionId: state.sessionId,
        timestamp: state.timestamp,
        capturedContext: {
          tags: updatedTags.length > 0 ? updatedTags : (state.state?.metadata?.tags || [])
        }
      });
    } catch (error) {
      return this.prepareResult(false, undefined, `Error editing state: ${error instanceof Error ? error.message : String(error)}`);
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