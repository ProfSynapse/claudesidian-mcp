/**
 * LLM Provider Manager
 * Handles model filtering, provider management, and model information
 */

import { ModelInfo } from './llm/adapters/types';
import { LLMProviderSettings, LLMProviderConfig } from '../types';
import { LLMService } from './LLMService';

export interface ModelWithProvider extends ModelInfo {
  provider: string;
  userDescription?: string;
  isDefault?: boolean;
  modelDescription?: string; // User-defined description for when to use this specific model
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  isAvailable: boolean;
  isEnabled: boolean;
  hasApiKey: boolean;
  userDescription?: string;
}

export class LLMProviderManager {
  private llmService: LLMService;
  private settings: LLMProviderSettings;

  constructor(settings: LLMProviderSettings) {
    this.settings = settings;
    this.llmService = new LLMService(settings);
  }

  /**
   * Update settings and reinitialize services
   */
  updateSettings(settings: LLMProviderSettings): void {
    this.settings = settings;
    this.llmService.updateSettings(settings);
  }

  /**
   * Set vault adapter for file operations
   */
  setVaultAdapter(adapter: any): void {
    this.llmService.setVaultAdapter(adapter);
  }

  /**
   * Get LLM service instance
   */
  getLLMService(): LLMService {
    return this.llmService;
  }

  /**
   * Get all available models from enabled providers only
   */
  async getAvailableModels(): Promise<ModelWithProvider[]> {
    const models = await this.llmService.getAvailableModels();
    const defaultModel = this.settings.defaultModel;

    // Filter to only enabled providers
    const enabledModels = models.filter(model => {
      const providerConfig = this.settings.providers[model.provider];
      return providerConfig && providerConfig.enabled && providerConfig.apiKey;
    });

    return enabledModels.map(model => ({
      ...model,
      isDefault: model.provider === defaultModel.provider && model.id === defaultModel.model,
      // Add user-defined model description if available
      modelDescription: this.settings.providers[model.provider]?.models?.[model.id]?.description
    }));
  }

  /**
   * Get provider information for all supported providers
   */
  getProviderInfo(): ProviderInfo[] {
    const supportedProviders = [
      {
        id: 'openai',
        name: 'OpenAI',
        description: 'GPT models including GPT-4, GPT-3.5-turbo, and specialized models'
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        description: 'Claude models with strong reasoning and safety features'
      },
      {
        id: 'google',
        name: 'Google',
        description: 'Gemini models with multimodal capabilities and thinking mode'
      },
      {
        id: 'mistral',
        name: 'Mistral',
        description: 'European models with strong coding and multilingual support'
      },
      {
        id: 'groq',
        name: 'Groq',
        description: 'Ultra-fast inference speeds for quick responses'
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        description: 'Access to 400+ models from multiple providers in one API'
      },
      {
        id: 'requesty',
        name: 'Requesty',
        description: 'Premium model access with cost optimization'
      },
      {
        id: 'perplexity',
        name: 'Perplexity',
        description: 'Web search-enabled models with real-time information and citations'
      }
    ];

    return supportedProviders.map(provider => {
      const config = this.settings.providers[provider.id];
      const isAvailable = this.llmService.isProviderAvailable(provider.id);

      return {
        ...provider,
        isAvailable,
        isEnabled: config?.enabled || false,
        hasApiKey: !!(config?.apiKey && config.apiKey.length > 0),
        userDescription: config?.userDescription
      };
    });
  }

  /**
   * Get enabled provider information only
   */
  getEnabledProviders(): ProviderInfo[] {
    return this.getProviderInfo().filter(provider => provider.isEnabled && provider.hasApiKey);
  }

  /**
   * Get models for a specific provider (if enabled)
   */
  async getModelsForProvider(providerId: string): Promise<ModelWithProvider[]> {
    const allModels = await this.getAvailableModels();
    return allModels.filter(model => model.provider === providerId);
  }

  /**
   * Get models grouped by provider
   */
  async getModelsByProvider(): Promise<{ [providerId: string]: ModelWithProvider[] }> {
    const models = await this.getAvailableModels();
    const grouped: { [providerId: string]: ModelWithProvider[] } = {};

    models.forEach(model => {
      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }
      grouped[model.provider].push(model);
    });

