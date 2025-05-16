import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { EditSessionParams, SessionResult } from '../../types';

/**
 * Mode for editing an existing session's metadata
 */
export class EditSessionMode extends BaseMode<EditSessionParams, SessionResult> {
  /**
   * Create a new EditSessionMode
   * @param agent MemoryManager agent instance
   */
  constructor(private agent: MemoryManagerAgent) {
    super(
      'editSession',
      'Edit Session',
      'Updates an existing session\'s properties',
      '1.0.0'
    );
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  async execute(params: EditSessionParams): Promise<SessionResult> {
    try {
      // Validate required parameters
      if (!params.sessionId) {
        return this.prepareResult(false, undefined, 'Session ID is required');
      }
      
      // Extract parameters
      const sessionId = params.sessionId;
      const name = params.name;
      const description = params.description;
      const sessionGoal = params.sessionGoal;
      const isActive = params.isActive;
      const addTags = params.addTags || [];
      const removeTags = params.removeTags || [];
      
      // Get the workspace database
      const workspaceDb = this.agent.getWorkspaceDb();
      if (!workspaceDb) {
        return this.prepareResult(false, undefined, 'Workspace database not available');
      }
      
      // Initialize the database if needed
      if (typeof workspaceDb.initialize === 'function') {
        await workspaceDb.initialize();
      }
      
      // Get the session
      const session = await workspaceDb.getSession(sessionId);
      if (!session) {
        return this.prepareResult(false, undefined, `Session with ID ${sessionId} not found`);
      }
      
      // Prepare updates
      const updates: any = {};
      
      // Only include properties that are provided in the params
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (isActive !== undefined) {
        updates.isActive = isActive;
        
        // If we're marking as inactive, also set the end time
        if (!isActive) {
          updates.endTime = Date.now();
        } else if (session.endTime) {
          // If reactivating, clear the end time
          updates.endTime = undefined;
        }
      }
      
      // Apply session goal update if provided
      // Note: In a real implementation, we might want to:
      // 1. Store session goal in the session object itself
      // 2. Create a memory trace about the goal change
      if (sessionGoal !== undefined) {
        // Currently, session goal is typically stored in the description
        // If there's no description update, update it to include the goal
        if (description === undefined) {
          let newDescription = session.description || '';
          
          // Check if there's an existing goal in the description
          const goalRegex = /Goal:\s*([^\n]+)/;
          if (goalRegex.test(newDescription)) {
            // Replace the existing goal
            newDescription = newDescription.replace(goalRegex, `Goal: ${sessionGoal}`);
          } else {
            // Add a new goal
            newDescription = newDescription ? `${newDescription}\nGoal: ${sessionGoal}` : `Goal: ${sessionGoal}`;
          }
          
          updates.description = newDescription;
        }
        
        // Get the activity embedder to potentially record the goal change
        const activityEmbedder = this.agent.getActivityEmbedder();
        if (activityEmbedder) {
          try {
            await activityEmbedder.recordActivity(
              session.workspaceId,
              [], // We don't have the workspace path here - would need to fetch it
              'project_plan',
              `Session goal updated to: ${sessionGoal}`,
              {
                tool: 'memoryManager.editSession',
                params: {
                  sessionId,
                  sessionGoal
                },
                result: {
                  sessionId,
                  updated: true
                }
              },
              [],
              sessionId
            );
          } catch (error) {
            console.warn(`Failed to record session goal update: ${error.message}`);
          }
        }
      }
      
      // Apply tag updates
      // Note: In a real implementation, we'd need to extend the session store
      // to support tags directly. For now, we'll just log what we would do.
      if (addTags.length > 0 || removeTags.length > 0) {
        console.log('Would update tags:', { 
          sessionId, 
          addTags, 
          removeTags,
          // In a real implementation, we'd merge these with existing tags
        });
      }
      
      // Only update if there are changes to make
      if (Object.keys(updates).length > 0) {
        await workspaceDb.updateSession(sessionId, updates);
        
        // Get the updated session
        const updatedSession = await workspaceDb.getSession(sessionId);
        
        return this.prepareResult(true, {
          sessionId: updatedSession.id,
          name: updatedSession.name,
          description: updatedSession.description,
          workspaceId: updatedSession.workspaceId,
          startTime: updatedSession.startTime,
          endTime: updatedSession.endTime,
          isActive: updatedSession.isActive
        });
      } else {
        return this.prepareResult(true, {
          sessionId: session.id,
          name: session.name,
          description: session.description,
          workspaceId: session.workspaceId,
          startTime: session.startTime,
          endTime: session.endTime,
          isActive: session.isActive
        }, 'No changes were made');
      }
    } catch (error) {
      return this.prepareResult(false, undefined, `Error editing session: ${error.message}`);
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
          description: 'ID of the session to edit'
        },
        name: {
          type: 'string',
          description: 'New session name'
        },
        description: {
          type: 'string',
          description: 'New session description'
        },
        sessionGoal: {
          type: 'string',
          description: 'Updated goal for the session'
        },
        isActive: {
          type: 'boolean',
          description: 'Whether the session is active or completed'
        },
        addTags: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Tags to add to the session'
        },
        removeTags: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Tags to remove from the session'
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
          description: 'ID of the edited session'
        },
        name: {
          type: 'string',
          description: 'Updated session name'
        },
        description: {
          type: 'string',
          description: 'Updated session description'
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
        }
      },
      required: ['sessionId', 'workspaceId', 'isActive']
    };
    
    return baseSchema;
  }
}