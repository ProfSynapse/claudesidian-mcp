/**
 * Perplexity AI Adapter with true streaming support
 * Supports Perplexity's Sonar models with web search and reasoning capabilities
 * Based on official Perplexity streaming documentation with SSE parsing
 */

import { BaseAdapter } from '../BaseAdapter';
import { 
  GenerateOptions, 
  StreamChunk, 
  LLMResponse, 
  ModelInfo, 
  ProviderCapabilities,
  ModelPricing,
  TokenUsage
} from '../types';
import { PERPLEXITY_MODELS, PERPLEXITY_DEFAULT_MODEL } from './PerplexityModels';
import { MCPToolExecution, MCPCapableAdapter } from '../shared/MCPToolExecution';

export interface PerplexityOptions extends GenerateOptions {
  webSearch?: boolean;
  searchMode?: 'web' | 'academic';
  reasoningEffort?: 'low' | 'medium' | 'high';
  searchContextSize?: 'low' | 'medium' | 'high';
}

export class PerplexityAdapter extends BaseAdapter implements MCPCapableAdapter {
  readonly name = 'perplexity';
  readonly baseUrl = 'https://api.perplexity.ai';
  
  mcpConnector?: any;

  constructor(apiKey: string, mcpConnector?: any, model?: string) {
    super(apiKey, model || PERPLEXITY_DEFAULT_MODEL);
    this.mcpConnector = mcpConnector;
    this.initializeCache();
  }

  async generateUncached(prompt: string, options?: PerplexityOptions): Promise<LLMResponse> {
    try {
      const model = options?.model || this.currentModel;
      
      // Perplexity does not support native function calling
      // If tools are requested, inform user and proceed without tools
      if (options?.tools && options.tools.length > 0) {
        console.warn('[Perplexity Adapter] Tools requested but Perplexity API does not support function calling. Proceeding without tools.');
      }
      
      // Use standard chat completions (Perplexity's strength is web search, not tool calling)
      console.log('[Perplexity Adapter] Using chat completions with web search capabilities');
      return await this.generateWithChatCompletions(prompt, options);
    } catch (error) {
      throw this.handleError(error, 'generation');
    }
  }

  async* generateStreamAsync(prompt: string, options?: PerplexityOptions): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      console.log('[PerplexityAdapter] Starting streaming response');
      
      const requestBody = {
        model: options?.model || this.currentModel,
        messages: this.buildMessages(prompt, options?.systemPrompt),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        presence_penalty: options?.presencePenalty,
        frequency_penalty: options?.frequencyPenalty,
        tools: options?.tools,
        stream: true,
        extra: {
          search_mode: options?.searchMode || 'web',
          reasoning_effort: options?.reasoningEffort || 'medium',
          web_search_options: {
            search_context_size: options?.searchContextSize || 'low'
          }
        }
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let usage: any = undefined;
      let searchResults: any[] = [];
      let metadata: any = {};

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Process complete lines from buffer
          while (true) {
            const lineEnd = buffer.indexOf('\n');
            if (lineEnd === -1) break;
            
            const line = buffer.slice(0, lineEnd).trim();
            buffer = buffer.slice(lineEnd + 1);
            
            // Skip empty lines
            if (!line) continue;
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') break;
              
              try {
                const chunk = JSON.parse(data);
                
                // Process content chunks
                const content = chunk.choices?.[0]?.delta?.content;
                if (content) {
                  yield { content, complete: false };
                }
                
                // Collect metadata (arrives in final chunks)
                if (chunk.search_results) {
                  searchResults = chunk.search_results;
                }
                
                if (chunk.usage) {
                  usage = chunk.usage;
                }
                
                // Collect other metadata
                for (const key of ['reasoning_effort', 'search_mode']) {
                  if (chunk[key]) {
                    metadata[key] = chunk[key];
                  }
                }
                
              } catch (error) {
                console.warn('[PerplexityAdapter] Failed to parse streaming chunk:', error);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Final chunk with usage information (search results stored in metadata)
      yield { 
        content: '', 
        complete: true, 
        usage: this.extractUsage({ usage })
      };
      
      console.log('[PerplexityAdapter] Streaming completed');
    } catch (error) {
      console.error('[PerplexityAdapter] Streaming error:', error);
      throw error;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      return PERPLEXITY_MODELS.map(model => ({
        id: model.apiName,
        name: model.name,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxTokens,
        supportsJSON: model.capabilities.supportsJSON,
        supportsImages: model.capabilities.supportsImages,
        supportsFunctions: model.capabilities.supportsFunctions,
        supportsStreaming: model.capabilities.supportsStreaming,
        supportsThinking: false,
        costPer1kTokens: {
          input: model.inputCostPerMillion / 1000,
          output: model.outputCostPerMillion / 1000
        },
        pricing: {
          inputPerMillion: model.inputCostPerMillion,
          outputPerMillion: model.outputCostPerMillion,
          currency: 'USD',
          lastUpdated: new Date().toISOString()
        }
      }));
    } catch (error) {
      this.handleError(error, 'listing models');
      return [];
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: false, // Perplexity does not support function calling
      supportsThinking: false,
      maxContextWindow: 127072,
      supportedFeatures: [
        'messages',
        'streaming',
        'web_search', // This is Perplexity's main strength
        'reasoning',
        'sonar_models',
        'academic_search',
        'real_time_information',
        'citations'
      ]
    };
  }

  /**
   * Check if MCP is available via connector
   */
  supportsMCP(): boolean {
    return MCPToolExecution.supportsMCP(this);
  }

  /**
   * Generate with pre-converted tools (from ChatService) using centralized execution
   */
  private async generateWithProvidedTools(prompt: string, options?: PerplexityOptions): Promise<LLMResponse> {
    // Use centralized tool execution wrapper to eliminate code duplication
    const model = options?.model || this.currentModel;

    return MCPToolExecution.executeWithToolSupport(
      this,
      'perplexity',
      {
        model,
        tools: options?.tools || [],
        prompt,
        systemPrompt: options?.systemPrompt
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
          presence_penalty: options?.presencePenalty,
          frequency_penalty: options?.frequencyPenalty,
          extra: {
            search_mode: options?.searchMode || 'web',
            reasoning_effort: options?.reasoningEffort || 'medium',
            web_search_options: {
              search_context_size: options?.searchContextSize || 'low'
            }
          }
        }),
        
        makeApiCall: async (requestBody: any) => {
          return await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
          });
        },
        
