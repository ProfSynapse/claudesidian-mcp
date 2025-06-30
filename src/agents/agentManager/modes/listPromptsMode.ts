import { BaseMode } from '../../baseMode';
import { ListPromptsParams, ListPromptsResult } from '../types';
import { CustomPromptStorageService } from '../../../database/services/CustomPromptStorageService';
import { mergeWithCommonSchema } from '../../../utils/schemaUtils';
import { extractContextFromParams } from '../../../utils/contextUtils';

/**
 * Mode for listing custom prompts
 */
export class ListPromptsMode extends BaseMode<ListPromptsParams, ListPromptsResult> {
  private storageService: CustomPromptStorageService;
  
  /**
   * Create a new ListPromptsMode
   * @param storageService Custom prompt storage service
   */
  constructor(storageService: CustomPromptStorageService) {
    super(
      'list',
      'List Prompts',
      'List all custom prompt agents',
      '1.0.0'
    );
    
    this.storageService = storageService;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the list of prompts
   */
  async execute(params: ListPromptsParams): Promise<ListPromptsResult> {
    try {
      const { enabledOnly = false } = params;
      
      // Get prompts based on filter
      const allPrompts = this.storageService.getAllPrompts();
      const enabledPrompts = this.storageService.getEnabledPrompts();
      
      const prompts = enabledOnly ? enabledPrompts : allPrompts;
      
      // Map to return only necessary fields for listing
      const promptList = prompts.map(prompt => ({
        id: prompt.id,
        name: prompt.name,
        description: prompt.description,
        isEnabled: prompt.isEnabled
      }));
      
      return this.prepareResult(true, {
        prompts: promptList,
        totalCount: allPrompts.length,
        enabledCount: enabledPrompts.length
      });
    } catch (error) {
      return this.prepareResult(false, null, `Failed to list prompts: ${error}`);
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
        enabledOnly: {
          type: 'boolean',
          description: 'If true, only return enabled prompts',
          default: false
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
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        error: { type: 'string' },
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
            enabledCount: { type: 'number' }
          },
          required: ['prompts', 'totalCount', 'enabledCount']
        },
        sessionId: { type: 'string' },
        context: { type: 'string' },
        workspaceContext: { type: 'object' }
      },
      required: ['success']
    };
  }
}