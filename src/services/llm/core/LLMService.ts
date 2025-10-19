/**
 * LLM Service - Main wrapper around the adapter kit
 * Provides unified interface to all LLM providers with Obsidian integration
 */

import { BaseAdapter } from '../adapters/BaseAdapter';
import { GenerateOptions, LLMResponse, ModelInfo } from '../adapters/types';
import { LLMProviderSettings, LLMProviderConfig } from '../../../types';
import { MCPToolExecution } from '../adapters/shared/MCPToolExecution';
import { ConversationContextBuilder } from '../../chat/ConversationContextBuilder';
import { ConversationData } from '../../../types/chat/ChatTypes';
import { AdapterRegistry } from './AdapterRegistry';
import { ModelDiscoveryService } from './ModelDiscoveryService';
import { FileContentService } from './FileContentService';
import { StreamingOrchestrator, StreamingOptions, StreamYield } from './StreamingOrchestrator';
import { VaultOperations } from '../../../core/VaultOperations';

export interface LLMExecutionOptions extends GenerateOptions {
  provider?: string;
  model?: string;
  filepaths?: string[];
  systemPrompt?: string;
  userPrompt: string;
  webSearch?: boolean;
}

export interface LLMExecutionResult {
  success: boolean;
  response?: string;
  model?: string;
  provider?: string;
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
  webSearchResults?: any[]; // SearchResult[] from adapters/types, avoiding circular import
  error?: string;
}

export class LLMService {
  private adapterRegistry: AdapterRegistry;
  private modelDiscovery: ModelDiscoveryService;
  private fileContentService?: FileContentService;
  private settings: LLMProviderSettings;

  constructor(settings: LLMProviderSettings, private mcpConnector?: any) {
    this.settings = settings;
    this.adapterRegistry = new AdapterRegistry(settings, mcpConnector);
    this.adapterRegistry.initialize(settings, mcpConnector);
    this.modelDiscovery = new ModelDiscoveryService(this.adapterRegistry, settings);
  }


  /** Update settings and reinitialize adapters */
  updateSettings(settings: LLMProviderSettings): void {
    this.settings = settings;
    this.adapterRegistry.updateSettings(settings);
    this.modelDiscovery = new ModelDiscoveryService(this.adapterRegistry, settings);
  }

  /** Get all available models from enabled providers */
  async getAvailableModels(): Promise<(ModelInfo & { provider: string; userDescription?: string })[]> {
    return this.modelDiscovery.getAvailableModels();
  }

  /** Get available providers (those with API keys and enabled) */
  getAvailableProviders(): string[] {
    return this.adapterRegistry.getAvailableProviders();
  }

  /** Check if a provider is available */
  isProviderAvailable(provider: string): boolean {
    return this.adapterRegistry.isProviderAvailable(provider);
  }

  /** Get the default provider and model */
  getDefaultModel(): { provider: string; model: string } {
    return this.settings.defaultModel;
  }

  /** Execute a prompt with the specified or default provider/model */
  async executePrompt(options: LLMExecutionOptions): Promise<LLMExecutionResult> {
    try {
      // Validate that we have settings
      if (!this.settings || !this.settings.defaultModel) {
        return {
          success: false,
          error: 'LLM service not properly configured - missing settings'
        };
      }

      // Determine provider and model
      const provider = options.provider || this.settings.defaultModel.provider;
      const model = options.model || this.settings.defaultModel.model;

      // Validate provider and model are specified
      if (!provider) {
        return {
          success: false,
          error: 'No provider specified and no default provider configured. Please set up LLM providers in settings.'
        };
      }

      if (!model) {
        return {
          success: false,
          error: 'No model specified and no default model configured. Please set up default model in settings.'
        };
      }

      // Get adapter for the provider
      const adapter = this.adapterRegistry.getAdapter(provider);

      if (!adapter) {
        const availableProviders = this.adapterRegistry.getAvailableProviders();
        return {
          success: false,
          error: `Provider '${provider}' is not available. Available providers: ${availableProviders.length > 0 ? availableProviders.join(', ') : 'none (no API keys configured)'}. Please check API key configuration in settings.`
        };
      }

      // Build the complete prompt
      let fullPrompt = options.userPrompt;
      
      // Add file content if filepaths provided
      let filesIncluded: string[] = [];
      if (options.filepaths && options.filepaths.length > 0) {
        if (!this.fileContentService) {
          console.warn('LLMService: FileContentService not initialized. Call setVaultOperations() first.');
        } else {
          const fileContent = await this.fileContentService.gatherFileContent(options.filepaths);
          if (fileContent.length > 0) {
            fullPrompt = `Context from files:\n\n${fileContent}\n\n---\n\nUser request: ${options.userPrompt}`;
            filesIncluded = options.filepaths;
          }
        }
      }

      // Execute the prompt
      const generateOptions: GenerateOptions = {
        model,
        systemPrompt: options.systemPrompt,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        jsonMode: options.jsonMode,
        topP: options.topP,
        frequencyPenalty: options.frequencyPenalty,
        presencePenalty: options.presencePenalty,
        stopSequences: options.stopSequences,
        webSearch: options.webSearch
      };

      const result: LLMResponse = await adapter.generate(fullPrompt, generateOptions);

      return {
        success: true,
        response: result.text,
        model: result.model,
        provider: result.provider,
        usage: result.usage,
        cost: result.cost,
        filesIncluded,
        webSearchResults: result.webSearchResults
      };

    } catch (error) {
      console.error('LLMService.executePrompt failed:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
        toString: String(error)
      });
      
      return {
        success: false,
        error: `LLM execution failed: ${error instanceof Error ? error.message : 'Unknown error occurred'}. Check console for details.`
      };
    }
  }

  /** Set VaultOperations for file reading */
  setVaultOperations(vaultOperations: VaultOperations): void {
    this.fileContentService = new FileContentService(vaultOperations);
  }

  /** Test connection to a specific provider */
  async testProvider(provider: string): Promise<{ success: boolean; error?: string }> {
    try {
      const adapter = this.adapterRegistry.getAdapter(provider);
      if (!adapter) {
        return { success: false, error: `Provider '${provider}' is not configured` };
      }

      // Test with a simple prompt
      await adapter.generate('Hello', { maxTokens: 10 });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /** Get provider configuration */
  getProviderConfig(provider: string): LLMProviderConfig | undefined {
    return this.settings.providers[provider];
  }

  /** Get all provider configurations */
  getAllProviderConfigs(): { [providerId: string]: LLMProviderConfig } {
    return this.settings.providers;
  }

  /** Generate streaming LLM response with tool execution support */
  async* generateResponseStream(
    messages: Array<{ role: string; content: string }>,
    options?: StreamingOptions
  ): AsyncGenerator<StreamYield, void, unknown> {
    const orchestrator = new StreamingOrchestrator(
      this.adapterRegistry,
      this.settings
    );
    yield* orchestrator.generateResponseStream(messages, options);
  }

  /** Get a specific adapter instance for direct access */
  getAdapter(providerId: string): BaseAdapter | undefined {
    return this.adapterRegistry.getAdapter(providerId);
  }

}