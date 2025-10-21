/**
 * OpenRouter Adapter - Clean implementation with centralized SSE streaming
 * Supports 400+ models through OpenRouter's unified API
 * Uses BaseAdapter's processSSEStream for reliable streaming
 */

import { BaseAdapter } from '../BaseAdapter';
import {
  GenerateOptions,
  StreamChunk,
  LLMResponse,
  ModelInfo,
  ProviderCapabilities,
  ModelPricing,
  SearchResult
} from '../types';
import { ModelRegistry } from '../ModelRegistry';
import { MCPToolExecution, MCPCapableAdapter } from '../shared/MCPToolExecution';
import { WebSearchUtils } from '../../utils/WebSearchUtils';

export class OpenRouterAdapter extends BaseAdapter implements MCPCapableAdapter {
  readonly name = 'openrouter';
  readonly baseUrl = 'https://openrouter.ai/api/v1';
  
  mcpConnector?: any;

  constructor(apiKey: string, mcpConnector?: any) {
    super(apiKey, 'anthropic/claude-3.5-sonnet');
    this.mcpConnector = mcpConnector;
    this.initializeCache();
  }

  /**
   * Generate response without caching
   */
  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    try {
      // Validate web search support
      if (options?.webSearch) {
        WebSearchUtils.validateWebSearchRequest('openrouter', options.webSearch);
      }

      const baseModel = options?.model || this.currentModel;

      // Add :online suffix for web search
      const model = options?.webSearch ? `${baseModel}:online` : baseModel;

      // Handle post-stream tool execution: if detectedToolCalls are provided, execute only tools
      if (options?.detectedToolCalls && options.detectedToolCalls.length > 0) {
        return await this.executeDetectedToolCalls(options.detectedToolCalls, model, prompt, options);
      }

      // If tools are provided (pre-converted by ChatService), use tool-enabled generation
      if (options?.tools && options.tools.length > 0) {
        return await this.generateWithProvidedTools(prompt, options);
      }

      const requestBody = {
        model,
        messages: this.buildMessages(prompt, options?.systemPrompt),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        frequency_penalty: options?.frequencyPenalty,
        presence_penalty: options?.presencePenalty,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        stop: options?.stopSequences,
        tools: options?.tools,
        usage: { include: true } // Enable token usage and cost tracking
      };

      console.log('[OpenRouter Cost Debug] Request body includes usage parameter:', {
        model,
        hasUsageParam: !!requestBody.usage,
        usageParam: requestBody.usage
      });

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.buildHeaders(),
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://www.synapticlabs.ai',
          'X-Title': 'Claudesidian'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      console.log('[OpenRouter Cost Debug] Non-streaming response received:', {
        hasUsage: !!data.usage,
        usage: data.usage,
        hasChoices: !!data.choices,
        // Check for usage in different possible locations
        topLevelUsage: data.usage,
        choiceUsage: data.choices?.[0]?.usage,
        metadataUsage: data.metadata?.usage,
        fullResponse: JSON.stringify(data, null, 2)
      });

      const text = data.choices[0]?.message?.content || '';
      const usage = this.extractUsage(data);
      console.log('[OpenRouter Cost Debug] Extracted usage:', usage);
      const finishReason = data.choices[0]?.finish_reason || 'stop';

      // Extract web search results if web search was enabled
      const webSearchResults = options?.webSearch
        ? this.extractOpenRouterSources(data)
        : undefined;

      return this.buildLLMResponse(
        text,
        baseModel, // Use base model name, not :online version
        usage,
        { webSearchResults },
        finishReason as any
      );
    } catch (error) {
      throw this.handleError(error, 'generation');
    }
  }

  /**
   * Generate streaming response using unified stream processing
   * Uses processStream which automatically handles SSE parsing and tool call accumulation
   */
  async* generateStreamAsync(prompt: string, options?: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      // Validate web search support
      if (options?.webSearch) {
        WebSearchUtils.validateWebSearchRequest('openrouter', options.webSearch);
      }

      const baseModel = options?.model || this.currentModel;

      // Add :online suffix for web search
      const model = options?.webSearch ? `${baseModel}:online` : baseModel;

      const requestBody = {
        model,
        messages: options?.conversationHistory || this.buildMessages(prompt, options?.systemPrompt),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        frequency_penalty: options?.frequencyPenalty,
        presence_penalty: options?.presencePenalty,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        stop: options?.stopSequences,
        tools: options?.tools,
        stream: true // Enable streaming
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.buildHeaders(),
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://www.synapticlabs.ai',
          'X-Title': 'Claudesidian'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[OpenRouter-DEBUG-ERROR] Streaming response body:', errorBody);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorBody}`);
      }

      // Track generation ID for async usage retrieval
      let generationId: string | null = null;
      let usageFetchTriggered = false;

      // Use unified stream processing (automatically uses SSE parsing for Response objects)
      yield* this.processStream(response, {
        debugLabel: 'OpenRouter',

        extractContent: (parsed: any) => {
          // Capture generation ID from first chunk
          if (!generationId && parsed.id) {
            generationId = parsed.id;
            console.log('[OpenRouter Streaming] Generation ID captured:', generationId);
          }

          // Process all available choices - reasoning models may use multiple choices
          // Choice 0 might be reasoning, Choice 1 might be actual response
          for (const choice of parsed.choices || []) {
            const delta = choice?.delta;
            const content = delta?.content || delta?.text || choice?.text;
            if (content) {
              return content;
            }
          }
          return null;
        },

        extractToolCalls: (parsed: any) => {
          // Extract tool calls from any choice that has them
          for (const choice of parsed.choices || []) {
            const toolCalls = choice?.delta?.tool_calls || choice?.delta?.toolCalls;
            if (toolCalls) {
              return toolCalls;
            }
          }
          return null;
        },

        extractFinishReason: (parsed: any) => {
          // Extract finish reason from any choice
          for (const choice of parsed.choices || []) {
            if (choice?.finish_reason) {
              // When we detect completion, trigger async usage fetch (only once)
              if (generationId && options?.onUsageAvailable && !usageFetchTriggered) {
                usageFetchTriggered = true;
                console.log('[OpenRouter Streaming] Triggering async usage fetch for generation:', generationId);

                // Fire and forget - don't await
                this.fetchAndNotifyUsage(generationId, baseModel, options.onUsageAvailable).catch(error => {
                  console.error('[OpenRouter Streaming] Error in async usage fetch:', error);
                });
              }

              return choice.finish_reason;
            }
          }
          return null;
        },

        extractUsage: (parsed: any) => {
          // OpenRouter doesn't include usage in streaming responses
          // We'll fetch it asynchronously using the generation ID when completion is detected
          return null;
        }
      });

    } catch (error) {
      throw this.handleError(error, 'streaming generation');
    }
  }

  /**
   * Fetch usage data and notify via callback - runs asynchronously after streaming completes
   */
  private async fetchAndNotifyUsage(
    generationId: string,
    model: string,
    onUsageAvailable: (usage: any, cost?: any) => void
  ): Promise<void> {
    try {
      console.log('[OpenRouter Async] Fetching usage for generation:', generationId);

      const usage = await this.fetchGenerationStats(generationId);

      if (!usage) {
        console.warn('[OpenRouter Async] Failed to fetch usage data');
        return;
      }

      console.log('[OpenRouter Async] ✓ Usage data retrieved:', usage);

      // Calculate cost
      const cost = await this.calculateCost(usage, model);

      if (cost) {
        console.log('[OpenRouter Async] ✓ Cost calculated:', cost);
      }

      // Notify via callback
      onUsageAvailable(usage, cost || undefined);
      console.log('[OpenRouter Async] ✓ Callback notified with usage and cost');

    } catch (error) {
      console.error('[OpenRouter Async] Error fetching/calculating usage:', error);
      throw error;
    }
  }

  /**
   * Fetch generation statistics from OpenRouter using generation ID with exponential backoff
   * This is the proper way to get token usage and cost for streaming requests
   */
  private async fetchGenerationStats(generationId: string): Promise<{ promptTokens: number; completionTokens: number; totalTokens: number } | null> {
    const maxRetries = 5;
    const baseDelay = 800; // Start with 800ms (stats typically ready after ~800ms)
    const incrementDelay = 200; // Increment by 200ms each retry

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Linear backoff: 800ms, 1000ms, 1200ms, 1400ms, 1600ms
        if (attempt > 0) {
          const delay = baseDelay + (incrementDelay * attempt);
          console.log(`[OpenRouter] Retry ${attempt}/${maxRetries - 1} - waiting ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const response = await fetch(`${this.baseUrl}/generation?id=${generationId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://www.synapticlabs.ai',
            'X-Title': 'Claudesidian'
          }
        });

        if (response.status === 404) {
          // Stats not ready yet, retry
          console.log(`[OpenRouter] Generation stats not ready yet (404), attempt ${attempt + 1}/${maxRetries}`);
          continue;
        }

        if (!response.ok) {
          console.error('[OpenRouter] Failed to fetch generation stats:', response.status, response.statusText);
          return null;
        }

        const data = await response.json();
        console.log('[OpenRouter] Generation stats response:', data);

        // Extract token counts from response
        // OpenRouter returns: tokens_prompt, tokens_completion, native_tokens_prompt, native_tokens_completion
        const promptTokens = data.data?.native_tokens_prompt || data.data?.tokens_prompt || 0;
        const completionTokens = data.data?.native_tokens_completion || data.data?.tokens_completion || 0;

        if (promptTokens > 0 || completionTokens > 0) {
          console.log(`[OpenRouter] ✓ Successfully fetched stats on attempt ${attempt + 1}`);
          return {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens
          };
        }

        // Data returned but no tokens - might not be ready yet
        console.log(`[OpenRouter] Stats returned but no tokens yet, attempt ${attempt + 1}/${maxRetries}`);

      } catch (error) {
        console.error(`[OpenRouter] Error fetching generation stats (attempt ${attempt + 1}):`, error);
        if (attempt === maxRetries - 1) {
          return null;
        }
      }
    }

    console.error('[OpenRouter] Failed to fetch generation stats after all retries');
    return null;
  }

  /**
   * List available models
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      // Use centralized model registry
      const openrouterModels = ModelRegistry.getProviderModels('openrouter');
      return openrouterModels.map(model => ModelRegistry.toModelInfo(model));
    } catch (error) {
      this.handleError(error, 'listing models');
      return [];
    }
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities {
    const baseCapabilities = {
      supportsStreaming: true,
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsThinking: false,
      maxContextWindow: 2000000, // Varies by model
      supportedFeatures: [
        'streaming',
        'json_mode',
        'function_calling',
        'image_input',
        '400+ models'
      ]
    };

    // Add MCP support if available
    if (this.supportsMCP()) {
      baseCapabilities.supportedFeatures.push('mcp_integration');
    }

    return baseCapabilities;
  }

  /**
   * Check if MCP is available via connector
   */
  supportsMCP(): boolean {
    return MCPToolExecution.supportsMCP(this);
  }

  /**
   * Generate with pre-converted tools (from ChatService) using iterative execution
   */
  private async generateWithProvidedTools(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    // Use centralized tool execution wrapper to eliminate code duplication
    const model = options?.model || this.currentModel;

    
    return MCPToolExecution.executeWithToolSupport(
      this,
      'openrouter',
      {
        model,
        tools: options?.tools || [],
        prompt,
        systemPrompt: options?.systemPrompt,
        onToolEvent: options?.onToolEvent
      },
      {
        buildMessages: (prompt: string, systemPrompt?: string) => 
          this.buildMessages(prompt, systemPrompt),
        
        buildRequestBody: (messages: any[], isInitial: boolean) => ({
          model,
          messages,
          tools: options?.tools,
          tool_choice: 'auto',
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
          top_p: options?.topP,
          frequency_penalty: options?.frequencyPenalty,
          presence_penalty: options?.presencePenalty,
          response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
          stop: options?.stopSequences,
          usage: { include: true } // Enable token usage and cost tracking
        }),
        
        makeApiCall: async (requestBody: any) => {
          return await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              ...this.buildHeaders(),
              'Authorization': `Bearer ${this.apiKey}`,
              'HTTP-Referer': 'https://www.synapticlabs.ai',
              'X-Title': 'Claudesidian'
            },
            body: JSON.stringify(requestBody)
          });
        },
        
        extractResponse: async (response: Response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const data = await response.json();
          const choice = data.choices[0];
          
          return {
            content: choice?.message?.content || '',
            usage: this.extractUsage(data),
            finishReason: choice?.finish_reason || 'stop',
            toolCalls: choice?.message?.toolCalls,
            choice: choice
          };
        },
        
        buildLLMResponse: async (
          content: string,
          model: string,
          usage?: any,
          metadata?: any,
          finishReason?: any,
          toolCalls?: any[]
        ) => {
          return this.buildLLMResponse(content, model, usage, metadata, finishReason, toolCalls);
        }
      }
    );
  }

  /**
   * Execute detected tool calls from streaming and get AI response
   * Used for post-stream tool execution - implements pingpong pattern
   */
  private async executeDetectedToolCalls(detectedToolCalls: any[], model: string, prompt: string, options?: GenerateOptions): Promise<LLMResponse> {

    try {
      // Convert to MCP format
      const mcpToolCalls: any[] = detectedToolCalls.map((tc: any) => ({
        id: tc.id,
        function: {
          name: tc.function?.name || tc.name,
          arguments: tc.function?.arguments || JSON.stringify(tc.parameters || {})
        }
      }));

      // Execute tool calls directly using MCPToolExecution
      const toolResults = await MCPToolExecution.executeToolCalls(
        this, 
        mcpToolCalls, 
        'openrouter',
        options?.onToolEvent
      );


      // Now do the "pingpong" - send the conversation with tool results back to the LLM
      const messages = this.buildMessages(prompt, options?.systemPrompt);
      
      // Add the assistant message with tool calls
      messages.push({
        role: 'assistant' as const,
        content: '', // Empty content since this was a tool call
        toolCalls: detectedToolCalls
      });

      // Add tool result messages
      const toolMessages = MCPToolExecution.buildToolMessages(toolResults, 'openrouter');
      messages.push(...toolMessages);


      // Make API call to get AI's response to the tool results
      const requestBody = {
        model,
        messages,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        frequency_penalty: options?.frequencyPenalty,
        presence_penalty: options?.presencePenalty,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        stop: options?.stopSequences,
        usage: { include: true } // Enable token usage and cost tracking
      };
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.buildHeaders(),
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://www.synapticlabs.ai',
          'X-Title': 'Claudesidian'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const choice = data.choices[0];
      const finalContent = choice?.message?.content || 'No response from AI after tool execution';
      const usage = this.extractUsage(data);


      // Combine original tool calls with their execution results
      const completeToolCalls = detectedToolCalls.map(originalCall => {
        const result = toolResults.find(r => r.id === originalCall.id);
        return {
          id: originalCall.id,
          name: originalCall.function?.name || originalCall.name,
          parameters: JSON.parse(originalCall.function?.arguments || '{}'),
          result: result?.result,
          success: result?.success || false,
          error: result?.error,
          executionTime: result?.executionTime
        };
      });

      // Return LLMResponse with AI's natural language response to tool results
      return this.buildLLMResponse(
        finalContent,
        model,
        usage,
        MCPToolExecution.buildToolMetadata(toolResults),
        choice?.finish_reason || 'stop',
        completeToolCalls
      );

    } catch (error) {
      console.error('[OpenRouter Adapter] Post-stream tool execution failed:', error);
      throw this.handleError(error, 'post-stream tool execution');
    }
  }

  /**
   * Extract search results from OpenRouter response annotations
   */
  private extractOpenRouterSources(response: any): SearchResult[] {
    try {
      const annotations = response.choices?.[0]?.message?.annotations || [];
      const sources = annotations
        .filter((ann: any) => ann.type === 'url_citation')
        .map((ann: any) => {
          const citation = ann.url_citation;
          return WebSearchUtils.validateSearchResult({
            title: citation?.title || citation?.text || 'Unknown Source',
            url: citation?.url,
            date: citation?.date || citation?.timestamp
          });
        })
        .filter((result: SearchResult | null): result is SearchResult => result !== null);

      return sources;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get model pricing
   */
  async getModelPricing(modelId: string): Promise<ModelPricing | null> {
    try {
      console.log('[OpenRouter Cost Debug] getModelPricing called with modelId:', modelId);
      const models = ModelRegistry.getProviderModels('openrouter');
      console.log('[OpenRouter Cost Debug] Available models:', models.map(m => m.apiName));
      const model = models.find(m => m.apiName === modelId);
      if (!model) {
        console.warn('[OpenRouter Cost Debug] Model not found in registry:', modelId);
        return null;
      }

      console.log('[OpenRouter Cost Debug] Model found:', {
        apiName: model.apiName,
        inputCost: model.inputCostPerMillion,
        outputCost: model.outputCostPerMillion
      });

      return {
        rateInputPerMillion: model.inputCostPerMillion,
        rateOutputPerMillion: model.outputCostPerMillion,
        currency: 'USD'
      };
    } catch (error) {
      console.warn(`[OpenRouter Cost Debug] Failed to get pricing for model ${modelId}:`, error);
      return null;
    }
  }
}