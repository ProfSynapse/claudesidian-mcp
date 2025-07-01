/**
 * Centralized AI Model Registry
 * 
 * This file imports all provider-specific model definitions and provides
 * a unified interface for working with models across all providers.
 * 
 * Updated June 17, 2025 with modular provider structure
 */

import { ModelSpec } from './modelTypes';
import { OPENAI_MODELS, OPENAI_DEFAULT_MODEL } from './openai/OpenAIModels';
import { GOOGLE_MODELS, GOOGLE_DEFAULT_MODEL } from './google/GoogleModels';
import { ANTHROPIC_MODELS, ANTHROPIC_DEFAULT_MODEL } from './anthropic/AnthropicModels';
import { MISTRAL_MODELS, MISTRAL_DEFAULT_MODEL } from './mistral/MistralModels';
import { OPENROUTER_MODELS, OPENROUTER_DEFAULT_MODEL } from './openrouter/OpenRouterModels';
import { REQUESTY_MODELS, REQUESTY_DEFAULT_MODEL } from './requesty/RequestyModels';
import { GROQ_MODELS, GROQ_DEFAULT_MODEL } from './groq/GroqModels';

// Re-export ModelSpec for convenience
export { ModelSpec };

/**
 * Complete model registry organized by provider
 * Reconstructed from individual provider model definitions
 */
export const AI_MODELS: Record<string, ModelSpec[]> = {
  openai: OPENAI_MODELS,
  google: GOOGLE_MODELS,
  anthropic: ANTHROPIC_MODELS,
  mistral: MISTRAL_MODELS,
  openrouter: OPENROUTER_MODELS,
  requesty: REQUESTY_MODELS,
  groq: GROQ_MODELS
};

/**
 * Helper functions for working with the model registry
 */
export class ModelRegistry {
  /**
   * Get all models for a specific provider
   */
  static getProviderModels(provider: string): ModelSpec[] {
    return AI_MODELS[provider] || [];
  }

  /**
   * Find a specific model by provider and API name
   */
  static findModel(provider: string, apiName: string): ModelSpec | undefined {
    const providerModels = this.getProviderModels(provider);
    return providerModels.find(model => model.apiName === apiName);
  }

  /**
   * Get all available providers
   */
  static getProviders(): string[] {
    return Object.keys(AI_MODELS);
  }

  /**
   * Get models with specific capabilities
   */
  static getModelsByCapability(capability: keyof ModelSpec['capabilities'], value: boolean = true): ModelSpec[] {
    const allModels = Object.values(AI_MODELS).flat();
    return allModels.filter(model => model.capabilities[capability] === value);
  }

  /**
   * Get models within a cost range (input cost per million tokens)
   */
  static getModelsByCostRange(maxInputCost: number, maxOutputCost?: number): ModelSpec[] {
    const allModels = Object.values(AI_MODELS).flat();
    return allModels.filter(model => {
      const withinInputCost = model.inputCostPerMillion <= maxInputCost;
      const withinOutputCost = maxOutputCost ? model.outputCostPerMillion <= maxOutputCost : true;
      return withinInputCost && withinOutputCost;
    });
  }

  /**
   * Get the latest models (all current models)
   */
  static getLatestModels(): ModelSpec[] {
    return Object.values(AI_MODELS).flat();
  }

  /**
   * Convert ModelSpec to the legacy ModelInfo format
   */
  static toModelInfo(modelSpec: ModelSpec): any {
    return {
      id: modelSpec.apiName,
      name: modelSpec.name,
      contextWindow: modelSpec.contextWindow,
      maxOutputTokens: modelSpec.maxTokens,
      supportsJSON: modelSpec.capabilities.supportsJSON,
      supportsImages: modelSpec.capabilities.supportsImages,
      supportsFunctions: modelSpec.capabilities.supportsFunctions,
      supportsStreaming: modelSpec.capabilities.supportsStreaming,
      supportsThinking: modelSpec.capabilities.supportsThinking,
      costPer1kTokens: {
        input: modelSpec.inputCostPerMillion / 1000,
        output: modelSpec.outputCostPerMillion / 1000
      },
      pricing: {
        inputPerMillion: modelSpec.inputCostPerMillion,
        outputPerMillion: modelSpec.outputCostPerMillion,
        currency: 'USD',
        lastUpdated: new Date().toISOString()
      }
    };
  }
}

/**
 * Export default models for each provider (recommended models)
 */
export const DEFAULT_MODELS: Record<string, string> = {
  openai: OPENAI_DEFAULT_MODEL,
  google: GOOGLE_DEFAULT_MODEL,
  anthropic: ANTHROPIC_DEFAULT_MODEL,
  mistral: MISTRAL_DEFAULT_MODEL,
  openrouter: OPENROUTER_DEFAULT_MODEL,
  requesty: REQUESTY_DEFAULT_MODEL,
  groq: GROQ_DEFAULT_MODEL
};