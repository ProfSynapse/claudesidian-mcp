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
} from '../adapters';
import { OllamaAdapter } from '../adapters/ollama/OllamaAdapter';
import { BaseAdapter } from '../adapters/BaseAdapter';
import { GenerateOptions, LLMResponse, ModelInfo } from '../adapters/types';
import { LLMProviderSettings, LLMProviderConfig } from '../../../types';

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

  constructor(settings: LLMProviderSettings, private mcpConnector?: any) {
    this.settings = settings;
    this.initializeAdapters();
  }

  /**
   * Initialize adapters for all configured providers
   */
  private initializeAdapters(): void {
    const providers = this.settings?.providers;
    
    if (!providers) {
      console.warn('No provider settings found, skipping adapter initialization');
      return;
    }

    // Only initialize adapters for providers with API keys
    if (providers.openai?.apiKey && providers.openai.enabled) {
      try {
        const adapter = new OpenAIAdapter(providers.openai.apiKey, this.mcpConnector);
        this.adapters.set('openai', adapter);
      } catch (error) {
        console.error('Failed to initialize OpenAI adapter:', error);
        console.error('Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined
        });
      }
    }

    if (providers.openrouter?.apiKey && providers.openrouter.enabled) {
      try {
        this.adapters.set('openrouter', new OpenRouterAdapter(providers.openrouter.apiKey));
      } catch (error) {
        console.warn('Failed to initialize OpenRouter adapter:', error);
      }
    }

    if (providers.anthropic?.apiKey && providers.anthropic.enabled) {
      try {
        this.adapters.set('anthropic', new AnthropicAdapter(providers.anthropic.apiKey));
      } catch (error) {
        console.warn('Failed to initialize Anthropic adapter:', error);
      }
    }

    if (providers.google?.apiKey && providers.google.enabled) {
      try {
        this.adapters.set('google', new GoogleAdapter(providers.google.apiKey));
      } catch (error) {
        console.warn('Failed to initialize Google adapter:', error);
      }
    }

    if (providers.mistral?.apiKey && providers.mistral.enabled) {
      try {
        this.adapters.set('mistral', new MistralAdapter(providers.mistral.apiKey));
      } catch (error) {
        console.warn('Failed to initialize Mistral adapter:', error);
      }
    }

    if (providers.groq?.apiKey && providers.groq.enabled) {
      try {
        this.adapters.set('groq', new GroqAdapter(providers.groq.apiKey));
      } catch (error) {
        console.warn('Failed to initialize Groq adapter:', error);
      }
    }

    if (providers.requesty?.apiKey && providers.requesty.enabled) {
      try {
        this.adapters.set('requesty', new RequestyAdapter(providers.requesty.apiKey));
      } catch (error) {
        console.warn('Failed to initialize Requesty adapter:', error);
      }
    }

    if (providers.perplexity?.apiKey && providers.perplexity.enabled) {
      try {
        this.adapters.set('perplexity', new PerplexityAdapter(providers.perplexity.apiKey));
      } catch (error) {
        console.warn('Failed to initialize Perplexity adapter:', error);
      }
    }

    if (providers.ollama?.enabled && providers.ollama.apiKey) {
      try {
        // For Ollama, apiKey is actually the server URL, and we need the configured model
        const defaultModel = this.settings.defaultModel.provider === 'ollama' 
          ? this.settings.defaultModel.model 
          : ''; // No fallback - user must configure model
        this.adapters.set('ollama', new OllamaAdapter(providers.ollama.apiKey, defaultModel));
      } catch (error) {
        console.warn('Failed to initialize Ollama adapter:', error);
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

      // Check if provider is available
      if (!this.adapters) {
        return {
          success: false,
          error: 'LLM adapters not initialized'
        };
      }

      const adapter = this.adapters.get(provider);
      
      if (!adapter) {
        const availableProviders = Array.from(this.adapters.keys());
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

  /**
   * Gather content from file paths
   */
  private async gatherFileContent(filepaths: string[]): Promise<string> {
    const contentParts: string[] = [];

    if (!this.vaultAdapter) {
      console.error('LLMService: Vault adapter not initialized. File content cannot be read.');
      return '[Error: Vault adapter not initialized. File content unavailable.]';
    }

    for (const filepath of filepaths) {
      try {
        // Use Obsidian's app.vault.adapter to read file content
        const content = await this.vaultAdapter.read(filepath);
        contentParts.push(`--- ${filepath} ---\n${content}\n`);
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

  /**
   * Generate response compatible with ChatService
   * Wrapper around executePrompt for tool-calling scenarios
   */
  async generateResponse(
    messages: Array<{ role: string; content: string }>, 
    options?: { 
      tools?: any[]; 
      toolChoice?: string;
      provider?: string;
      model?: string;
    }
  ): Promise<{ content: string; toolCalls?: any[] }> {
    try {
      // Convert message array to single prompt
      const userPrompt = messages
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content)
        .join('\n');
      
      const systemPrompt = messages
        .filter(msg => msg.role === 'system')
        .map(msg => msg.content)
        .join('\n');

      // Execute prompt using existing method
      const result = await this.executePrompt({
        userPrompt,
        systemPrompt: systemPrompt || undefined,
        tools: options?.tools,
        provider: options?.provider,
        model: options?.model
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate response');
      }

      // Return in expected format
      return {
        content: result.response || '',
        toolCalls: [] // TODO: Extract tool calls from result if supported
      };
    } catch (error) {
      console.error('[LLMService] generateResponse error:', error);
      throw error;
    }
  }

  /**
   * Streaming wrapper for real-time response generation
   * Returns an async generator that yields chunks of the response in real-time
   * Following OpenAI streaming pattern from: https://platform.openai.com/docs/guides/streaming-responses
   */
  async* generateResponseStream(
    messages: Array<{ role: string; content: string }>, 
    options?: { 
      provider?: string;
      model?: string;
      systemPrompt?: string;
      tools?: any[];
    }
  ): AsyncGenerator<{ chunk: string; complete: boolean; content: string }, void, unknown> {
    try {
      console.log('[LLMService] generateResponseStream called with:', {
        provider: options?.provider,
        model: options?.model,
        hasTools: !!(options?.tools && options.tools.length > 0),
        toolCount: options?.tools?.length || 0
      });

      // Validate settings
      if (!this.settings || !this.settings.defaultModel) {
        throw new Error('LLM service not properly configured - missing settings');
      }

      // Determine provider and model
      const provider = options?.provider || this.settings.defaultModel.provider;
      const model = options?.model || this.settings.defaultModel.model;


      // Get adapter
      const adapter = this.adapters?.get(provider);
      if (!adapter) {
        throw new Error(`Provider not available: ${provider}`);
      }

      console.log('[LLMService] Using adapter:', provider, 'Type:', adapter.constructor.name);

      // Convert message array to single prompt
      const userPrompt = messages
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content)
        .join('\n');
      
      const systemPrompt = messages
        .filter(msg => msg.role === 'system')
        .map(msg => msg.content)
        .join('\n');

      // Build generate options with tools
      const generateOptions = {
        model,
        systemPrompt: systemPrompt || options?.systemPrompt,
        tools: options?.tools
      };

      console.log('[LLMService] Calling generateStreamAsync with options:', {
        model: generateOptions.model,
        hasSystemPrompt: !!generateOptions.systemPrompt,
        hasTools: !!(generateOptions.tools && generateOptions.tools.length > 0),
        toolCount: generateOptions.tools?.length || 0
      });

      // For tool calls, use non-streaming mode due to complexity of tool execution + continuation
      if (provider === 'openai' && generateOptions.tools && generateOptions.tools.length > 0) {
        console.log('[LLMService] Using non-streaming mode for OpenAI + tools (tool execution complexity)');
        
        // Use non-streaming generation for tool execution
        const result = await adapter.generate(userPrompt, generateOptions);
        
        console.log('[LLMService] Tool execution result:', {
          hasText: !!result.text,
          textLength: result.text?.length || 0,
          textPreview: result.text?.substring(0, 200) || '[NO TEXT]',
          finishReason: result.finishReason,
          hasMetadata: !!result.metadata
        });
        
        const responseText = result.text || '[No response from AI]';
        
        // Simulate streaming for smooth UI experience
        yield {
          chunk: responseText,
          complete: false,
          content: responseText
        };
        
        yield {
          chunk: '',
          complete: true,
          content: responseText
        };
        
        return;
      }

      // Stream tokens using the new async generator method
      let fullContent = '';
      
      for await (const chunk of adapter.generateStreamAsync(userPrompt, generateOptions)) {
        if (chunk.content) {
          fullContent += chunk.content;
          
          // Yield each token as it arrives
          yield {
            chunk: chunk.content,
            complete: false,
            content: fullContent
          };
        }
        
        if (chunk.complete) {
          
          // Yield final completion
          yield {
            chunk: '',
            complete: true,
            content: fullContent
          };
          break;
        }
      }

    } catch (error) {
      console.error('[LLMService] generateResponseStream failed:', error);
      throw error;
    }
  }

  /**
   * Get a specific adapter instance for direct access
   */
  getAdapter(providerId: string): BaseAdapter | undefined {
    return this.adapters.get(providerId);
  }

}