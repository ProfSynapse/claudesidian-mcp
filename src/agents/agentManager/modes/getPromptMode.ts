import { BaseMode } from '../../baseMode';
import { GetPromptParams, GetPromptResult } from '../types';
import { CustomPromptStorageService } from '../../../database/services/CustomPromptStorageService';
import { mergeWithCommonSchema } from '../../../utils/schemaUtils';

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
        return this.prepareResult(false, null, 'Either id or name must be provided');
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
        return this.prepareResult(false, null, `Prompt with ${identifier} not found`);
      }
      
      return this.prepareResult(true, prompt);
    } catch (error) {
      return this.prepareResult(false, null, `Failed to get prompt: ${error}`);
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
          description: 'Unique ID of the prompt to retrieve'
        },
        name: {
          type: 'string',
          description: 'Name of the prompt to retrieve'
        }
      },
      required: [],
      anyOf: [
        { required: ['id'] },
        { required: ['name'] }
      ]
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
          oneOf: [
            { type: 'null' },
            {
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
          ]
        },
        sessionId: { type: 'string' },
        context: { type: 'string' },
        workspaceContext: { type: 'object' }
      },
      required: ['success']
    };
  }
}