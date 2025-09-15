import { BaseMode } from '../../baseMode';
import { ListAgentsParams, ListAgentsResult } from '../types';
import { CustomPromptStorageService } from '../services/CustomPromptStorageService';
import { getCommonResultSchema, createResult } from '../../../utils/schemaUtils';
import { addRecommendations } from '../../../utils/recommendationUtils';
import { AGENT_MANAGER_RECOMMENDATIONS } from '../recommendations';

/**
 * Mode for listing custom prompts
 */
export class ListAgentsMode extends BaseMode<ListAgentsParams, ListAgentsResult> {
  private storageService: CustomPromptStorageService;
  
  /**
   * Create a new ListPromptsMode
   * @param storageService Custom prompt storage service
   */
  constructor(storageService: CustomPromptStorageService) {
    super(
      'listAgents',
      'List Agents',
      'List all custom agents',
      '1.0.0'
    );
    
    this.storageService = storageService;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the list of prompts
   */
  async execute(params: ListAgentsParams): Promise<ListAgentsResult> {
    try {
      const { enabledOnly = false } = params;
      
      // Get prompts based on filter
      const allPrompts = this.storageService.getAllPrompts();
      const enabledPrompts = this.storageService.getEnabledPrompts();
      
      const prompts = enabledOnly ? enabledPrompts : allPrompts;
      
      // Map to return only name and description for listing
      const promptList = prompts.map(prompt => ({
        id: prompt.id,
        name: prompt.name,
        description: prompt.description,
        isEnabled: prompt.isEnabled
      }));

      // Add warning message about execute mode
      const warningMessage = "IMPORTANT: Do not use the executePrompt mode or run any tasks automatically when working with these agents. Only take on their persona and respond in character. If the user wants you to actually execute tasks or use the executePrompt functionality, they must explicitly ask you to do so.";
      
      const result = createResult<ListAgentsResult>(true, {
        prompts: promptList,
        totalCount: allPrompts.length,
        enabledCount: enabledPrompts.length,
        message: warningMessage
      }, undefined, undefined, undefined, params.context.sessionId, params.context);
      
      return addRecommendations(result, AGENT_MANAGER_RECOMMENDATIONS.listAgents);
    } catch (error) {
      return createResult<ListAgentsResult>(false, null, `Failed to list prompts: ${error}`, undefined, undefined, params.context.sessionId, params.context);
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
        enabledOnly: {
          type: 'boolean',
          description: 'If true, only return enabled prompts',
          default: false
        }
      },
      required: []
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
            prompts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  isEnabled: { type: 'boolean' }
                },
                required: ['id', 'name', 'description', 'isEnabled']
              }
            },
            totalCount: { type: 'number' },
            enabledCount: { type: 'number' },
            message: { type: 'string', description: 'Warning message about execute mode usage' }
          },
          required: ['prompts', 'totalCount', 'enabledCount', 'message']
        }
      }
    };
  }
}