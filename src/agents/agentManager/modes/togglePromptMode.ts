import { BaseMode } from '../../baseMode';
import { TogglePromptParams, TogglePromptResult } from '../types';
import { CustomPromptStorageService } from '../services/CustomPromptStorageService';
import { getCommonResultSchema, createResult } from '../../../utils/schemaUtils';

/**
 * Mode for toggling a custom prompt's enabled state
 */
export class TogglePromptMode extends BaseMode<TogglePromptParams, TogglePromptResult> {
  private storageService: CustomPromptStorageService;
  
  /**
   * Create a new TogglePromptMode
   * @param storageService Custom prompt storage service
   */
  constructor(storageService: CustomPromptStorageService) {
    super(
      'toggle',
      'Toggle Prompt',
      'Toggle a custom prompt agent enabled/disabled state',
      '1.0.0'
    );
    
    this.storageService = storageService;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the toggled prompt
   */
  async execute(params: TogglePromptParams): Promise<TogglePromptResult> {
    try {
      const { id } = params;
      
      // Validate required ID
      if (!id?.trim()) {
        return createResult<TogglePromptResult>(false, null, 'ID is required', undefined, undefined, params.context.sessionId, params.context);
      }
      
      // Toggle the prompt
      const toggledPrompt = await this.storageService.togglePrompt(id.trim());
      
      return createResult<TogglePromptResult>(true, toggledPrompt, undefined, undefined, undefined, params.context.sessionId, params.context);
    } catch (error) {
      return createResult<TogglePromptResult>(false, null, `Failed to toggle prompt: ${error}`, undefined, undefined, params.context.sessionId, params.context);
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
          description: 'Unique ID of the prompt to toggle',
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
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            prompt: { type: 'string' },
            isEnabled: { type: 'boolean' }
          },
          required: ['id', 'name', 'description', 'prompt', 'isEnabled']
        }
      }
    };
  }
}