        extractResponse: async (response: Response) => {
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }
          const data = await response.json();
          const choice = data.choices[0];
          
          return {
            content: choice?.message?.content || '',
            usage: this.extractUsage(data),
            finishReason: choice?.finish_reason || 'stop',
            toolCalls: choice?.message?.tool_calls,
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
   * Generate using standard chat completions
   */
  private async generateWithChatCompletions(prompt: string, options?: PerplexityOptions): Promise<LLMResponse> {
    const model = options?.model || this.currentModel;
    
    const requestBody: any = {
      model,
      messages: this.buildMessages(prompt, options?.systemPrompt),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      presence_penalty: options?.presencePenalty,
      frequency_penalty: options?.frequencyPenalty,
      extra: {
        search_mode: options?.searchMode || 'web',
        reasoning_effort: options?.reasoningEffort || 'medium',
        web_search_options: {
          search_context_size: options?.searchContextSize || 'low'
        }
      }
    };

    // Add tools if provided
    if (options?.tools) {
      requestBody.tools = options.tools;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any;
    const choice = data.choices[0];
    
    if (!choice) {
      throw new Error('No response from Perplexity');
    }
    
    let text = choice.message?.content || '';
    const usage = this.extractUsage(data);
    let finishReason = choice.finish_reason || 'stop';

    // If tools were provided and we got tool calls, we need to handle them
    // For now, just return the response as-is since tool execution is complex
    if (options?.tools && choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
      console.log(`[Perplexity Adapter] Received ${choice.message.tool_calls.length} tool calls, but tool execution not implemented in basic mode`);
      text = text || '[AI requested tool calls but tool execution not available]';
    }

    return this.buildLLMResponse(
      text,
      model,
      usage,
      { 
        provider: 'perplexity',
        searchResults: data.search_results,
        searchMode: options?.searchMode
      },
      finishReason as any
    );
  }

  // Private methods
  private extractToolCalls(message: any): any[] {
    return message?.tool_calls || [];
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    if (!reason) return 'stop';
    
    const reasonMap: Record<string, 'stop' | 'length' | 'tool_calls' | 'content_filter'> = {
      'stop': 'stop',
      'length': 'length',
      'tool_calls': 'tool_calls',
      'content_filter': 'content_filter'
    };
    return reasonMap[reason] || 'stop';
  }

  protected extractUsage(response: any): TokenUsage | undefined {
    const usage = response?.usage;
    if (usage) {
      return {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0
      };
    }
    return undefined;
  }

  private getCostPer1kTokens(modelId: string): { input: number; output: number } | undefined {
    const model = PERPLEXITY_MODELS.find(m => m.apiName === modelId);
    if (!model) return undefined;
    
    return {
      input: model.inputCostPerMillion / 1000,
      output: model.outputCostPerMillion / 1000
    };
  }

  async getModelPricing(modelId: string): Promise<ModelPricing | null> {
    const costs = this.getCostPer1kTokens(modelId);
    if (!costs) return null;
    
    return {
      rateInputPerMillion: costs.input * 1000,
      rateOutputPerMillion: costs.output * 1000,
      currency: 'USD'
    };
  }
}