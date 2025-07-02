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
import { StaticModelsService } from '../../../services/StaticModelsService';

export interface ExecutePromptParams {
  agent?: string; // Made optional
  filepaths?: string[];
  prompt: string;
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  action?: {
    type: 'create' | 'append' | 'prepend' | 'replace' | 'findReplace';
    targetPath: string;
    position?: number;
    findText?: string; // Required for 'findReplace' type
    replaceAll?: boolean; // Optional for 'findReplace' type
    caseSensitive?: boolean; // Optional for 'findReplace' type
    wholeWord?: boolean; // Optional for 'findReplace' type
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

      // Get the custom prompt/agent if specified
      let customPrompt = null;
      let agentUsed = 'default';
      
      if (params.agent) {
        if (!this.promptStorage) {
          return createResult<ExecutePromptResult>(
            false,
            undefined,
            'Custom agent specified but prompt storage not available',
            undefined,
            undefined,
            params.sessionId,
            params.context
          );
        }
        
        customPrompt = await this.promptStorage.getPromptByName(params.agent);
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
        
        agentUsed = customPrompt.name;
      }

      // Execute the LLM prompt
      const llmService = this.providerManager.getLLMService();
      const result = await llmService.executePrompt({
        systemPrompt: customPrompt?.prompt || '', // Use custom prompt if available, otherwise empty
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
        agentUsed: agentUsed,
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
          console.error('ExecutePromptMode: Action execution failed with exception:', actionError);
          resultData.actionPerformed = {
            type: params.action.type,
            targetPath: params.action.targetPath,
            success: false,
            error: actionError instanceof Error ? actionError.message : 'Unknown action error'
          };
        }
      } else {
        console.log('ExecutePromptMode: No action specified or agent manager not available', {
          hasAction: !!params.action,
          hasAgentManager: !!this.agentManager
        });
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
    action: { 
      type: string; 
      targetPath: string; 
      position?: number;
      findText?: string;
      replaceAll?: boolean;
      caseSensitive?: boolean;
      wholeWord?: boolean;
    },
    content: string,
    sessionId: string,
    context: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log('executeContentAction called with:', {
      actionType: action.type,
      targetPath: action.targetPath,
      contentLength: content.length,
      hasAgentManager: !!this.agentManager
    });

    if (!this.agentManager) {
      console.error('executeContentAction: Agent manager not available');
      return { success: false, error: 'Agent manager not available' };
    }

    try {
      const actionParams: any = {
        sessionId,
        context,
        content
      };

      console.log('executeContentAction: Preparing to call agent with params:', {
        actionType: action.type,
        paramsKeys: Object.keys(actionParams),
        targetPath: action.targetPath
      });

      switch (action.type) {
        case 'create':
          actionParams.filePath = action.targetPath;
          console.log('executeContentAction: Calling createContent mode');
          await this.agentManager.executeAgentMode('contentManager', 'createContent', actionParams);
          break;

        case 'append':
          actionParams.filePath = action.targetPath;
          console.log('executeContentAction: Calling appendContent mode');
          await this.agentManager.executeAgentMode('contentManager', 'appendContent', actionParams);
          break;

        case 'prepend':
          actionParams.filePath = action.targetPath;
          console.log('executeContentAction: Calling prependContent mode');
          await this.agentManager.executeAgentMode('contentManager', 'prependContent', actionParams);
          break;

        case 'replace':
          actionParams.filePath = action.targetPath;
          if (action.position !== undefined) {
            actionParams.line = action.position;
            console.log('executeContentAction: Calling replaceByLine mode');
            await this.agentManager.executeAgentMode('contentManager', 'replaceByLine', actionParams);
          } else {
            console.log('executeContentAction: Calling replaceContent mode');
            await this.agentManager.executeAgentMode('contentManager', 'replaceContent', actionParams);
          }
          break;

        case 'findReplace':
          if (!action.findText) {
            console.error('executeContentAction: findText is required for findReplace action');
            return { success: false, error: 'findText is required for findReplace action' };
          }
          actionParams.filePath = action.targetPath;
          actionParams.findText = action.findText;
          actionParams.replaceText = content; // LLM response becomes the replacement text
          actionParams.replaceAll = action.replaceAll ?? false;
          actionParams.caseSensitive = action.caseSensitive ?? true;
          actionParams.wholeWord = action.wholeWord ?? false;
          console.log('executeContentAction: Calling findReplaceContent mode');
          await this.agentManager.executeAgentMode('contentManager', 'findReplaceContent', actionParams);
          break;

        default:
          console.error('executeContentAction: Unknown action type:', action.type);
          return { success: false, error: `Unknown action type: ${action.type}` };
      }

      console.log('executeContentAction: Agent mode execution completed successfully');
      return { success: true };
    } catch (error) {
      console.error('executeContentAction: Agent mode execution failed:', error);
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
    // Get dynamic options from provider manager
    const enabledProviders = this.getEnabledProviders();
    const availableModels = this.getAvailableModels();

    return mergeWithCommonSchema({
      properties: {
        agent: {
          type: 'string',
          description: 'Custom prompt agent name/id to use as system prompt (optional - if not provided, uses raw prompt only)'
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
          description: enabledProviders.length > 0 
            ? `LLM provider name (optional - uses default if not specified). Available providers: ${enabledProviders.join(', ')}`
            : 'LLM provider name (optional - uses default if not specified). No providers are currently enabled. Please configure API keys in settings.',
          ...(enabledProviders.length > 0 && { 
            enum: enabledProviders,
            examples: enabledProviders 
          })
        },
        model: {
          type: 'string',
          description: availableModels.length > 0
            ? `Model name (optional - uses default if not specified). Available models: ${availableModels.slice(0, 3).join(', ')}${availableModels.length > 3 ? '...' : ''}`
            : 'Model name (optional - uses default if not specified). No models available. Please configure provider API keys in settings.',
          ...(availableModels.length > 0 && { 
            enum: availableModels,
            examples: availableModels.slice(0, 5) // Show first 5 as examples
          })
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
              enum: ['create', 'append', 'prepend', 'replace', 'findReplace'],
              description: 'ContentManager action to perform with LLM response'
            },
            targetPath: {
              type: 'string',
              description: 'File path where action should be performed'
            },
            position: {
              type: 'number',
              description: 'Line position for replace action'
            },
            findText: {
              type: 'string',
              description: 'Text to find and replace (required for findReplace action)'
            },
            replaceAll: {
              type: 'boolean',
              description: 'Whether to replace all occurrences (default: false)',
              default: false
            },
            caseSensitive: {
              type: 'boolean',
              description: 'Whether search is case sensitive (default: true)',
              default: true
            },
            wholeWord: {
              type: 'boolean',
              description: 'Whether to match whole words only (default: false)',
              default: false
            }
          },
          required: ['type', 'targetPath'],
          description: 'Optional action to perform with the LLM response. For findReplace type, findText is required.'
        }
      },
      required: ['prompt'] // Removed 'agent' from required parameters
    });
  }

