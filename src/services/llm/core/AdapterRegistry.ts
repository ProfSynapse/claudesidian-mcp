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

import { Vault } from 'obsidian';
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
import { WebLLMAdapter } from '../adapters/webllm/WebLLMAdapter';
import { getWebLLMLifecycleManager } from '../adapters/webllm/WebLLMLifecycleManager';
import { BaseAdapter } from '../adapters/BaseAdapter';
import { LLMProviderSettings, LLMProviderConfig } from '../../../types';

/**
 * Interface for adapter registry operations
 */
export interface IAdapterRegistry {
  /**
   * Initialize all adapters based on provider settings
   */
  initialize(settings: LLMProviderSettings, mcpConnector?: any, vault?: Vault): void;

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
  private vault?: Vault;
  private webllmAdapter?: WebLLMAdapter;

  constructor(settings: LLMProviderSettings, mcpConnector?: any, vault?: Vault) {
    this.settings = settings;
    this.mcpConnector = mcpConnector;
    this.vault = vault;
  }

  /**
   * Initialize all adapters based on provider settings
   */
  initialize(settings: LLMProviderSettings, mcpConnector?: any, vault?: Vault): void {
    this.settings = settings;
    this.mcpConnector = mcpConnector;
    if (vault) this.vault = vault;
    this.adapters.clear();
    this.initializeAdapters();
  }

  /**
   * Update settings and reinitialize all adapters
   */
  updateSettings(settings: LLMProviderSettings): void {
    this.initialize(settings, this.mcpConnector, this.vault);
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
    // Dispose Nexus adapter properly (cleanup GPU resources)
    if (this.webllmAdapter) {
      // Clear lifecycle manager reference first
      const lifecycleManager = getWebLLMLifecycleManager();
      lifecycleManager.setAdapter(null);

      this.webllmAdapter.dispose().catch((error) => {
        console.warn('AdapterRegistry: Failed to dispose Nexus adapter:', error);
      });
      this.webllmAdapter = undefined;
    }
    this.adapters.clear();
  }

  /**
   * Get the WebLLM adapter instance (for model management)
   */
  getWebLLMAdapter(): WebLLMAdapter | undefined {
    return this.webllmAdapter;
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

    // WebLLM/Nexus - Native local LLM via WebGPU
    // Requires Vault for model storage, no API key needed
    console.log('[AdapterRegistry] Nexus check:', {
      webllmEnabled: providers.webllm?.enabled,
      hasVault: !!this.vault,
      vaultName: this.vault?.getName?.() || 'N/A'
    });

    if (providers.webllm?.enabled && this.vault) {
      try {
        console.log('[AdapterRegistry] Creating Nexus adapter...');
        this.webllmAdapter = new WebLLMAdapter(this.vault, this.mcpConnector);
        // Add adapter immediately so it's available for use
        // The adapter will initialize lazily on first use
        this.adapters.set('webllm', this.webllmAdapter);
        console.log('[AdapterRegistry] Nexus adapter registered, available adapters:', Array.from(this.adapters.keys()));

        // Connect to lifecycle manager for smart loading/unloading
        const lifecycleManager = getWebLLMLifecycleManager();
        lifecycleManager.setAdapter(this.webllmAdapter);

        // Start async initialization in background (WebGPU detection)
        this.webllmAdapter.initialize().then(() => {
          console.log('[AdapterRegistry] Nexus adapter initialized (WebGPU ready)');
        }).catch((error) => {
          console.warn('[AdapterRegistry] Nexus background initialization failed:', error);
          // Don't remove from adapters - let it fail gracefully on use
        });
      } catch (error) {
        console.error('[AdapterRegistry] Failed to create Nexus adapter:', error);
        this.logError('webllm', error);
      }
    } else if (providers.webllm?.enabled && !this.vault) {
      console.warn('[AdapterRegistry] Nexus is enabled but vault is not available - adapter will not be created');
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
