import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { EditSessionParams, SessionResult } from '../../types';
import { extractContextFromParams } from '../../../../utils/contextUtils';

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
      
      // Get services
      const memoryService = this.agent.getMemoryService();
      if (!memoryService) {
        return this.prepareResult(false, undefined, 'Memory service not available');
      }
      
      // Extract parameters
      const sessionId = params.sessionId;
      const name = params.name;
      const description = params.description;
      const sessionGoal = params.sessionGoal;
      const isActive = params.isActive;
      const addTags = params.addTags || [];
      const removeTags = params.removeTags || [];
      
      // Get the session
      const session = await memoryService.getSession(sessionId);
      if (!session) {
        return this.prepareResult(false, undefined, `Session with ID ${sessionId} not found`);
      }
      
      // Prepare updates
      const updates: any = {};
      
      // Only include properties that are provided in the params
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (isActive !== undefined) {
        updates.status = isActive ? 'active' : 'completed';
        
        // If we're marking as inactive, also set the end time
        if (!isActive) {
          updates.endTime = Date.now();
        } else if (session.endTime) {
          // If reactivating, clear the end time
          updates.endTime = undefined;
        }
      }
      
      // Handle tags
      if (addTags.length > 0 || removeTags.length > 0) {
        // Get current tags from session or use empty array
        // Handle tags - they may not exist in the interface but we need to support them
        const currentTags = (session as any).tags || [];
        
        // Add new tags (don't add duplicates)
        const newTags = [...currentTags];
        addTags.forEach(tag => {
          if (!newTags.includes(tag)) {
            newTags.push(tag);
          }
        });
        
        // Remove tags
        const finalTags = newTags.filter(tag => !removeTags.includes(tag));
        
        // Only update if there's a change
        if (JSON.stringify(currentTags) !== JSON.stringify(finalTags)) {
          updates.tags = finalTags;
        }
      }
      
      // Apply session goal update if provided
      if (sessionGoal !== undefined) {
        // If no description update already, update it to include the goal
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
        
        // Create a memory trace about the goal change
        try {
          await memoryService.storeMemoryTrace({
            sessionId: sessionId,
            workspaceId: session.workspaceId,
            timestamp: Date.now(),
            content: `Session goal updated to: ${sessionGoal}`,
            activityType: 'project_plan',
            metadata: {
              tool: 'memoryManager.editSession',
              params: {
                sessionId,
                sessionGoal
              },
              result: {
                sessionId,
                updated: true
              },
              relatedFiles: []
            },
            workspacePath: [],
            contextLevel: 'workspace',
            importance: 0.6,
            tags: []
          });
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`Failed to record session goal update: ${errorMessage}`);
          // This is non-critical, so we continue
        }
      }
      
      // Only update if there are changes to make
      if (Object.keys(updates).length > 0) {
        await memoryService.updateSession(sessionId, updates);
        
        // Get the updated session to ensure we have the latest state
        const finalSession = await memoryService.getSession(sessionId);
        
        if (!finalSession) {
          return this.prepareResult(false, undefined, `Session with ID ${sessionId} not found after update`);
        }
        
        return this.prepareResult(true, {
          sessionId: finalSession.id,
          name: finalSession.name,
          description: finalSession.description,
          workspaceId: finalSession.workspaceId,
          startTime: finalSession.startTime,
          endTime: finalSession.endTime,
          isActive: finalSession.isActive,
          tags: (finalSession as any).tags || []
        });
      } else {
        return this.prepareResult(true, {
          sessionId: session.id,
          name: session.name,
          description: session.description,
          workspaceId: session.workspaceId,
          startTime: session.startTime,
          endTime: session.endTime,
          isActive: session.isActive,
          tags: (session as any).tags || []
        }, 'No changes were made');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.prepareResult(false, undefined, `Error editing session: ${errorMessage}`);
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