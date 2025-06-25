import { BaseMode } from '../../baseMode';
import { UpdatePromptParams, UpdatePromptResult } from '../types';
import { CustomPromptStorageService } from '../../../database/services/CustomPromptStorageService';
import { mergeWithCommonSchema } from '../../../utils/schemaUtils';

/**
 * Mode for updating an existing custom prompt
 */
export class UpdatePromptMode extends BaseMode<UpdatePromptParams, UpdatePromptResult> {
  private storageService: CustomPromptStorageService;
  
  /**
   * Create a new UpdatePromptMode
   * @param storageService Custom prompt storage service
   */
  constructor(storageService: CustomPromptStorageService) {
    super(
      'update',
      'Update Prompt',
      'Update an existing custom prompt agent',
      '1.0.0'
    );
    
    this.storageService = storageService;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the updated prompt
   */
  async execute(params: UpdatePromptParams): Promise<UpdatePromptResult> {
    try {
      const { id, name, description, prompt, isEnabled } = params;
      
      // Validate required ID
      if (!id?.trim()) {
        return this.prepareResult(false, null, 'ID is required');
      }
      
      // Check that at least one field is being updated
      if (name === undefined && description === undefined && prompt === undefined && isEnabled === undefined) {
        return this.prepareResult(false, null, 'At least one field must be provided for update');
      }
      
      // Prepare updates object
      const updates: any = {};
      
      if (name !== undefined) {
        if (!name.trim()) {
          return this.prepareResult(false, null, 'Name cannot be empty');
        }
        updates.name = name.trim();
      }
      
      if (description !== undefined) {
        if (!description.trim()) {
          return this.prepareResult(false, null, 'Description cannot be empty');
        }
        updates.description = description.trim();
      }
      
      if (prompt !== undefined) {
        if (!prompt.trim()) {
          return this.prepareResult(false, null, 'Prompt text cannot be empty');
        }
        updates.prompt = prompt.trim();
      }
      
      if (isEnabled !== undefined) {
        updates.isEnabled = isEnabled;
      }
      
      // Update the prompt
      const updatedPrompt = await this.storageService.updatePrompt(id.trim(), updates);
      
      return this.prepareResult(true, updatedPrompt);
    } catch (error) {
      return this.prepareResult(false, null, `Failed to update prompt: ${error}`);
    }
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    const customSchema = {
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
          minLength: 1,
          maxLength: 10000
        },
        isEnabled: {
          type: 'boolean',
          description: 'Whether the prompt is enabled'
        }
      },
      required: ['id']
    };

    return mergeWithCommonSchema(customSchema);
  }
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        error: { type: 'string' },
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
        sessionId: { type: 'string' },
        context: { type: 'string' },
        workspaceContext: { type: 'object' }
      },
      required: ['success']
    };
  }
}