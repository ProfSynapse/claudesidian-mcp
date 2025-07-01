/**
 * LLM Service - Main wrapper around the adapter kit
 * Provides unified interface to all LLM providers with Obsidian integration
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
} from './llm/adapters';
import { BaseAdapter } from './llm/adapters/BaseAdapter';
import { GenerateOptions, LLMResponse, ModelInfo } from './llm/adapters/types';
import { LLMProviderSettings, LLMProviderConfig } from '../types';

export interface LLMExecutionOptions extends GenerateOptions {
  provider?: string;
  model?: string;
  filepaths?: string[];
  systemPrompt?: string;
  userPrompt: string;
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
  error?: string;
}

export class LLMService {
  private adapters: Map<string, BaseAdapter> = new Map();
  private settings: LLMProviderSettings;

  constructor(settings: LLMProviderSettings) {
    this.settings = settings;
    this.initializeAdapters();
  }

  /**
   * Initialize adapters for all configured providers
   */
  private initializeAdapters(): void {
    const providers = this.settings.providers;

    // Only initialize adapters for providers with API keys
    if (providers.openai?.apiKey && providers.openai.enabled) {
      try {
        // Set environment variable for the adapter
        process.env.OPENAI_API_KEY = providers.openai.apiKey;
        this.adapters.set('openai', new OpenAIAdapter());
      } catch (error) {
        console.warn('Failed to initialize OpenAI adapter:', error);
      }
    }

    if (providers.anthropic?.apiKey && providers.anthropic.enabled) {
      try {
        process.env.ANTHROPIC_API_KEY = providers.anthropic.apiKey;
        this.adapters.set('anthropic', new AnthropicAdapter());
      } catch (error) {
        console.warn('Failed to initialize Anthropic adapter:', error);
      }
    }

    if (providers.google?.apiKey && providers.google.enabled) {
      try {
        process.env.GOOGLE_API_KEY = providers.google.apiKey;
        this.adapters.set('google', new GoogleAdapter());
      } catch (error) {
        console.warn('Failed to initialize Google adapter:', error);
      }
    }

    if (providers.mistral?.apiKey && providers.mistral.enabled) {
      try {
        process.env.MISTRAL_API_KEY = providers.mistral.apiKey;
        this.adapters.set('mistral', new MistralAdapter());
      } catch (error) {
        console.warn('Failed to initialize Mistral adapter:', error);
      }
    }

    if (providers.groq?.apiKey && providers.groq.enabled) {
      try {
        process.env.GROQ_API_KEY = providers.groq.apiKey;
        this.adapters.set('groq', new GroqAdapter());
      } catch (error) {
        console.warn('Failed to initialize Groq adapter:', error);
      }
    }

    if (providers.openrouter?.apiKey && providers.openrouter.enabled) {
      try {
        process.env.OPENROUTER_API_KEY = providers.openrouter.apiKey;
        this.adapters.set('openrouter', new OpenRouterAdapter());
      } catch (error) {
        console.warn('Failed to initialize OpenRouter adapter:', error);
      }
    }

    if (providers.requesty?.apiKey && providers.requesty.enabled) {
      try {
        process.env.REQUESTY_API_KEY = providers.requesty.apiKey;
        this.adapters.set('requesty', new RequestyAdapter());
      } catch (error) {
        console.warn('Failed to initialize Requesty adapter:', error);
      }
    }

    if (providers.perplexity?.apiKey && providers.perplexity.enabled) {
      try {
        process.env.PERPLEXITY_API_KEY = providers.perplexity.apiKey;
        this.adapters.set('perplexity', new PerplexityAdapter());
      } catch (error) {
        console.warn('Failed to initialize Perplexity adapter:', error);
      }
    }
  }

  /**
   * Update settings and reinitialize adapters
   */
  updateSettings(settings: LLMProviderSettings): void {
    this.settings = settings;
    this.adapters.clear();
    this.initializeAdapters();
  }

  /**
   * Get all available models from enabled providers
   */
  async getAvailableModels(): Promise<(ModelInfo & { provider: string; userDescription?: string })[]> {
    const allModels: (ModelInfo & { provider: string; userDescription?: string })[] = [];

    for (const [providerId, adapter] of this.adapters) {
      try {
        const models = await adapter.listModels();
        // Add provider information and user description to each model
        const modelsWithProvider = models.map(model => ({
          ...model,
          provider: providerId,
          userDescription: this.settings.providers[providerId]?.userDescription
        }));
        allModels.push(...modelsWithProvider);
      } catch (error) {
        console.warn(`Failed to get models from ${providerId}:`, error);
      }
    }

    return allModels;
  }

  /**
   * Get available providers (those with API keys and enabled)
   */
  getAvailableProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(provider: string): boolean {
    return this.adapters.has(provider);
  }

  /**
   * Get the default provider and model
   */
  getDefaultModel(): { provider: string; model: string } {
    return this.settings.defaultModel;
  }

  /**
   * Execute a prompt with the specified or default provider/model
   */
  async executePrompt(options: LLMExecutionOptions): Promise<LLMExecutionResult> {
    try {
      // Determine provider and model
      const provider = options.provider || this.settings.defaultModel.provider;
      const model = options.model || this.settings.defaultModel.model;

      // Check if provider is available
      const adapter = this.adapters.get(provider);
      if (!adapter) {
        return {
          success: false,
          error: `Provider '${provider}' is not available. Please check API key configuration.`
        };
      }

      // Build the complete prompt
      let fullPrompt = options.userPrompt;
      
      // Add file content if filepaths provided
      let filesIncluded: string[] = [];
      if (options.filepaths && options.filepaths.length > 0) {
        const fileContent = await this.gatherFileContent(options.filepaths);
        if (fileContent.length > 0) {
          fullPrompt = `Context from files:\n\n${fileContent}\n\n---\n\nUser request: ${options.userPrompt}`;
          filesIncluded = options.filepaths;
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
        stopSequences: options.stopSequences
      };

      const result: LLMResponse = await adapter.generate(fullPrompt, generateOptions);

      return {
        success: true,
        response: result.text,
        model: result.model,
        provider: result.provider,
        usage: result.usage,
        cost: result.cost,
        filesIncluded
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Gather content from file paths
   */
  private async gatherFileContent(filepaths: string[]): Promise<string> {
    const contentParts: string[] = [];

    for (const filepath of filepaths) {
      try {
        // Use Obsidian's app.vault.adapter to read file content
        // This will be injected when the service is initialized in the plugin
        if (this.vaultAdapter) {
          const content = await this.vaultAdapter.read(filepath);
          contentParts.push(`--- ${filepath} ---\n${content}\n`);
        }
      } catch (error) {
        console.warn(`Failed to read file ${filepath}:`, error);
        contentParts.push(`--- ${filepath} ---\n[Error reading file: ${error}]\n`);
      }
    }

    return contentParts.join('\n');
  }

  /**
   * Vault adapter for reading files - will be set by the plugin
   */
  private vaultAdapter: any = null;

  /**
   * Set the vault adapter for file reading
   */
  setVaultAdapter(adapter: any): void {
    this.vaultAdapter = adapter;
  }

  /**
   * Test connection to a specific provider
   */
  async testProvider(provider: string): Promise<{ success: boolean; error?: string }> {
    try {
      const adapter = this.adapters.get(provider);
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

  /**
   * Get provider configuration
   */
  getProviderConfig(provider: string): LLMProviderConfig | undefined {
    return this.settings.providers[provider];
  }

  /**
   * Get all provider configurations
   */
  getAllProviderConfigs(): { [providerId: string]: LLMProviderConfig } {
    return this.settings.providers;
  }
}