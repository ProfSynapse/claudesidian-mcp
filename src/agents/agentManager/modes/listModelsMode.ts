/**
 * List Models Mode
 * Lists available LLM models from enabled providers with capabilities and pricing
 */

import { BaseMode } from '../../baseMode';
import { CommonResult } from '../../../types';
import { createResult } from '../../../utils/schemaUtils';
import { mergeWithCommonSchema } from '../../../utils/schemaUtils';
import { LLMProviderManager, ModelWithProvider } from '../../../services/LLMProviderManager';

export interface ListModelsParams {
  sessionId: string;
  context: string;
  workspaceContext?: any;
  handoff?: any;
}

export interface ListModelsResult extends CommonResult {
  data: {
    models: Array<{
      provider: string;
      model: string;
      displayName: string;
      userDescription?: string;
      isDefault: boolean;
      capabilities: {
        contextWindow: number;
        maxOutputTokens?: number;
        supportsJSON: boolean;
        supportsImages: boolean;
        supportsFunctions: boolean;
        supportsStreaming: boolean;
        supportsThinking?: boolean;
      };
      pricing: {
        inputPerMillion: number;
        outputPerMillion: number;
        currency: string;
        lastUpdated: string;
      };
    }>;
    defaultModel: {
      provider: string;
      model: string;
    };
    statistics: {
      totalModels: number;
      providerCount: number;
      averageContextWindow: number;
      maxContextWindow: number;
      minCostPerMillion: number;
      maxCostPerMillion: number;
    };
    availableProviders: Array<{
      id: string;
      name: string;
      description: string;
      isEnabled: boolean;
      userDescription?: string;
      modelCount: number;
    }>;
  };
}

export class ListModelsMode extends BaseMode<ListModelsParams, ListModelsResult> {
  private providerManager: LLMProviderManager | null = null;

  constructor() {
    super(
      'listModels',
      'List Available Models',
      'List all available LLM models from enabled providers with capabilities, pricing, and statistics',
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
   * Execute the list models mode
   */
  async execute(params: ListModelsParams): Promise<ListModelsResult> {
    try {
      if (!this.providerManager) {
        return createResult<ListModelsResult>(
          false,
          undefined,
          'LLM Provider Manager not initialized',
          undefined,
          undefined,
          params.sessionId,
          params.context
        );
      }

      // Get all available models
      const models = await this.providerManager.getAvailableModels();
      
      // Get provider information
      const enabledProviders = this.providerManager.getEnabledProviders();
      
      // Get statistics
      const statistics = await this.providerManager.getModelStatistics();
      
      // Get default model
      const defaultModel = this.providerManager.getLLMService().getDefaultModel();

      // Group models by provider for counting
      const modelsByProvider = models.reduce((acc, model) => {
        acc[model.provider] = (acc[model.provider] || 0) + 1;
        return acc;
      }, {} as { [key: string]: number });

      // Format the response
      const formattedModels = models.map(model => ({
        provider: model.provider,
        model: model.id,
        displayName: model.name,
        userDescription: model.userDescription,
        isDefault: model.isDefault || false,
        capabilities: {
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          supportsJSON: model.supportsJSON,
          supportsImages: model.supportsImages,
          supportsFunctions: model.supportsFunctions,
          supportsStreaming: model.supportsStreaming,
          supportsThinking: model.supportsThinking
        },
        pricing: {
          inputPerMillion: model.pricing.inputPerMillion,
          outputPerMillion: model.pricing.outputPerMillion,
          currency: model.pricing.currency,
          lastUpdated: model.pricing.lastUpdated
        }
      }));

      // Format provider information
      const availableProviders = enabledProviders.map(provider => ({
        id: provider.id,
        name: provider.name,
        description: provider.description,
        isEnabled: provider.isEnabled,
        userDescription: provider.userDescription,
        modelCount: modelsByProvider[provider.id] || 0
      }));

      const resultData = {
        models: formattedModels,
        defaultModel,
        statistics,
        availableProviders
      };

      return createResult<ListModelsResult>(
        true,
        resultData,
        undefined,
        undefined,
        undefined,
        params.sessionId,
        params.context
      );

    } catch (error) {
      return createResult<ListModelsResult>(
        false,
        undefined,
        `Failed to list models: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        undefined,
        params.sessionId,
        params.context
      );
    }
  }

  /**
   * Get parameter schema for the mode
   */
  getParameterSchema(): any {
    return mergeWithCommonSchema({
      properties: {
        // No additional parameters beyond common ones
      },
      required: []
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
            models: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  provider: { type: 'string' },
                  model: { type: 'string' },
                  displayName: { type: 'string' },
                  userDescription: { type: 'string' },
                  isDefault: { type: 'boolean' },
                  capabilities: {
                    type: 'object',
                    properties: {
                      contextWindow: { type: 'number' },
                      maxOutputTokens: { type: 'number' },
                      supportsJSON: { type: 'boolean' },
                      supportsImages: { type: 'boolean' },
                      supportsFunctions: { type: 'boolean' },
                      supportsStreaming: { type: 'boolean' },
                      supportsThinking: { type: 'boolean' }
                    },
                    required: ['contextWindow', 'supportsJSON', 'supportsImages', 'supportsFunctions', 'supportsStreaming']
                  },
                  pricing: {
                    type: 'object',
                    properties: {
                      inputPerMillion: { type: 'number' },
                      outputPerMillion: { type: 'number' },
                      currency: { type: 'string' },
                      lastUpdated: { type: 'string' }
                    },
                    required: ['inputPerMillion', 'outputPerMillion', 'currency', 'lastUpdated']
                  }
                },
                required: ['provider', 'model', 'displayName', 'isDefault', 'capabilities', 'pricing']
              }
            },
            defaultModel: {
              type: 'object',
              properties: {
                provider: { type: 'string' },
                model: { type: 'string' }
              },
              required: ['provider', 'model']
            },
            statistics: {
              type: 'object',
              properties: {
                totalModels: { type: 'number' },
                providerCount: { type: 'number' },
                averageContextWindow: { type: 'number' },
                maxContextWindow: { type: 'number' },
                minCostPerMillion: { type: 'number' },
                maxCostPerMillion: { type: 'number' }
              },
              required: ['totalModels', 'providerCount', 'averageContextWindow', 'maxContextWindow', 'minCostPerMillion', 'maxCostPerMillion']
            },
            availableProviders: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  isEnabled: { type: 'boolean' },
                  userDescription: { type: 'string' },
                  modelCount: { type: 'number' }
                },
                required: ['id', 'name', 'description', 'isEnabled', 'modelCount']
              }
            }
          },
          required: ['models', 'defaultModel', 'statistics', 'availableProviders']
        },
        sessionId: { type: 'string' },
        context: { type: 'string' }
      },
      required: ['success', 'sessionId']
    };
  }
}