/**
 * Execute Prompt Mode
 * Executes LLM prompts using custom agents with optional file content and actions
 */

import { BaseMode } from '../../baseMode';
import { CommonResult } from '../../../types';
import { createResult } from '../../../utils/schemaUtils';
import { mergeWithCommonSchema } from '../../../utils/schemaUtils';
import { LLMProviderManager } from '../../../services/LLMProviderManager';
import { CustomPromptStorageService } from '../../../database/services/CustomPromptStorageService';
import { AgentManager } from '../../../services/AgentManager';

export interface ExecutePromptParams {
  agent: string;
  filepaths?: string[];
  prompt: string;
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  action?: {
    type: 'create' | 'append' | 'prepend' | 'replace';
    targetPath: string;
    position?: number;
  };
  sessionId: string;
  context: string;
  workspaceContext?: any;
  handoff?: any;
}

export interface ExecutePromptResult extends CommonResult {
  data: {
    response: string;
    model: string;
    provider: string;
    agentUsed: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    cost?: {
      inputCost: number;
      outputCost: number;
      totalCost: number;
      currency: string;
    };
    filesIncluded?: string[];
    actionPerformed?: {
      type: string;
      targetPath: string;
      success: boolean;
      error?: string;
    };
  };
}

export class ExecutePromptMode extends BaseMode<ExecutePromptParams, ExecutePromptResult> {
  private providerManager: LLMProviderManager | null = null;
  private promptStorage: CustomPromptStorageService | null = null;
  private agentManager: AgentManager | null = null;

  constructor() {
    super(
      'executePrompt',
      'Execute Prompt',
      'Execute an LLM prompt using a custom agent with optional file content and ContentManager actions',
      '1.0.0'
    );
  }

  /**
   * Set the provider manager instance
   */
  setProviderManager(providerManager: LLMProviderManager): void {
    this.providerManager = providerManager;
  }

  /**
   * Set the prompt storage service
   */
  setPromptStorage(promptStorage: CustomPromptStorageService): void {
    this.promptStorage = promptStorage;
  }

  /**
   * Set the agent manager for handoff operations
   */
  setAgentManager(agentManager: AgentManager): void {
    this.agentManager = agentManager;
  }

