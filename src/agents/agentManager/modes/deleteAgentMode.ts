import { BaseMode } from '../../baseMode';
import { DeleteAgentParams, DeleteAgentResult } from '../types';
import { CustomPromptStorageService } from '../services/CustomPromptStorageService';
import { getCommonResultSchema, createResult } from '../../../utils/schemaUtils';

/**
 * Mode for deleting a custom prompt
 */
export class DeleteAgentMode extends BaseMode<DeleteAgentParams, DeleteAgentResult> {
  private storageService: CustomPromptStorageService;
  
  /**
   * Create a new DeletePromptMode
   * @param storageService Custom prompt storage service
   */
  constructor(storageService: CustomPromptStorageService) {
    super(
      'deleteAgent',
      'Delete Agent',
      'Delete a custom agent',
      '1.0.0'
    );
    
    this.storageService = storageService;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with deletion result
   */
  async execute(params: DeleteAgentParams): Promise<DeleteAgentResult> {
    try {
      const { id } = params;
      
      // Validate required ID
      if (!id?.trim()) {
        return createResult<DeleteAgentResult>(false, null, 'ID is required', undefined, undefined, params.context.sessionId, params.context);
      }
      
      // Check if prompt exists before deletion
      const existingPrompt = this.storageService.getPrompt(id.trim());
      if (!existingPrompt) {
        return createResult<DeleteAgentResult>(false, null, `Prompt with ID "${id}" not found`, undefined, undefined, params.context.sessionId, params.context);
      }
      
      // Delete the prompt
      const deleted = await this.storageService.deletePrompt(id.trim());
      
      return createResult<DeleteAgentResult>(true, {
        deleted,
        id: id.trim()
      }, undefined, undefined, undefined, params.context.sessionId, params.context);
    } catch (error) {
      return createResult<DeleteAgentResult>(false, null, `Failed to delete prompt: ${error}`, undefined, undefined, params.context.sessionId, params.context);
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
          description: 'Unique ID of the prompt to delete',
          minLength: 1
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
            deleted: { type: 'boolean' },
            id: { type: 'string' }
          },
          required: ['deleted', 'id']
        }
      }
    };
  }
}