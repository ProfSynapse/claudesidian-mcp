import { BaseMode } from '../../baseMode';
import { DeletePromptParams, DeletePromptResult } from '../types';
import { CustomPromptStorageService } from '../../../database/services/CustomPromptStorageService';
import { mergeWithCommonSchema, getCommonResultSchema } from '../../../utils/schemaUtils';
import { extractContextFromParams } from '../../../utils/contextUtils';

/**
 * Mode for deleting a custom prompt
 */
export class DeletePromptMode extends BaseMode<DeletePromptParams, DeletePromptResult> {
  private storageService: CustomPromptStorageService;
  
  /**
   * Create a new DeletePromptMode
   * @param storageService Custom prompt storage service
   */
  constructor(storageService: CustomPromptStorageService) {
    super(
      'delete',
      'Delete Prompt',
      'Delete a custom prompt agent',
      '1.0.0'
    );
    
    this.storageService = storageService;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with deletion result
   */
  async execute(params: DeletePromptParams): Promise<DeletePromptResult> {
    try {
      const { id } = params;
      
      // Validate required ID
      if (!id?.trim()) {
        return this.prepareResult(false, null, 'ID is required', extractContextFromParams(params));
      }
      
      // Check if prompt exists before deletion
      const existingPrompt = this.storageService.getPrompt(id.trim());
      if (!existingPrompt) {
        return this.prepareResult(false, null, `Prompt with ID "${id}" not found`, extractContextFromParams(params));
      }
      
      // Delete the prompt
      const deleted = await this.storageService.deletePrompt(id.trim());
      
      return this.prepareResult(true, {
        deleted,
        id: id.trim()
      }, undefined, extractContextFromParams(params));
    } catch (error) {
      return this.prepareResult(false, null, `Failed to delete prompt: ${error}`, extractContextFromParams(params));
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
          description: 'Unique ID of the prompt to delete',
          minLength: 1
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