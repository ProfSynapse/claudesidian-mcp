/**
 * Location: /src/ui/chat/utils/ModelSelectionUtility.ts
 *
 * Purpose: Utility for model selection and discovery
 * Extracted from ModelAgentManager.ts to follow Single Responsibility Principle
 *
 * Used by: ModelAgentManager for model-related operations
 * Dependencies: LLMService, ProviderUtils
 */

import { ModelOption } from '../components/ModelSelector';
import { ProviderUtils } from '../utils/ProviderUtils';
import { getNexusPlugin } from '../../../utils/pluginLocator';

/**
 * Utility class for model selection and management
 */
export class ModelSelectionUtility {
  /**
   * Get available models from validated providers
   */
  static async getAvailableModels(app: any): Promise<ModelOption[]> {
    try {
      // Get plugin instance to access LLMService
      const plugin = getNexusPlugin(app) as any;
      if (!plugin) {
        return [];
      }

      // Get LLMService which has ModelDiscoveryService
      const llmService = await plugin.getService('llmService');
      if (!llmService) {
        return [];
      }

      // Allowed providers for chat view
      const allowedProviders = ['openai', 'openrouter', 'anthropic', 'google', 'ollama', 'lmstudio', 'webllm'];

      // Get all available models from ModelDiscoveryService (via LLMService)
      const allModels = await llmService.getAvailableModels();

      // Filter to allowed providers and convert to ModelOption format
      const models: ModelOption[] = allModels
        .filter((model: any) => allowedProviders.includes(model.provider))
        .map((model: any) => ModelSelectionUtility.mapToModelOption(model));

      return models;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get the configured default model from plugin settings
   */
  static async getDefaultModel(app: any): Promise<{ provider: string; model: string }> {
    try {
      const plugin = getNexusPlugin(app) as any;
      if (!plugin) {
        throw new Error('Plugin not found');
      }

      // Try to get from in-memory settings first (more reliable)
      const settingsManager = plugin.settings;
      const inMemorySettings = settingsManager?.settings?.llmProviders?.defaultModel;

      if (inMemorySettings?.provider && inMemorySettings?.model) {
        return inMemorySettings;
      }

      // Fallback to raw data.json
      const pluginData = await plugin.loadData();
      const defaultModel = pluginData?.llmProviders?.defaultModel;

      if (defaultModel?.provider && defaultModel?.model) {
        return defaultModel;
      }

      // If still no default, return the hardcoded default (openai/gpt-4o)
      // This prevents errors during initial setup
      console.warn('[ModelSelectionUtility] No default model configured, using fallback');
      return { provider: 'openai', model: 'gpt-4o' };
    } catch (error) {
      // Return fallback instead of throwing to prevent UI errors
      console.warn('[ModelSelectionUtility] Error getting default model, using fallback:', error);
      return { provider: 'openai', model: 'gpt-4o' };
    }
  }

  /**
   * Find default model in available models
   */
  static async findDefaultModelOption(
    app: any,
    availableModels: ModelOption[]
  ): Promise<ModelOption | null> {
    try {
      const defaultModelConfig = await ModelSelectionUtility.getDefaultModel(app);

      const defaultModel = availableModels.find(
        m => m.providerId === defaultModelConfig.provider &&
             m.modelId === defaultModelConfig.model
      );

      return defaultModel || null;
    } catch (error) {
      console.error('[ModelSelectionUtility] Failed to find default model:', error);
      return null;
    }
  }

  /**
   * Convert ModelWithProvider to ModelOption format
   */
  static mapToModelOption(model: any): ModelOption {
    return {
      providerId: model.provider,
      providerName: ModelSelectionUtility.getProviderDisplayName(model.provider),
      modelId: model.id,
      modelName: model.name,
      contextWindow: model.contextWindow || 128000, // Default if not specified
      supportsThinking: model.supportsThinking || false
    };
  }

  /**
   * Get display name for provider with tool calling indicator
   */
  static getProviderDisplayName(providerId: string): string {
    return ProviderUtils.getProviderDisplayNameWithTools(providerId);
  }
}
