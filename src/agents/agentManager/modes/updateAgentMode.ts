import { BaseMode } from '../../baseMode';
import { UpdateAgentParams, UpdateAgentResult } from '../types';
import { CustomPromptStorageService } from '../services/CustomPromptStorageService';
import { getCommonResultSchema, createResult } from '../../../utils/schemaUtils';
import { addRecommendations } from '../../../utils/recommendationUtils';
import { AGENT_MANAGER_RECOMMENDATIONS } from '../recommendations';

/**
 * Mode for updating an existing custom agent
 */
export class UpdateAgentMode extends BaseMode<UpdateAgentParams, UpdateAgentResult> {
  private storageService: CustomPromptStorageService;
  
  /**
   * Create a new UpdateAgentMode
   * @param storageService Custom prompt storage service
   */
  constructor(storageService: CustomPromptStorageService) {
    super(
      'updateAgent',
      'Update Agent',
      'Update an existing custom agent',
      '1.0.0'
    );
    
    this.storageService = storageService;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the updated prompt
   */
  async execute(params: UpdateAgentParams): Promise<UpdateAgentResult> {
    try {
      const { id, name, description, prompt, isEnabled } = params;
      
      // Validate required ID
      if (!id?.trim()) {
        return createResult<UpdateAgentResult>(false, null, 'ID is required', undefined, undefined, params.context.sessionId, params.context);
      }
      
      // Check that at least one field is being updated
      if (name === undefined && description === undefined && prompt === undefined && isEnabled === undefined) {
        return createResult<UpdateAgentResult>(false, null, 'At least one field must be provided for update', undefined, undefined, params.context.sessionId, params.context);
      }
      
      // Prepare updates object
      const updates: any = {};
      
      if (name !== undefined) {
        if (!name.trim()) {
          return createResult<UpdateAgentResult>(false, null, 'Name cannot be empty', undefined, undefined, params.context.sessionId, params.context);
        }
        updates.name = name.trim();
      }
      
      if (description !== undefined) {
        if (!description.trim()) {
          return createResult<UpdateAgentResult>(false, null, 'Description cannot be empty', undefined, undefined, params.context.sessionId, params.context);
        }
        updates.description = description.trim();
      }
      
      if (prompt !== undefined) {
        if (!prompt.trim()) {
          return createResult<UpdateAgentResult>(false, null, 'Prompt text cannot be empty', undefined, undefined, params.context.sessionId, params.context);
        }
        updates.prompt = prompt.trim();
      }
      
      if (isEnabled !== undefined) {
        updates.isEnabled = isEnabled;
      }
      
      // Update the prompt
      const updatedPrompt = await this.storageService.updatePrompt(id.trim(), updates);
      
      const result = createResult<UpdateAgentResult>(true, updatedPrompt, undefined, undefined, undefined, params.context.sessionId, params.context);
      return addRecommendations(result, AGENT_MANAGER_RECOMMENDATIONS.updateAgent);
    } catch (error) {
      return createResult<UpdateAgentResult>(false, null, `Failed to update prompt: ${error}`, undefined, undefined, params.context.sessionId, params.context);
    }
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    const modeSchema = {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Unique ID of the prompt to update',
          minLength: 1
        },
        name: {
          type: 'string',
          description: 'New name for the prompt (must be unique)',
          minLength: 1,
          maxLength: 100
        },
        description: {
          type: 'string',
          description: 'New description for the prompt',
          minLength: 1,
          maxLength: 500
        },
        prompt: {
          type: 'string',
          description: 'New prompt text/persona',
          minLength: 1
        },
        isEnabled: {
          type: 'boolean',
          description: 'Whether the prompt is enabled'
        }
      },
      required: ['id']
    };

    return this.getMergedSchema(modeSchema);
  }
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    const commonSchema = getCommonResultSchema();
    
    // Override the data property to define the specific structure for this mode
    return {
      ...commonSchema,
      properties: {
        ...commonSchema.properties,
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            prompt: { type: 'string' },
            isEnabled: { type: 'boolean' }
          },
          required: ['id', 'name', 'description', 'prompt', 'isEnabled']
        },
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              message: { type: 'string' }
            },
            required: ['type', 'message']
          },
          description: 'Workspace-agent optimization recommendations'
        }
      }
    };
  }
}