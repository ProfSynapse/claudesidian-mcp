/**
 * AdapterRegistry - Manages adapter lifecycle and provider availability
 *
 * Extracted from LLMService.ts to follow Single Responsibility Principle.
 * This service is responsible ONLY for:
 * - Initializing adapters for configured providers
 * - Managing adapter instances
 * - Providing adapter availability checks
 * - Handling adapter cleanup
 */

import {
  OpenAIAdapter,
  AnthropicAdapter,
  GoogleAdapter,
  MistralAdapter,
  GroqAdapter,
  OpenRouterAdapter,
  RequestyAdapter,
  PerplexityAdapter
} from '../adapters';
import { OllamaAdapter } from '../adapters/ollama/OllamaAdapter';
import { LMStudioAdapter } from '../adapters/lmstudio/LMStudioAdapter';
import { BaseAdapter } from '../adapters/BaseAdapter';
import { LLMProviderSettings, LLMProviderConfig } from '../../../types';

/**
 * Interface for adapter registry operations
 */
export interface IAdapterRegistry {
  /**
   * Initialize all adapters based on provider settings
   */
  initialize(settings: LLMProviderSettings, mcpConnector?: any): void;

  /**
   * Update settings and reinitialize adapters
   */
  updateSettings(settings: LLMProviderSettings): void;

  /**
   * Get adapter instance for a provider
   */
  getAdapter(providerId: string): BaseAdapter | undefined;

  /**
   * Get all available provider IDs
   */
  getAvailableProviders(): string[];

  /**
   * Check if a provider is initialized and available
   */
  isProviderAvailable(providerId: string): boolean;

  /**
   * Clear all adapters (for cleanup)
   */
  clear(): void;
}

/**
 * AdapterRegistry implementation
 * Manages the lifecycle of LLM provider adapters
 */
export class AdapterRegistry implements IAdapterRegistry {
  private adapters: Map<string, BaseAdapter> = new Map();
  private settings: LLMProviderSettings;
  private mcpConnector?: any;

  constructor(settings: LLMProviderSettings, mcpConnector?: any) {
    this.settings = settings;
    this.mcpConnector = mcpConnector;
  }

  /**
   * Initialize all adapters based on provider settings
   */
  initialize(settings: LLMProviderSettings, mcpConnector?: any): void {
    this.settings = settings;
    this.mcpConnector = mcpConnector;
    this.adapters.clear();
    this.initializeAdapters();
  }

  /**
   * Update settings and reinitialize all adapters
   */
  updateSettings(settings: LLMProviderSettings): void {
    this.initialize(settings, this.mcpConnector);
  }

  /**
   * Get adapter instance for a specific provider
   */
  getAdapter(providerId: string): BaseAdapter | undefined {
    return this.adapters.get(providerId);
  }

  /**
   * Get all available (initialized) provider IDs
   */
  getAvailableProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(providerId: string): boolean {
    return this.adapters.has(providerId);
  }

  /**
   * Clear all adapters
   */
  clear(): void {
    this.adapters.clear();
  }

  /**
   * Initialize adapters for all configured providers
   * Only initializes adapters for providers that are enabled and have API keys
   */
  private initializeAdapters(): void {
    const providers = this.settings?.providers;

    if (!providers) {
      console.warn('AdapterRegistry: No provider settings found, skipping initialization');
      return;
    }

    // Initialize each provider using adapter factory pattern
    this.initializeProvider('openai', providers.openai,
      (config) => new OpenAIAdapter(config.apiKey, this.mcpConnector));

    this.initializeProvider('openrouter', providers.openrouter,
      (config) => new OpenRouterAdapter(config.apiKey, this.mcpConnector));

    this.initializeProvider('anthropic', providers.anthropic,
      (config) => new AnthropicAdapter(config.apiKey, this.mcpConnector));

    this.initializeProvider('google', providers.google,
      (config) => new GoogleAdapter(config.apiKey, this.mcpConnector));

    this.initializeProvider('mistral', providers.mistral,
      (config) => new MistralAdapter(config.apiKey, this.mcpConnector));

    this.initializeProvider('groq', providers.groq,
      (config) => new GroqAdapter(config.apiKey, this.mcpConnector));

    this.initializeProvider('requesty', providers.requesty,
      (config) => new RequestyAdapter(config.apiKey, this.mcpConnector));

    this.initializeProvider('perplexity', providers.perplexity,
      (config) => new PerplexityAdapter(config.apiKey, this.mcpConnector));

    // Ollama has special handling - apiKey is actually the server URL
    if (providers.ollama?.enabled && providers.ollama.apiKey) {
      try {
        const ollamaModel = providers.ollama.ollamaModel;

        if (!ollamaModel || !ollamaModel.trim()) {
          console.warn('AdapterRegistry: Ollama enabled but no model configured');
          return;
        }

        this.adapters.set('ollama', new OllamaAdapter(providers.ollama.apiKey, ollamaModel));
      } catch (error) {
        console.error('AdapterRegistry: Failed to initialize Ollama adapter:', error);
        this.logError('ollama', error);
      }
    }

    // LM Studio has special handling - apiKey is actually the server URL
    // Models are discovered dynamically from the server
    if (providers.lmstudio?.enabled && providers.lmstudio.apiKey) {
      try {
        this.adapters.set('lmstudio', new LMStudioAdapter(providers.lmstudio.apiKey, this.mcpConnector));
      } catch (error) {
        console.error('AdapterRegistry: Failed to initialize LM Studio adapter:', error);
        this.logError('lmstudio', error);
      }
    }
  }

  /**
   * Initialize a single provider adapter using factory pattern
   * Handles common validation and error logging
   */
  private initializeProvider(
    providerId: string,
    config: LLMProviderConfig | undefined,
    factory: (config: LLMProviderConfig) => BaseAdapter
  ): void {
    if (config?.apiKey && config.enabled) {
      try {
        const adapter = factory(config);
        this.adapters.set(providerId, adapter);
      } catch (error) {
        console.error(`AdapterRegistry: Failed to initialize ${providerId} adapter:`, error);
        this.logError(providerId, error);
      }
    }
  }

  /**
   * Log detailed error information for debugging
   */
  private logError(providerId: string, error: unknown): void {
    console.error(`AdapterRegistry: Error details for ${providerId}:`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
  }
}