  /**
   * Get enabled providers for schema
   */
  private getEnabledProviders(): string[] {
    if (!this.providerManager) return [];
    
    try {
      const settings = this.providerManager.getSettings();
      return Object.keys(settings.providers)
        .filter(id => settings.providers[id]?.enabled && settings.providers[id]?.apiKey);
    } catch (error) {
      console.warn('Error getting enabled providers:', error);
      return [];
    }
  }

  /**
   * Get all available models from enabled providers
   */
  private getAvailableModels(): string[] {
    if (!this.providerManager) return [];
    
    try {
      const settings = this.providerManager.getSettings();
      const enabledProviders = this.getEnabledProviders();
      const models: string[] = [];
      
      enabledProviders.forEach(providerId => {
        try {
          if (providerId === 'ollama') {
            // For Ollama, include the user-configured model
            if (settings.defaultModel.provider === 'ollama' && settings.defaultModel.model) {
              models.push(settings.defaultModel.model);
            }
          } else {
            // For other providers, use static models
            const staticModelsService = StaticModelsService.getInstance();
            const providerModels = staticModelsService.getModelsForProvider(providerId);
            models.push(...providerModels.map(m => m.id));
          }
        } catch (error) {
          console.warn(`Error getting models for provider ${providerId}:`, error);
        }
      });
      
      return [...new Set(models)]; // Remove duplicates
    } catch (error) {
      console.warn('Error getting available models:', error);
      return [];
    }
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