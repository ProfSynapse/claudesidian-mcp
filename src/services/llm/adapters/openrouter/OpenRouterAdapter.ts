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
import { ReasoningPreserver } from '../shared/ReasoningPreserver';
import { WebSearchUtils } from '../../utils/WebSearchUtils';
import { BRAND_NAME } from '../../../../constants/branding';

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
        tools: options?.tools ? this.convertTools(options.tools) : undefined,
        usage: { include: true } // Enable token usage and cost tracking
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.buildHeaders(),
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://www.synapticlabs.ai',
          'X-Title': BRAND_NAME
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      const text = data.choices[0]?.message?.content || '';
      const usage = this.extractUsage(data);
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

      const messages = options?.conversationHistory || this.buildMessages(prompt, options?.systemPrompt);

      // Check if this model requires reasoning preservation (Gemini via OpenRouter)
      const needsReasoning = ReasoningPreserver.requiresReasoningPreservation(baseModel, 'openrouter');
      const hasTools = options?.tools && options.tools.length > 0;

      const requestBody: any = {
        model,
        messages,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        frequency_penalty: options?.frequencyPenalty,
        presence_penalty: options?.presencePenalty,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        stop: options?.stopSequences,
        tools: options?.tools ? this.convertTools(options.tools) : undefined,
        stream: true,
        // Enable reasoning for Gemini models to capture thought signatures
        ...ReasoningPreserver.getReasoningRequestParams(baseModel, 'openrouter', hasTools || false)
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.buildHeaders(),
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://www.synapticlabs.ai',
          'X-Title': BRAND_NAME
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorBody}`);
      }

      // Track generation ID for async usage retrieval
      let generationId: string | null = null;
      let usageFetchTriggered = false;
      // Track reasoning data for models that need preservation (Gemini via OpenRouter)
      // Gemini requires TWO different fields for tool continuations:
      // - reasoning_details: array of reasoning objects from OpenRouter
      // - thought_signature: string signature required by Google for function call continuations
      let capturedReasoning: any[] | undefined = undefined;
      let capturedThoughtSignature: string | undefined = undefined;

      // Use unified stream processing (automatically uses SSE parsing for Response objects)
      yield* this.processStream(response, {
        debugLabel: 'OpenRouter',

        extractContent: (parsed: any) => {
          // Capture generation ID from first chunk
          if (!generationId && parsed.id) {
            generationId = parsed.id;
          }

          // Capture reasoning_details for Gemini models (required for tool continuations)
          if (needsReasoning && !capturedReasoning) {
            capturedReasoning =
              parsed.reasoning_details ||
              parsed.choices?.[0]?.message?.reasoning_details ||
              parsed.choices?.[0]?.delta?.reasoning_details ||
              parsed.choices?.[0]?.reasoning_details ||
              ReasoningPreserver.extractFromStreamChunk(parsed);

            if (capturedReasoning) {
              console.log('[OpenRouter:1] ✅ Captured reasoning_details from stream:',
                JSON.stringify(capturedReasoning).substring(0, 150) + '...');
              // DEBUG: Check what else is in the chunk that has reasoning_details
              const delta = parsed.choices?.[0]?.delta;
              console.log('[OpenRouter DEBUG] Chunk with reasoning_details:', {
                parsed_keys: Object.keys(parsed),
                delta_keys: delta ? Object.keys(delta) : 'no delta',
                delta_full: JSON.stringify(delta).substring(0, 500)
              });
            }
          }

          // Capture thought_signature for Gemini models (OpenAI compatibility format)
          // Per Google docs, this can be in: extra_content.google.thought_signature
          // or directly on the delta/message
          if (needsReasoning && !capturedThoughtSignature) {
            const delta = parsed.choices?.[0]?.delta;
            const message = parsed.choices?.[0]?.message;

            capturedThoughtSignature =
              // OpenAI compatibility format per Google docs
              delta?.extra_content?.google?.thought_signature ||
              message?.extra_content?.google?.thought_signature ||
              parsed.extra_content?.google?.thought_signature ||
              // Direct formats
              delta?.thought_signature ||
              delta?.thoughtSignature ||
              message?.thought_signature ||
              message?.thoughtSignature ||
              parsed.thought_signature ||
              parsed.thoughtSignature;

            if (capturedThoughtSignature) {
              console.log('[OpenRouter:1b] ✅ Captured thought_signature from stream:',
                capturedThoughtSignature.substring(0, 50) + '...');
            }
          }

          // Process all available choices - reasoning models may use multiple choices
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
            let toolCalls = choice?.delta?.tool_calls || choice?.delta?.toolCalls;
            if (toolCalls) {
              // DEBUG: Dump full structure to find where thought_signature is
              console.log('[OpenRouter DEBUG] Full parsed structure with tool_calls:', {
                parsed_keys: Object.keys(parsed),
                choice_keys: Object.keys(choice),
                delta_keys: choice?.delta ? Object.keys(choice.delta) : 'no delta',
                toolCall_0_keys: toolCalls[0] ? Object.keys(toolCalls[0]) : 'no tc',
                toolCall_0_full: JSON.stringify(toolCalls[0]).substring(0, 300),
                choice_delta_full: JSON.stringify(choice?.delta).substring(0, 500),
                parsed_extra_content: parsed.extra_content,
                choice_extra_content: choice.extra_content,
                delta_extra_content: choice?.delta?.extra_content
              });

              // Extract reasoning_details from this chunk (it may contain encrypted thought signatures)
              const chunkReasoningDetails = choice?.delta?.reasoning_details;
              if (chunkReasoningDetails && Array.isArray(chunkReasoningDetails)) {
                // Look for reasoning.encrypted entries - these contain the thought_signature
                for (const entry of chunkReasoningDetails) {
                  if (entry.type === 'reasoning.encrypted' && entry.data && entry.id) {
                    // Match encrypted entry to tool call by id
                    for (const tc of toolCalls) {
                      if (tc.id === entry.id || tc.id?.startsWith(entry.id?.split('_').slice(0, -1).join('_'))) {
                        tc.thought_signature = entry.data;
                        console.log('[OpenRouter:1c] ✅ Extracted thought_signature from reasoning.encrypted for tool:', tc.id);
                      }
                    }
                    // Also store as fallback
                    if (!capturedThoughtSignature) {
                      capturedThoughtSignature = entry.data;
                    }
                  }
                }
                // Update capturedReasoning to include all entries (both text and encrypted)
                if (!capturedReasoning) {
                  capturedReasoning = chunkReasoningDetails;
                } else if (Array.isArray(capturedReasoning)) {
                  // Merge in new entries
                  capturedReasoning = [...capturedReasoning, ...chunkReasoningDetails];
                }
              }

              // Also check direct thought_signature fields (fallback)
              for (const tc of toolCalls) {
                const tcThoughtSig =
                  tc.thought_signature ||
                  tc.thoughtSignature ||
                  tc.extra_content?.google?.thought_signature;
                if (tcThoughtSig && !tc.thought_signature) {
                  tc.thought_signature = tcThoughtSig;
                  console.log('[OpenRouter:1c] ✅ Found direct thought_signature on tool_call');
                }
              }

              // Attach reasoning data (both reasoning_details AND thought_signature)
              const hasReasoning = capturedReasoning || capturedThoughtSignature;
              if (hasReasoning) {
                toolCalls = ReasoningPreserver.attachToToolCalls(
                  toolCalls,
                  {
                    reasoning_details: capturedReasoning,
                    thought_signature: capturedThoughtSignature
                  }
                );
                console.log('[OpenRouter:2] ✅ Attached reasoning to tool calls:', {
                  hasReasoningDetails: !!capturedReasoning,
                  hasThoughtSignature: !!capturedThoughtSignature,
                  toolCallsHaveThoughtSig: toolCalls.some((tc: any) => tc.thought_signature)
                });
              } else {
                console.log('[OpenRouter:2] ⚠️ No reasoning data to attach to tool calls');
              }
              return toolCalls;
            }
          }
          return null;
        },

        extractFinishReason: (parsed: any) => {
          // Extract finish reason from any choice
          for (const choice of parsed.choices || []) {
            if (choice?.finish_reason) {
              // DEBUG: Check final chunk for thought_signature
              console.log('[OpenRouter DEBUG] Final chunk with finish_reason:', {
                finish_reason: choice.finish_reason,
                parsed_keys: Object.keys(parsed),
                choice_keys: Object.keys(choice),
                delta_keys: choice?.delta ? Object.keys(choice.delta) : 'no delta',
                message_keys: choice?.message ? Object.keys(choice.message) : 'no message',
                parsed_thought_signature: parsed.thought_signature,
                choice_thought_signature: choice.thought_signature,
                delta_thought_signature: choice?.delta?.thought_signature,
                extra_content: parsed.extra_content || choice.extra_content || choice?.delta?.extra_content
              });

              // Last chance to capture thought_signature from final chunk
              if (needsReasoning && !capturedThoughtSignature) {
                const delta = choice?.delta;
                const message = choice?.message;
                capturedThoughtSignature =
                  delta?.extra_content?.google?.thought_signature ||
                  message?.extra_content?.google?.thought_signature ||
                  parsed.extra_content?.google?.thought_signature ||
                  delta?.thought_signature ||
                  message?.thought_signature ||
                  parsed.thought_signature ||
                  choice?.thought_signature;

                if (capturedThoughtSignature) {
                  console.log('[OpenRouter:1d] ✅ Captured thought_signature from FINAL chunk!');
                }
              }

              // When we detect completion, trigger async usage fetch (only once)
              if (generationId && options?.onUsageAvailable && !usageFetchTriggered) {
                usageFetchTriggered = true;
                // Fire and forget - don't await
                this.fetchAndNotifyUsage(generationId, baseModel, options.onUsageAvailable).catch(() => undefined);
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
      const usage = await this.fetchGenerationStats(generationId);

      if (!usage) {
        return;
      }

      // Calculate cost
      const cost = await this.calculateCost(usage, model);

      // Notify via callback
      onUsageAvailable(usage, cost || undefined);

    } catch (error) {
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
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const response = await fetch(`${this.baseUrl}/generation?id=${generationId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://www.synapticlabs.ai',
            'X-Title': BRAND_NAME
          }
        });

        if (response.status === 404) {
          // Stats not ready yet, retry
          continue;
        }

        if (!response.ok) {
          return null;
        }

        const data = await response.json();

        // Extract token counts from response
        // OpenRouter returns: tokens_prompt, tokens_completion, native_tokens_prompt, native_tokens_completion
        const promptTokens = data.data?.native_tokens_prompt || data.data?.tokens_prompt || 0;
        const completionTokens = data.data?.native_tokens_completion || data.data?.tokens_completion || 0;

        if (promptTokens > 0 || completionTokens > 0) {
          return {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens
          };
        }

        // Data returned but no tokens - might not be ready yet
      } catch (error) {
        if (attempt === maxRetries - 1) {
          return null;
        }
      }
    }

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
    const hasTools = options?.tools && options.tools.length > 0;

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
          tools: options?.tools ? this.convertTools(options.tools) : undefined,
          tool_choice: 'auto',
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
          top_p: options?.topP,
          frequency_penalty: options?.frequencyPenalty,
          presence_penalty: options?.presencePenalty,
          response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
          stop: options?.stopSequences,
          usage: { include: true },
          // Enable reasoning for Gemini models using centralized utility
          ...ReasoningPreserver.getReasoningRequestParams(model, 'openrouter', hasTools || false)
        }),
        
        makeApiCall: async (requestBody: any) => {
          return await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              ...this.buildHeaders(),
              'Authorization': `Bearer ${this.apiKey}`,
              'HTTP-Referer': 'https://www.synapticlabs.ai',
              'X-Title': BRAND_NAME
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

          // Extract tool calls and reasoning using centralized utility
          let toolCalls = choice?.message?.tool_calls || choice?.message?.toolCalls;
          const reasoning = ReasoningPreserver.extractFromResponse(choice);

          // Attach reasoning to tool calls for preservation through execution flow
          if (toolCalls && reasoning) {
            toolCalls = ReasoningPreserver.attachToToolCalls(toolCalls, reasoning);
          }

          // Build message with reasoning preserved at message level
          const messageWithDetails: any = {
            ...choice?.message,
            toolCalls
          };

          // CRITICAL: Preserve reasoning at message level for MCPToolExecution continuations
          if (reasoning?.reasoning_details) {
            messageWithDetails.reasoning_details = reasoning.reasoning_details;
          }

          return {
            content: choice?.message?.content || '',
            usage: this.extractUsage(data),
            finishReason: choice?.finish_reason || 'stop',
            toolCalls,
            choice: {
              ...choice,
              message: messageWithDetails
            }
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

      // Build assistant message with reasoning preserved using centralized utility
      const assistantMessage = ReasoningPreserver.buildAssistantMessageWithReasoning(
        detectedToolCalls,
        '' // Empty content since this was a tool call
      );

      messages.push(assistantMessage);

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
          'X-Title': BRAND_NAME
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
      console.error('OpenRouter adapter post-stream tool execution failed:', error);
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
      const models = ModelRegistry.getProviderModels('openrouter');
      const model = models.find(m => m.apiName === modelId);
      if (!model) {
        return null;
      }

      return {
        rateInputPerMillion: model.inputCostPerMillion,
        rateOutputPerMillion: model.outputCostPerMillion,
        currency: 'USD'
      };
    } catch (error) {
      return null;
    }
  }

  private convertTools(tools: any[]): any[] {
    return tools.map(tool => {
      if (tool.type === 'function') {
        // Handle both nested (Chat Completions) and flat (Responses API) formats
        const toolDef = tool.function || tool;
        return {
          type: 'function',
          function: {
            name: toolDef.name,
            description: toolDef.description,
            parameters: toolDef.parameters || toolDef.input_schema
          }
        };
      }
      return tool;
    });
  }
}