  /**
   * Execute the prompt mode
   */
  async execute(params: ExecutePromptParams): Promise<ExecutePromptResult> {
    try {
      // Validate dependencies
      if (!this.providerManager) {
        return createResult<ExecutePromptResult>(
          false,
          undefined,
          'LLM Provider Manager not initialized',
          undefined,
          undefined,
          params.sessionId,
          params.context
        );
      }

      if (!this.promptStorage) {
        return createResult<ExecutePromptResult>(
          false,
          undefined,
          'Prompt storage service not initialized',
          undefined,
          undefined,
          params.sessionId,
          params.context
        );
      }

      // Get the custom prompt/agent
      const customPrompt = await this.promptStorage.getPromptByName(params.agent);
      if (!customPrompt) {
        return createResult<ExecutePromptResult>(
          false,
          undefined,
          `Custom prompt agent '${params.agent}' not found`,
          undefined,
          undefined,
          params.sessionId,
          params.context
        );
      }

      if (!customPrompt.isEnabled) {
        return createResult<ExecutePromptResult>(
          false,
          undefined,
          `Custom prompt agent '${params.agent}' is disabled`,
          undefined,
          undefined,
          params.sessionId,
          params.context
        );
      }

      // Execute the LLM prompt
      const llmService = this.providerManager.getLLMService();
      const result = await llmService.executePrompt({
        systemPrompt: customPrompt.prompt,
        userPrompt: params.prompt,
        filepaths: params.filepaths,
        provider: params.provider,
        model: params.model,
        temperature: params.temperature,
        maxTokens: params.maxTokens
      });

      if (!result.success) {
        return createResult<ExecutePromptResult>(
          false,
          undefined,
          result.error || 'LLM execution failed',
          undefined,
          undefined,
          params.sessionId,
          params.context
        );
      }

      // Prepare result data
      const resultData: ExecutePromptResult['data'] = {
        response: result.response || '',
        model: result.model || 'unknown',
        provider: result.provider || 'unknown',
        agentUsed: customPrompt.name,
        usage: result.usage,
        cost: result.cost,
        filesIncluded: result.filesIncluded
      };

      // Execute action if specified
      if (params.action && this.agentManager) {
        try {
          const actionResult = await this.executeContentAction(
            params.action,
            result.response || '',
            params.sessionId,
            params.context
          );

          resultData.actionPerformed = {
            type: params.action.type,
            targetPath: params.action.targetPath,
            success: actionResult.success,
            error: actionResult.error
          };
        } catch (actionError) {
          resultData.actionPerformed = {
            type: params.action.type,
            targetPath: params.action.targetPath,
            success: false,
            error: actionError instanceof Error ? actionError.message : 'Unknown action error'
          };
        }
      }

      return createResult<ExecutePromptResult>(
        true,
        resultData,
        undefined,
        undefined,
        undefined,
        params.sessionId,
        params.context
      );

    } catch (error) {
      return createResult<ExecutePromptResult>(
        false,
        undefined,
        `Failed to execute prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        undefined,
        params.sessionId,
        params.context
      );
    }
  }

  /**
   * Execute a ContentManager action with the LLM response
   */
  private async executeContentAction(
    action: { type: string; targetPath: string; position?: number },
    content: string,
    sessionId: string,
    context: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.agentManager) {
      return { success: false, error: 'Agent manager not available' };
    }

    try {
      const actionParams: any = {
        sessionId,
        context,
        content
      };

      switch (action.type) {
        case 'create':
          actionParams.path = action.targetPath;
          await this.agentManager.executeAgentMode('contentManager', 'createContent', actionParams);
          break;

        case 'append':
          actionParams.path = action.targetPath;
          await this.agentManager.executeAgentMode('contentManager', 'appendContent', actionParams);
          break;

        case 'prepend':
          actionParams.path = action.targetPath;
          await this.agentManager.executeAgentMode('contentManager', 'prependContent', actionParams);
          break;

        case 'replace':
          actionParams.path = action.targetPath;
          if (action.position !== undefined) {
            actionParams.line = action.position;
            await this.agentManager.executeAgentMode('contentManager', 'replaceByLine', actionParams);
          } else {
            await this.agentManager.executeAgentMode('contentManager', 'replaceContent', actionParams);
          }
          break;

        default:
          return { success: false, error: `Unknown action type: ${action.type}` };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get parameter schema for the mode
   */
  getParameterSchema(): any {
    return mergeWithCommonSchema({
      properties: {
        agent: {
          type: 'string',
          description: 'Custom prompt agent name/id to use as system prompt'
        },
        filepaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional array of file paths to include content as context'
        },
        prompt: {
          type: 'string',
          description: 'User prompt/question to send to the LLM'
        },
        provider: {
          type: 'string',
          description: 'LLM provider name (optional - uses default if not specified)'
        },
        model: {
          type: 'string',
          description: 'Model name (optional - uses default if not specified)'
        },
        temperature: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Temperature setting for response randomness (0.0-1.0)'
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens to generate'
        },
        action: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['create', 'append', 'prepend', 'replace'],
              description: 'ContentManager action to perform with LLM response'
            },
            targetPath: {
              type: 'string',
              description: 'File path where action should be performed'
            },
            position: {
              type: 'number',
              description: 'Line position for replace action'
            }
          },
          required: ['type', 'targetPath'],
          description: 'Optional action to perform with the LLM response'
        }
      },
      required: ['agent', 'prompt']
    });
  }

  /**
   * Get result schema for the mode
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
            response: { type: 'string' },
            model: { type: 'string' },
            provider: { type: 'string' },
            agentUsed: { type: 'string' },
            usage: {
              type: 'object',
              properties: {
                promptTokens: { type: 'number' },
                completionTokens: { type: 'number' },
                totalTokens: { type: 'number' }
              },
              required: ['promptTokens', 'completionTokens', 'totalTokens']
            },
            cost: {
              type: 'object',
              properties: {
                inputCost: { type: 'number' },
                outputCost: { type: 'number' },
                totalCost: { type: 'number' },
                currency: { type: 'string' }
              },
              required: ['inputCost', 'outputCost', 'totalCost', 'currency']
            },
            filesIncluded: {
              type: 'array',
              items: { type: 'string' }
            },
            actionPerformed: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                targetPath: { type: 'string' },
                success: { type: 'boolean' },
                error: { type: 'string' }
              },
              required: ['type', 'targetPath', 'success']
            }
          },
          required: ['response', 'model', 'provider', 'agentUsed']
        },
        sessionId: { type: 'string' },
        context: { type: 'string' }
      },
      required: ['success', 'sessionId']
    };
  }
}