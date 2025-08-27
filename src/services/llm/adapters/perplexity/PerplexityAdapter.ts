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

export interface PerplexityOptions extends GenerateOptions {
  webSearch?: boolean;
  searchMode?: 'web' | 'academic';
  reasoningEffort?: 'low' | 'medium' | 'high';
  searchContextSize?: 'low' | 'medium' | 'high';
}

export class PerplexityAdapter extends BaseAdapter {
  readonly name = 'perplexity';
  readonly baseUrl = 'https://api.perplexity.ai';

  constructor(apiKey: string, model?: string) {
    super(apiKey, model || PERPLEXITY_DEFAULT_MODEL);
    this.initializeCache();
  }

  async generateUncached(prompt: string, options?: PerplexityOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      try {
        const requestBody = {
          model: options?.model || this.currentModel,
          messages: this.buildMessages(prompt, options?.systemPrompt),
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
          top_p: options?.topP,
          presence_penalty: options?.presencePenalty,
          frequency_penalty: options?.frequencyPenalty,
          tools: options?.tools,
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

        const data = await response.json() as any;
        
        const usage = this.extractUsage(data);
        const finishReason = this.mapFinishReason(data.choices[0]?.finish_reason);
        const toolCalls = this.extractToolCalls(data.choices[0]?.message);

        return await this.buildLLMResponse(
          data.choices[0]?.message?.content || '',
          options?.model || this.currentModel,
          usage,
          { 
            provider: 'perplexity',
            searchResults: data.search_results,
            searchMode: options?.searchMode
          },
          finishReason,
          toolCalls
        );
      } catch (error) {
        this.handleError(error, 'generation');
      }
    });
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

      // Final chunk with usage information and search results
      yield { 
        content: '', 
        complete: true, 
        usage: this.extractUsage({ usage }),
        metadata: {
          searchResults,
          ...metadata
        }
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
      supportsFunctions: true,
      supportsThinking: false,
      maxContextWindow: 127072,
      supportedFeatures: [
        'messages',
        'function_calling',
        'streaming',
        'web_search',
        'reasoning',
        'sonar_models',
        'academic_search'
      ]
    };
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