    return grouped;
  }

  /**
   * Find a specific model by provider and model ID
   */
  async findModel(provider: string, modelId: string): Promise<ModelWithProvider | undefined> {
    const models = await this.getAvailableModels();
    return models.find(model => model.provider === provider && model.id === modelId);
  }

  /**
   * Get the default model information
   */
  async getDefaultModelInfo(): Promise<ModelWithProvider | undefined> {
    const defaultModel = this.settings.defaultModel;
    return this.findModel(defaultModel.provider, defaultModel.model);
  }

  /**
   * Validate that a provider/model combination is available
   */
  async validateProviderModel(provider: string, model: string): Promise<boolean> {
    const foundModel = await this.findModel(provider, model);
    return !!foundModel;
  }

  /**
   * Get models suitable for a specific task type
   */
  async getModelsForTask(taskType: 'coding' | 'writing' | 'analysis' | 'creative' | 'fast'): Promise<ModelWithProvider[]> {
    const allModels = await this.getAvailableModels();

    switch (taskType) {
      case 'coding':
        return allModels.filter(model => 
          model.supportsFunctions || 
          model.id.includes('code') || 
          model.provider === 'mistral' ||
          model.id.includes('gpt-4')
        );
      
      case 'writing':
        return allModels.filter(model => 
          model.provider === 'anthropic' || 
          model.id.includes('gpt-4') ||
          model.contextWindow > 32000
        );
      
      case 'analysis':
        return allModels.filter(model => 
          model.provider === 'anthropic' ||
          model.id.includes('gpt-4') ||
          model.contextWindow > 100000
        );
      
      case 'creative':
        return allModels.filter(model => 
          model.provider === 'openai' ||
          model.provider === 'anthropic' ||
          model.provider === 'google'
        );
      
      case 'fast':
        return allModels.filter(model => 
          model.provider === 'groq' ||
          model.id.includes('turbo') ||
          model.id.includes('fast')
        );
      
      default:
        return allModels;
    }
  }

  /**
   * Get cost estimate for a provider/model combination
   */
  async getCostEstimate(
    provider: string, 
    model: string, 
    estimatedTokens: number
  ): Promise<{ inputCost: number; outputCost: number; totalCost: number; currency: string } | null> {
    const modelInfo = await this.findModel(provider, model);
    if (!modelInfo) return null;

    // Estimate 75% input, 25% output tokens
    const inputTokens = Math.floor(estimatedTokens * 0.75);
    const outputTokens = Math.floor(estimatedTokens * 0.25);

    const inputCost = (inputTokens / 1_000_000) * modelInfo.pricing.inputPerMillion;
    const outputCost = (outputTokens / 1_000_000) * modelInfo.pricing.outputPerMillion;
    const totalCost = inputCost + outputCost;

    return {
      inputCost,
      outputCost,
      totalCost,
      currency: modelInfo.pricing.currency
    };
  }

  /**
   * Get recommended models based on context window requirements
   */
  async getRecommendedModels(requiredContextWindow?: number): Promise<ModelWithProvider[]> {
    const allModels = await this.getAvailableModels();
    
    if (!requiredContextWindow) {
      // Return default recommendations
      return allModels
        .filter(model => model.contextWindow >= 32000)
        .sort((a, b) => {
          // Prioritize by: 1) Default model, 2) Context window, 3) Provider quality
          if (a.isDefault) return -1;
          if (b.isDefault) return 1;
          return b.contextWindow - a.contextWindow;
        })
        .slice(0, 5);
    }

    return allModels
      .filter(model => model.contextWindow >= requiredContextWindow)
      .sort((a, b) => a.pricing.inputPerMillion - b.pricing.inputPerMillion); // Sort by cost
  }

  /**
   * Test connection to all enabled providers
   */
  async testAllProviders(): Promise<{ [providerId: string]: { success: boolean; error?: string } }> {
    const enabledProviders = this.getEnabledProviders();
    const results: { [providerId: string]: { success: boolean; error?: string } } = {};

    for (const provider of enabledProviders) {
      results[provider.id] = await this.llmService.testProvider(provider.id);
    }

    return results;
  }

  /**
   * Get statistics about available models
   */
  async getModelStatistics(): Promise<{
    totalModels: number;
    providerCount: number;
    averageContextWindow: number;
    maxContextWindow: number;
    minCostPerMillion: number;
    maxCostPerMillion: number;
  }> {
    const models = await this.getAvailableModels();
    
    if (models.length === 0) {
      return {
        totalModels: 0,
        providerCount: 0,
        averageContextWindow: 0,
        maxContextWindow: 0,
        minCostPerMillion: 0,
        maxCostPerMillion: 0
      };
    }

    const providers = new Set(models.map(m => m.provider));
    const contextWindows = models.map(m => m.contextWindow);
    const costs = models.map(m => m.pricing.inputPerMillion);

    return {
      totalModels: models.length,
      providerCount: providers.size,
      averageContextWindow: Math.round(contextWindows.reduce((a, b) => a + b, 0) / models.length),
      maxContextWindow: Math.max(...contextWindows),
      minCostPerMillion: Math.min(...costs),
      maxCostPerMillion: Math.max(...costs)
    };
  }
}