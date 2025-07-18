import { BaseMode } from '../../baseMode';
import { GetPromptParams, GetPromptResult } from '../types';
import { CustomPromptStorageService } from '../../../database/services/CustomPromptStorageService';
import { mergeWithCommonSchema, getCommonResultSchema } from '../../../utils/schemaUtils';
import { extractContextFromParams } from '../../../utils/contextUtils';

/**
 * Mode for getting a specific custom prompt
 */
export class GetPromptMode extends BaseMode<GetPromptParams, GetPromptResult> {
  private storageService: CustomPromptStorageService;
  
  /**
   * Create a new GetPromptMode
   * @param storageService Custom prompt storage service
   */
  constructor(storageService: CustomPromptStorageService) {
    super(
      'get',
      'Get Prompt',
      'Get a specific custom prompt agent by ID or name',
      '1.0.0'
    );
    
    this.storageService = storageService;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the prompt data
   */
  async execute(params: GetPromptParams): Promise<GetPromptResult> {
    try {
      const { id, name } = params;
      
      // Must provide either id or name
      if (!id && !name) {
        return this.prepareResult(false, null, 'Either id or name must be provided', extractContextFromParams(params));
      }
      
      // Get prompt by id or name
      let prompt = null;
      if (id) {
        prompt = this.storageService.getPrompt(id);
      } else if (name) {
        prompt = this.storageService.getPromptByName(name);
      }
      
      if (!prompt) {
        const identifier = id ? `ID "${id}"` : `name "${name}"`;
        return this.prepareResult(false, null, `Prompt with ${identifier} not found`, extractContextFromParams(params));
      }
      
      return this.prepareResult(true, prompt, undefined, extractContextFromParams(params));
    } catch (error) {
      return this.prepareResult(false, null, `Failed to get prompt: ${error}`, extractContextFromParams(params));
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
          description: 'Unique ID of the prompt to retrieve (either id or name must be provided)'
        },
        name: {
          type: 'string',
          description: 'Name of the prompt to retrieve (either id or name must be provided)'
        }
      },
      required: []
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
          required: ['id', 'name', 'description', 'prompt', 'isEnabled'],
          description: 'Prompt data (null if not found)'
        }
      }
    };
  }
}