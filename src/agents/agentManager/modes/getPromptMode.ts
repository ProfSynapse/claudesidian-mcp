import { BaseMode } from '../../baseMode';
import { GetPromptParams, GetPromptResult } from '../types';
import { CustomPromptStorageService } from '../services/CustomPromptStorageService';
import { getCommonResultSchema } from '../../../utils/schemaUtils';
import { extractContextFromParams } from '../../../utils/contextUtils';
import { addRecommendations } from '../../../utils/recommendationUtils';
import { AGENT_MANAGER_RECOMMENDATIONS } from '../recommendations';

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
        // First try as unique identifier
        prompt = this.storageService.getPrompt(id);
        // If not found, try as agent name
        if (!prompt) {
          prompt = this.storageService.getPromptByName(id);
        }
      } else if (name) {
        prompt = this.storageService.getPromptByName(name);
      }
      
      if (!prompt) {
        const identifier = id ? `ID "${id}"` : `name "${name}"`;
        return this.prepareResult(false, null, `Prompt with ${identifier} not found`, extractContextFromParams(params));
      }

      // Create message with persona instruction and warning (prompt content is already in the prompt field)
      const message = `You are now taking on the persona of "${prompt.name}".

IMPORTANT: Do not use the executePrompt mode or run any tasks automatically. Only take on the persona and respond in character. If the user wants you to actually execute tasks or use the executePrompt functionality, they must explicitly ask you to do so.`;
      
      const resultWithMessage = {
        ...prompt,
        message: message
      };
      
      const result = this.prepareResult(true, resultWithMessage, undefined, extractContextFromParams(params));
      return addRecommendations(result, AGENT_MANAGER_RECOMMENDATIONS.getPrompt);
    } catch (error) {
      return this.prepareResult(false, null, `Failed to get prompt: ${error}`, extractContextFromParams(params));
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
          description: 'Unique ID or name of the prompt to retrieve (will try ID first, then name)'
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
          oneOf: [
            { type: 'null' },
            {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                prompt: { type: 'string' },
                isEnabled: { type: 'boolean' },
                message: { type: 'string', description: 'Complete persona instructions and warning about execute mode usage' }
              },
              required: ['id', 'name', 'description', 'prompt', 'isEnabled', 'message']
            }
          ]
        }
      }
    };
  }
}