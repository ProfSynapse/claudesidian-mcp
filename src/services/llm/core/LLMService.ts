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
      onToolEvent?: (event: 'started' | 'completed', data: any) => void;
    }
  ): AsyncGenerator<{ chunk: string; complete: boolean; content: string; toolCalls?: any[] }, void, unknown> {
    try {
      // Clean logs - only show tool count for debugging tool calls
      if (options?.tools && options.tools.length > 0) {
        console.log(`[LLMService] Using tools: ${options.tools.length} available`);
      }

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

      // Adapter info only when using tools
      if (options?.tools && options.tools.length > 0) {
        console.log(`[LLMService] ${provider} adapter will handle ${options.tools.length} tools`);
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

      console.log('[LLM-ACTUAL] ========== WHAT LLM ACTUALLY RECEIVES ==========');
      console.log('[LLM-ACTUAL] userPrompt:', userPrompt);
      console.log('[LLM-ACTUAL] systemPrompt (with history):', systemPrompt);
      console.log('[LLM-ACTUAL] Conversation history included:', conversationHistory ? 'YES' : 'NO');
      console.log('[LLM-ACTUAL] History length:', conversationHistory.length, 'chars');
      console.log('[LLM-ACTUAL] ========== END WHAT LLM RECEIVES ==========');

      // Build generate options with tools
      const generateOptions = {
        model,
        systemPrompt: systemPrompt || options?.systemPrompt,
        tools: options?.tools,
        onToolEvent: options?.onToolEvent // Pass through tool event callback for live UI updates
      };

      console.log('[LLMService Debug] generateOptions built with onToolEvent:', !!generateOptions.onToolEvent);

      // Remove verbose logging - only show model when using tools
      if (generateOptions.tools && generateOptions.tools.length > 0) {
        console.log(`[LLMService] Model: ${generateOptions.model}, Tools: ${generateOptions.tools.length}`);
      }

      // STREAMING-FIRST APPROACH: Use streaming for all providers
      // Tool calls are detected dynamically during the stream
      console.log(`[LLMService] ${provider}: Using streaming-first approach (tools will be detected dynamically)`);
      
      // Note: Perplexity doesn't support tool calls, so it will just stream normally

      // Stream tokens using the new async generator method
      let fullContent = '';
      let detectedToolCalls: any[] = [];
      let completeToolCallsWithResults: any[] = []; // Store complete tool calls with execution results
      
      for await (const chunk of adapter.generateStreamAsync(userPrompt, generateOptions)) {
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
          console.log(`[LLMService] Tool calls detected during streaming: ${chunk.toolCalls.length} tools`);
          
          // Only store tool calls for post-stream execution if they're complete
          // We know they're complete when the chunk is marked as complete OR
          // when we get a subsequent chunk without tool calls (meaning they're finalized)
          if (chunk.complete) {
            console.log('[LLMService] Final tool calls captured for post-stream execution');
            detectedToolCalls = chunk.toolCalls;
          } else {
            // For intermediate chunks, only update if we don't have any yet (first detection)
            // or if this chunk has more complete arguments (longer JSON strings)
            if (detectedToolCalls.length === 0) {
              detectedToolCalls = chunk.toolCalls;
              console.log('[LLMService] First tool call detection - storing for post-stream execution');
            } else {
              // Compare argument completeness - use the chunk with more complete arguments
              const currentArgLength = detectedToolCalls.reduce((sum, tc) => sum + (tc.function?.arguments?.length || 0), 0);
              const newArgLength = chunk.toolCalls.reduce((sum, tc) => sum + (tc.function?.arguments?.length || 0), 0);
              
              if (newArgLength > currentArgLength) {
                detectedToolCalls = chunk.toolCalls;
                console.log(`[LLMService] Updated tool calls with more complete arguments: ${newArgLength} vs ${currentArgLength} chars`);
              }
            }
          }
          
          // Yield tool calls for UI to show progressive accordions
          yield {
            chunk: '',
            complete: false,
            content: fullContent,
            toolCalls: chunk.toolCalls
          };
        }
        
        if (chunk.complete) {
          break;
        }
      }
      
      // POST-STREAM TOOL EXECUTION: If tools were detected, execute them via MCP then start new stream
      if (detectedToolCalls.length > 0 && generateOptions.tools && generateOptions.tools.length > 0) {
        console.log(`[LLMService] Stream complete, executing ${detectedToolCalls.length} detected tool calls via MCP`);
        
        // Tool iteration safety - prevent infinite recursion
        const TOOL_ITERATION_LIMIT = 15;
        let toolIterationCount = 1;
        
        try {
          // Step 1: Execute tools via MCP to get results
          console.log('[LLMService] Executing detected tool calls via MCP...');
          
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
            generateOptions.onToolEvent
          );
          
          console.log(`[LLMService] Tool execution completed, got ${toolResults.length} results`);
          
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
          
          console.log(`[LLMService] Built complete tool calls with results: ${completeToolCallsWithResults.length} tools`);
          
          // Step 2: Build conversation history with tool results for pingpong
          const conversationHistory = this.buildConversationWithToolResults(
            userPrompt, 
            generateOptions.systemPrompt,
            detectedToolCalls, 
            toolResults,
            provider
          );
          
          console.log('[LLMService] Starting NEW stream for AI response to tool results...');

          // Step 3: Start NEW stream with conversation history (pingpong)
          // Reset fullContent since this is a new conversation response
          fullContent = '';

          for await (const chunk of adapter.generateStreamAsync('', {
            ...generateOptions,
            // Keep tools available for continued tool calling after seeing results
            // Pass conversation history for pingpong
            conversationHistory: conversationHistory
          })) {
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
              console.log(`[LLMService] Detected additional tool calls in response: ${chunk.toolCalls.length}`);
              console.log(`[LLMService] Raw chunk.toolCalls structure:`, JSON.stringify(chunk.toolCalls, null, 2));
              
              // Log each tool call structure for debugging
              chunk.toolCalls.forEach((tc: any, index: number) => {
                console.log(`[LLMService] Tool call ${index + 1}:`, {
                  id: tc.id,
                  name: tc.name || tc.function?.name,
                  hasFunction: !!tc.function,
                  hasArguments: !!tc.function?.arguments,
                  hasParameters: !!tc.parameters,
                  argumentsType: typeof tc.function?.arguments,
                  argumentsLength: tc.function?.arguments?.length || 0,
                  argumentsPreview: tc.function?.arguments?.slice(0, 100) + (tc.function?.arguments?.length > 100 ? '...' : ''),
                  parametersKeys: tc.parameters ? Object.keys(tc.parameters) : []
                });
              });
              
              // Yield the tool calls to UI first (for progressive display)
              yield {
                chunk: '',
                complete: false,
                content: fullContent,
                toolCalls: chunk.toolCalls
              };

              // Execute the additional tool calls recursively with iteration limit check
              toolIterationCount++;
              console.log(`[LLMService] Tool iteration ${toolIterationCount}/${TOOL_ITERATION_LIMIT}`);
              
              if (toolIterationCount > TOOL_ITERATION_LIMIT) {
                console.log(`[LLMService] Hit ${TOOL_ITERATION_LIMIT} tool iteration limit - stopping recursive execution`);
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
              
              console.log(`[LLMService] Executing additional tool calls recursively...`);
              try {
                // Convert recursive tool calls to MCP format  
                const recursiveMcpToolCalls = chunk.toolCalls.map((tc: any, index: number) => {
                  // Handle arguments carefully - they might already be a string or need conversion
                  let argumentsStr = '';
                  let conversionMethod = '';
                  
                  if (tc.function?.arguments) {
                    // Already a string from streaming response
                    argumentsStr = tc.function.arguments;
                    conversionMethod = 'function.arguments (direct)';
                  } else if (tc.parameters) {
                    // Convert parameters object to string
                    argumentsStr = JSON.stringify(tc.parameters);
                    conversionMethod = 'parameters (JSON.stringify)';
                  } else {
                    argumentsStr = '{}';
                    conversionMethod = 'empty default';
                  }
                  
                  console.log(`[LLMService] MCP Tool Call ${index + 1} conversion:`, {
                    originalId: tc.id,
                    originalName: tc.name || tc.function?.name,
                    conversionMethod,
                    argumentsLength: argumentsStr.length,
                    argumentsPreview: argumentsStr.slice(0, 150) + (argumentsStr.length > 150 ? '...' : ''),
                    isValidJSON: (() => {
                      try { JSON.parse(argumentsStr); return true; } catch { return false; }
                    })()
                  });
                  
                  return {
                    id: tc.id,
                    function: {
                      name: tc.function?.name || tc.name,
                      arguments: argumentsStr
                    }
                  };
                });
                
                console.log(`[LLMService] Converted ${recursiveMcpToolCalls.length} tool calls to MCP format`);
                
                const recursiveToolResults = await MCPToolExecution.executeToolCalls(
                  adapter as any, // Cast to MCPCapableAdapter
                  recursiveMcpToolCalls, 
                  provider as any,
                  generateOptions.onToolEvent
                );

                console.log(`[LLMService] Recursive tool execution completed, got ${recursiveToolResults.length} results`);

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

                // Build new conversation history with recursive tool results
                const recursiveConversationHistory = this.buildConversationWithToolResults(
                  userPrompt,
                  generateOptions.systemPrompt, 
                  chunk.toolCalls,
                  recursiveToolResults,
                  provider
                );

                console.log('[LLMService] Starting RECURSIVE stream for AI response to additional tool results...');
                
                // Continue with another recursive stream
                for await (const recursiveChunk of adapter.generateStreamAsync('', {
                  ...generateOptions,
                  conversationHistory: recursiveConversationHistory
                })) {
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
                    console.log(`[LLMService] Detected nested tool calls: ${recursiveChunk.toolCalls.length} - yielding to UI only to prevent deep recursion`);
                    yield {
                      chunk: '',
                      complete: false, 
                      content: fullContent,
                      toolCalls: recursiveChunk.toolCalls
                    };
                  }

                  if (recursiveChunk.complete) {
                    console.log(`[LLMService] Recursive stream complete`);
                    break;
                  }
                }

              } catch (recursiveError) {
                console.error('[LLMService] Recursive tool execution failed:', recursiveError);
                // Don't append error to content - these are expected failures during streaming (incomplete JSON)
                // Tool results will be shown in tool accordions from the toolCalls array
              }
            }
            
            if (chunk.complete) {
              console.log(`[LLMService] Tool response stream complete, final content length: ${fullContent.length}`);
              break;
            }
          }
          
        } catch (toolError) {
          console.error('[LLMService] Tool execution failed:', toolError);
          // Don't append error to content - these are expected failures during streaming (incomplete JSON)
          // Tool results will be shown in tool accordions from the toolCalls array
        }
      }
      
      // Yield final completion with complete tool calls (including results)
      yield {
        chunk: '',
        complete: true,
        content: fullContent,
        toolCalls: completeToolCallsWithResults.length > 0 ? completeToolCallsWithResults : undefined
      };

    } catch (error) {
      console.error('[LLMService] generateResponseStream failed:', error);
      throw error;
    }
  }

  /**
   * Build conversation history with tool results for pingpong pattern using ConversationContextBuilder
   */
  private buildConversationWithToolResults(
    originalPrompt: string,
    systemPrompt: string | undefined,
    toolCalls: any[],
    toolResults: any[],
    provider: string
  ): any[] {
    // Convert tool calls and results to ConversationData format
    const conversationData: ConversationData = {
      id: 'temp',
      title: 'Tool Execution',
      created: Date.now(),
      updated: Date.now(),
      messages: [
        // User message
        {
          id: 'user-1',
          role: 'user' as const,
          content: originalPrompt,
          timestamp: Date.now(),
          conversationId: 'temp'
        },
        // Assistant message with tool calls
        {
          id: 'assistant-1',
          role: 'assistant' as const,
          content: '',
          timestamp: Date.now(),
          conversationId: 'temp',
          toolCalls: toolCalls.map((tc, index) => ({
            id: tc.id,
            type: tc.type || 'function',
            name: tc.function?.name || tc.name,
            function: tc.function || {
              name: tc.function?.name || tc.name || '',
              arguments: tc.function?.arguments || JSON.stringify(tc.parameters || {})
            },
            parameters: tc.function?.arguments ? JSON.parse(tc.function.arguments) : (tc.parameters || {}),
            result: toolResults[index]?.result,
            success: toolResults[index]?.success || false,
            error: toolResults[index]?.error,
            executionTime: toolResults[index]?.executionTime
          }))
        }
      ],
    };
    
    // Use ConversationContextBuilder to build proper conversation context
    return ConversationContextBuilder.buildContextForProvider(conversationData, provider, systemPrompt);
  }

  /**
   * Get a specific adapter instance for direct access
   */
  getAdapter(providerId: string): BaseAdapter | undefined {
    return this.adapters.get(providerId);
  }

}