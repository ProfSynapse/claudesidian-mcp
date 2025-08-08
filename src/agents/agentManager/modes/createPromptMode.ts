import { BaseMode } from '../../baseMode';
import { CreatePromptParams, CreatePromptResult } from '../types';
import { CustomPromptStorageService } from '../services/CustomPromptStorageService';
import { mergeWithCommonSchema, getCommonResultSchema } from '../../../utils/schemaUtils';
import { extractContextFromParams } from '../../../utils/contextUtils';

/**
 * Mode for creating a new custom prompt
 */
export class CreatePromptMode extends BaseMode<CreatePromptParams, CreatePromptResult> {
  private storageService: CustomPromptStorageService;
  
  /**
   * Create a new CreatePromptMode
   * @param storageService Custom prompt storage service
   */
  constructor(storageService: CustomPromptStorageService) {
    super(
      'create',
      'Create Prompt',
      'Create a new custom prompt agent',
      '1.0.0'
    );
    
    this.storageService = storageService;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the created prompt
   */
  async execute(params: CreatePromptParams): Promise<CreatePromptResult> {
    try {
      const { name, description, prompt, isEnabled = true } = params;
      
      // Validate required fields
      if (!name?.trim()) {
        return this.prepareResult(false, null, 'Name is required', extractContextFromParams(params));
      }
      
      if (!description?.trim()) {
        return this.prepareResult(false, null, 'Description is required', extractContextFromParams(params));
      }
      
      if (!prompt?.trim()) {
        return this.prepareResult(false, null, 'Prompt text is required', extractContextFromParams(params));
      }
      
      // Create the prompt
      const newPrompt = await this.storageService.createPrompt({
        name: name.trim(),
        description: description.trim(),
        prompt: prompt.trim(),
        isEnabled
      });
      
      return this.prepareResult(true, newPrompt, undefined, extractContextFromParams(params));
    } catch (error) {
      return this.prepareResult(false, null, `Failed to create prompt: ${error}`, extractContextFromParams(params));
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
        name: {
          type: 'string',
          description: 'Name of the prompt (must be unique)',
          minLength: 1,
          maxLength: 100
        },
        description: {
          type: 'string',
          description: 'Description of what this prompt does',
          minLength: 1,
          maxLength: 500
        },
        prompt: {
          type: 'string',
          description: 'The actual prompt text/persona',
          minLength: 1
        },
        isEnabled: {
          type: 'boolean',
          description: 'Whether the prompt is enabled',
          default: true
        }
      },
      required: ['name', 'description', 'prompt']
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