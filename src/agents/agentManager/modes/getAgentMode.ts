import { BaseMode } from '../../baseMode';
import { GetAgentParams, GetAgentResult } from '../types';
import { CustomPromptStorageService } from '../services/CustomPromptStorageService';
import { getCommonResultSchema, createResult } from '../../../utils/schemaUtils';
import { addRecommendations } from '../../../utils/recommendationUtils';
import { AGENT_MANAGER_RECOMMENDATIONS } from '../recommendations';

/**
 * Mode for getting a specific custom agent for persona adoption
 */
export class GetAgentMode extends BaseMode<GetAgentParams, GetAgentResult> {
  private storageService: CustomPromptStorageService;
  
  /**
   * Create a new GetAgentMode
   * @param storageService Custom prompt storage service
   */
  constructor(storageService: CustomPromptStorageService) {
    super(
      'getAgent',
      'Get Agent',
      'Get a custom agent for persona adoption - does NOT execute tasks automatically',
      '1.0.0'
    );
    
    this.storageService = storageService;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the prompt data
   */
  async execute(params: GetAgentParams): Promise<GetAgentResult> {
    try {
      const { id, name } = params;
      
      // Must provide either id or name
      if (!id && !name) {
        return createResult<GetAgentResult>(false, null, 'Either id or name must be provided', undefined, undefined, params.context.sessionId, params.context);
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
        return createResult<GetAgentResult>(false, null, `Agent with ${identifier} not found`, undefined, undefined, params.context.sessionId, params.context);
      }

      // Create message with persona instruction and warning (prompt content is already in the prompt field)
      const message = `🎭 AGENT PERSONA RETRIEVED: "${prompt.name}"

⚠️  IMPORTANT EXECUTION BOUNDARY:
❌ This is PERSONA ADOPTION only - no tasks will be executed
❌ Do NOT automatically use executePrompt unless explicitly requested
❌ Do NOT run actions, create files, or modify content
✅ You may adopt this persona for conversation
✅ Ask permission before switching to execution mode

To execute tasks: User must explicitly request agentManager_executePrompt`;
      
      const resultWithMessage = {
        ...prompt,
        message: message
      };
      
      const result = createResult<GetAgentResult>(true, resultWithMessage, undefined, undefined, undefined, params.context.sessionId, params.context);
      return addRecommendations(result, AGENT_MANAGER_RECOMMENDATIONS.getAgent);
    } catch (error) {
      return createResult<GetAgentResult>(false, null, `Failed to get agent: ${error}`, undefined, undefined, params.context.sessionId, params.context);
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
          description: 'Unique ID or name of the agent to retrieve for persona adoption (will try ID first, then name)'
        },
        name: {
          type: 'string',
          description: 'Name of the agent to retrieve for persona adoption'
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