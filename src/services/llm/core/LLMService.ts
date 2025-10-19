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
import { MCPToolExecution } from '../adapters/shared/MCPToolExecution';
import { ConversationContextBuilder } from '../../chat/ConversationContextBuilder';
import { ConversationData } from '../../../types/chat/ChatTypes';

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
        this.adapters.set('openrouter', new OpenRouterAdapter(providers.openrouter.apiKey, this.mcpConnector));
      } catch (error) {
        console.warn('Failed to initialize OpenRouter adapter:', error);
      }
    }

    if (providers.anthropic?.apiKey && providers.anthropic.enabled) {
      try {
        this.adapters.set('anthropic', new AnthropicAdapter(providers.anthropic.apiKey, this.mcpConnector));
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
        this.adapters.set('mistral', new MistralAdapter(providers.mistral.apiKey, this.mcpConnector));
      } catch (error) {
        console.warn('Failed to initialize Mistral adapter:', error);
      }
    }

    if (providers.groq?.apiKey && providers.groq.enabled) {
      try {
        this.adapters.set('groq', new GroqAdapter(providers.groq.apiKey, this.mcpConnector));
      } catch (error) {
        console.warn('Failed to initialize Groq adapter:', error);
      }
    }

    if (providers.requesty?.apiKey && providers.requesty.enabled) {
      try {
        this.adapters.set('requesty', new RequestyAdapter(providers.requesty.apiKey, this.mcpConnector));
      } catch (error) {
        console.warn('Failed to initialize Requesty adapter:', error);
      }
    }

    if (providers.perplexity?.apiKey && providers.perplexity.enabled) {
      try {
        this.adapters.set('perplexity', new PerplexityAdapter(providers.perplexity.apiKey, this.mcpConnector));
      } catch (error) {
        console.warn('Failed to initialize Perplexity adapter:', error);
      }
    }

    if (providers.ollama?.enabled && providers.ollama.apiKey) {
      try {
        // For Ollama, apiKey is the server URL, ollamaModel is the user-configured model
        const ollamaModel = providers.ollama.ollamaModel;

        if (!ollamaModel || !ollamaModel.trim()) {
          console.warn('Ollama enabled but no model configured');
          return;
        }

        this.adapters.set('ollama', new OllamaAdapter(providers.ollama.apiKey, ollamaModel));
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
      onToolEvent?: (event: 'started' | 'completed', data: any) => void;
      onUsageAvailable?: (usage: any, cost?: any) => void; // ✅ Added for async usage updates (OpenRouter streaming)
      sessionId?: string; // ✅ Added for tool execution context
      workspaceId?: string; // ✅ Added for tool execution context
    }
  ): AsyncGenerator<{ chunk: string; complete: boolean; content: string; toolCalls?: any[]; toolCallsReady?: boolean; usage?: any }, void, unknown> {
    try {
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

      // Get only the latest user message as the actual prompt
      const latestUserMessage = messages[messages.length - 1];
      const userPrompt = latestUserMessage?.role === 'user' ? latestUserMessage.content : '';

      // Build conversation history from all previous messages
      let conversationHistory = '';
      if (messages.length > 1) {
        conversationHistory = messages.slice(0, -1).map((msg: any) => {
          if (msg.role === 'user') return `User: ${msg.content}`;
          if (msg.role === 'assistant') {
            if (msg.tool_calls) return `Assistant: [Calling tools: ${msg.tool_calls.map((tc: any) => tc.function.name).join(', ')}]`;
            return `Assistant: ${msg.content}`;
          }
          if (msg.role === 'tool') return `Tool Result: ${msg.content}`;
          if (msg.role === 'system') return `System: ${msg.content}`;
          return '';
        }).filter(Boolean).join('\n');
      }

      // Combine system prompt + conversation history
      const systemPrompt = [
        options?.systemPrompt || '',
        conversationHistory ? '\n=== Conversation History ===\n' + conversationHistory : ''
      ].filter(Boolean).join('\n');

      // Build generate options with tools
      const generateOptions = {
        model,
        systemPrompt: systemPrompt || options?.systemPrompt,
        tools: options?.tools,
        onToolEvent: options?.onToolEvent, // Pass through tool event callback for live UI updates
        onUsageAvailable: options?.onUsageAvailable // Pass through usage callback for async cost calculation
      };

      // STREAMING-FIRST APPROACH: Use streaming for all providers
      // Tool calls are detected dynamically during the stream
      // Note: Perplexity doesn't support tool calls, so it will just stream normally

      // Stream tokens using the new async generator method
      let fullContent = '';
      let detectedToolCalls: any[] = [];
      let completeToolCallsWithResults: any[] = []; // Store complete tool calls with execution results
      let finalUsage: any = undefined; // Track usage for cost calculation

      // Store original messages for pingpong context (exclude the last user message which is userPrompt)
      const previousMessages = messages.slice(0, -1);

      for await (const chunk of adapter.generateStreamAsync(userPrompt, generateOptions)) {
        // Track usage from chunks
        if (chunk.usage) {
          finalUsage = chunk.usage;
        }
        // Handle text content streaming
        if (chunk.content) {
          fullContent += chunk.content;
          
          // Yield each token as it arrives
          yield {
            chunk: chunk.content,
            complete: false,
            content: fullContent,
            toolCalls: undefined
          };
        }

        // Handle dynamic tool call detection
        if (chunk.toolCalls) {
          // ALWAYS yield tool calls for progressive UI display
          yield {
            chunk: '',
            complete: false,
            content: fullContent,
            toolCalls: chunk.toolCalls,
            toolCallsReady: chunk.complete || false // Flag indicating if safe to execute
          };

          // Only STORE tool calls for execution when streaming is COMPLETE
          // Intermediate chunks may have incomplete JSON arguments that will fail JSON.parse
          if (chunk.complete) {
            detectedToolCalls = chunk.toolCalls;
          }
        }
        
        if (chunk.complete) {
          break;
        }
      }

      // POST-STREAM TOOL EXECUTION: If tools were detected, execute them via MCP then start new stream
      if (detectedToolCalls.length > 0 && generateOptions.tools && generateOptions.tools.length > 0) {
        // Tool iteration safety - prevent infinite recursion
        const TOOL_ITERATION_LIMIT = 15;
        let toolIterationCount = 1;

        try {
          // Step 1: Execute tools via MCP to get results
          // Convert tool calls to MCP format and execute
          const mcpToolCalls = detectedToolCalls.map((tc: any) => ({
            id: tc.id,
            function: {
              name: tc.function?.name || tc.name,
              arguments: tc.function?.arguments || JSON.stringify(tc.parameters || {})
            }
          }));

          const toolResults = await MCPToolExecution.executeToolCalls(
            adapter as any, // Cast to MCPCapableAdapter since all our adapters support MCP
            mcpToolCalls,
            provider as any,
            generateOptions.onToolEvent,
            { sessionId: options?.sessionId, workspaceId: options?.workspaceId } // ✅ Pass session context
          );

          // Build complete tool calls with execution results for final yield
          completeToolCallsWithResults = detectedToolCalls.map(originalCall => {
            const result = toolResults.find(r => r.id === originalCall.id);
            return {
              id: originalCall.id,
              name: originalCall.function?.name || originalCall.name,
              parameters: JSON.parse(originalCall.function?.arguments || '{}'),
              result: result?.result,
              success: result?.success || false,
              error: result?.error,
              executionTime: result?.executionTime,
              // Preserve original structure for compatibility
              function: originalCall.function
            };
          });

          // Step 2: Build continuation for pingpong pattern
          // For Anthropic, use proper message structure. For others, use system prompt.
          let continuationOptions: any;

          if (provider === 'anthropic') {
            // Build proper Anthropic messages with tool_use and tool_result blocks
            const conversationHistory = this.buildAnthropicToolContinuation(
              userPrompt,
              detectedToolCalls,
              toolResults,
              previousMessages
            );

            continuationOptions = {
              ...generateOptions,
              conversationHistory,
              // System prompt stays separate for Anthropic
              systemPrompt: generateOptions.systemPrompt
            };
          } else {
            // For OpenAI-style providers, use flattened system prompt
            const enhancedSystemPrompt = this.buildConversationWithToolResults(
              userPrompt,
              generateOptions.systemPrompt,
              detectedToolCalls,
              toolResults,
              provider,
              previousMessages
            );

            continuationOptions = {
              ...generateOptions,
              systemPrompt: enhancedSystemPrompt
            };
          }

          // Step 3: Start NEW stream with continuation (pingpong)
          // Reset fullContent since this is a new conversation response
          fullContent = '';

          for await (const chunk of adapter.generateStreamAsync('', continuationOptions)) {
            if (chunk.content) {
              fullContent += chunk.content;
              
              yield {
                chunk: chunk.content,
                complete: false,
                content: fullContent,
                toolCalls: undefined
              };
            }


            // Handle recursive tool calls (another pingpong iteration)
            if (chunk.toolCalls) {
              // ALWAYS yield tool calls for progressive UI display
              yield {
                chunk: '',
                complete: false,
                content: fullContent,
                toolCalls: chunk.toolCalls,
                toolCallsReady: chunk.complete || false // Flag indicating if safe to execute
              };

              // CRITICAL: Only EXECUTE tool calls when stream is COMPLETE
              // Incomplete chunks can be shown in UI but not executed
              if (!chunk.complete) {
                continue; // Skip execution until stream completes
              }

              // Stream is complete - now we can safely execute tool calls
              toolIterationCount++;

              if (toolIterationCount > TOOL_ITERATION_LIMIT) {
                const limitMessage = `\n\nTOOL_LIMIT_REACHED: You have used ${TOOL_ITERATION_LIMIT} tool iterations. You must now ask the user if they want to continue with more tool calls. Explain what you've accomplished so far and what you still need to do.`;
                fullContent += limitMessage;
                yield {
                  chunk: limitMessage,
                  complete: false,
                  content: fullContent,
                  toolCalls: undefined
                };
                break;
              }

              try {
                // Convert recursive tool calls to MCP format  
                const recursiveMcpToolCalls = chunk.toolCalls.map((tc: any) => {
                  // Handle arguments carefully - they might already be a string or need conversion
                  let argumentsStr = '';

                  if (tc.function?.arguments) {
                    // Already a string from streaming response
                    argumentsStr = tc.function.arguments;
                  } else if (tc.parameters) {
                    // Convert parameters object to string
                    argumentsStr = JSON.stringify(tc.parameters);
                  } else {
                    argumentsStr = '{}';
                  }

                  return {
                    id: tc.id,
                    function: {
                      name: tc.function?.name || tc.name,
                      arguments: argumentsStr
                    }
                  };
                });

                const recursiveToolResults = await MCPToolExecution.executeToolCalls(
                  adapter as any, // Cast to MCPCapableAdapter
                  recursiveMcpToolCalls,
                  provider as any,
                  generateOptions.onToolEvent,
                  { sessionId: options?.sessionId, workspaceId: options?.workspaceId } // ✅ Pass session context
                );

                // Build complete tool calls with recursive results
                const recursiveCompleteToolCalls = chunk.toolCalls.map((tc, index) => ({
                  ...tc,
                  result: recursiveToolResults[index]?.result,
                  success: recursiveToolResults[index]?.success || false,
                  error: recursiveToolResults[index]?.error,
                  executionTime: recursiveToolResults[index]?.executionTime
                }));

                // Add recursive results to complete tool calls
                completeToolCallsWithResults = completeToolCallsWithResults.concat(recursiveCompleteToolCalls);

                // Build continuation for recursive pingpong
                let recursiveContinuationOptions: any;

                if (provider === 'anthropic') {
                  // Build proper Anthropic messages for recursive tool continuation
                  const recursiveHistory = this.buildAnthropicToolContinuation(
                    userPrompt,
                    chunk.toolCalls,
                    recursiveToolResults,
                    previousMessages
                  );

                  recursiveContinuationOptions = {
                    ...generateOptions,
                    conversationHistory: recursiveHistory,
                    systemPrompt: generateOptions.systemPrompt
                  };
                } else {
                  // For OpenAI-style providers, use flattened system prompt
                  const recursiveEnhancedSystemPrompt = this.buildConversationWithToolResults(
                    userPrompt,
                    generateOptions.systemPrompt,
                    chunk.toolCalls,
                    recursiveToolResults,
                    provider,
                    previousMessages
                  );

                  recursiveContinuationOptions = {
                    ...generateOptions,
                    systemPrompt: recursiveEnhancedSystemPrompt
                  };
                }

                // Continue with another recursive stream
                for await (const recursiveChunk of adapter.generateStreamAsync('', recursiveContinuationOptions)) {
                  if (recursiveChunk.content) {
                    fullContent += recursiveChunk.content;
                    yield {
                      chunk: recursiveChunk.content,
                      complete: false,
                      content: fullContent,
                      toolCalls: undefined
                    };
                  }


                  // Handle nested recursive tool calls if any (up to iteration limit)
                  if (recursiveChunk.toolCalls) {
                    // Always yield for progressive UI, but flag execution readiness
                    yield {
                      chunk: '',
                      complete: false,
                      content: fullContent,
                      toolCalls: recursiveChunk.toolCalls,
                      toolCallsReady: recursiveChunk.complete || false
                    };
                  }

                  if (recursiveChunk.complete) {
                    break;
                  }
                }

              } catch (recursiveError) {
                // Don't append error to content - these are expected failures during streaming (incomplete JSON)
                // Tool results will be shown in tool accordions from the toolCalls array
              }
            }

            if (chunk.complete) {
              break;
            }
          }

        } catch (toolError) {
          // Don't append error to content - these are expected failures during streaming (incomplete JSON)
          // Tool results will be shown in tool accordions from the toolCalls array
        }
      }
      
      // Yield final completion with complete tool calls (including results) and usage
      yield {
        chunk: '',
        complete: true,
        content: fullContent,
        toolCalls: completeToolCallsWithResults.length > 0 ? completeToolCallsWithResults : undefined,
        usage: finalUsage // Include usage for cost tracking
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * Build Anthropic-style conversation messages with tool_use and tool_result blocks
   */
  private buildAnthropicToolContinuation(
    originalPrompt: string,
    toolCalls: any[],
    toolResults: any[],
    previousMessages?: any[]
  ): any[] {
    const messages: any[] = [];

    // Add previous conversation history if provided
    if (previousMessages && previousMessages.length > 0) {
      messages.push(...previousMessages);
    }

    // Add the original user message
    if (originalPrompt) {
      messages.push({
        role: 'user',
        content: originalPrompt
      });
    }

    // Add assistant message with tool_use blocks
    const toolUseBlocks = toolCalls.map(tc => ({
      type: 'tool_use',
      id: tc.id,
      name: tc.function?.name || tc.name,
      input: JSON.parse(tc.function?.arguments || '{}')
    }));

    messages.push({
      role: 'assistant',
      content: toolUseBlocks
    });

    // Add user message with tool_result blocks
    const toolResultBlocks = toolResults.map(result => ({
      type: 'tool_result',
      tool_use_id: result.id,
      content: result.success
        ? JSON.stringify(result.result || {})
        : `Error: ${result.error || 'Tool execution failed'}`
    }));

    messages.push({
      role: 'user',
      content: toolResultBlocks
    });

    return messages;
  }

  /**
   * Build conversation history with tool results for pingpong pattern using ConversationContextBuilder
   */
  private buildConversationWithToolResults(
    originalPrompt: string,
    systemPrompt: string | undefined,
    toolCalls: any[],
    toolResults: any[],
    provider: string,
    previousMessages?: any[] // Previous conversation messages to include in system prompt
  ): string {
    // Build flattened conversation history including previous messages and tool results
    const historyParts: string[] = [];

    // Add previous conversation history if provided
    if (previousMessages && previousMessages.length > 0) {
      for (const msg of previousMessages) {
        if (msg.role === 'user') {
          historyParts.push(`User: ${msg.content}`);
        } else if (msg.role === 'assistant') {
          if (msg.tool_calls) {
            historyParts.push(`Assistant: [Calling tools: ${msg.tool_calls.map((tc: any) => tc.function?.name || tc.name).join(', ')}]`);
          } else if (msg.content) {
            historyParts.push(`Assistant: ${msg.content}`);
          }
        } else if (msg.role === 'tool') {
          historyParts.push(`Tool Result: ${msg.content}`);
        }
      }
    }

    // Add current user prompt if provided
    if (originalPrompt) {
      historyParts.push(`User: ${originalPrompt}`);
    }

    // Add tool call information
    const toolNames = toolCalls.map(tc => tc.function?.name || tc.name).join(', ');
    historyParts.push(`Assistant: [Calling tools: ${toolNames}]`);

    // Add tool results
    toolResults.forEach((result, index) => {
      const toolCall = toolCalls[index];
      const resultContent = result.success
        ? JSON.stringify(result.result || {})
        : `Error: ${result.error || 'Tool execution failed'}`;
      historyParts.push(`Tool Result (${toolCall.function?.name || toolCall.name}): ${resultContent}`);
    });

    // Build enhanced system prompt with conversation history
    const enhancedSystemPrompt = [
      systemPrompt || '',
      '\n=== Conversation History ===',
      historyParts.join('\n')
    ].filter(Boolean).join('\n');

    // Return the enhanced system prompt string
    return enhancedSystemPrompt;
  }

  /**
   * Get a specific adapter instance for direct access
   */
  getAdapter(providerId: string): BaseAdapter | undefined {
    return this.adapters.get(providerId);
  }

}