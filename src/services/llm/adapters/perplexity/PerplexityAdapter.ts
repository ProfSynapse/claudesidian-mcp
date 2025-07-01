/**
 * Perplexity AI Adapter
 * Supports Perplexity's Sonar models with web search and reasoning capabilities
 * Based on 2025 Perplexity API specifications
 */

import axios, { AxiosInstance } from 'axios';
import { BaseAdapter } from '../BaseAdapter';
import { 
  GenerateOptions, 
  StreamOptions, 
  LLMResponse, 
  ModelInfo, 
  ProviderCapabilities,
  CostDetails,
  TokenUsage
} from '../types';
import { PERPLEXITY_MODELS, PERPLEXITY_DEFAULT_MODEL } from './PerplexityModels';

export interface PerplexityOptions extends GenerateOptions {
  // Perplexity-specific search parameters
  searchDomainFilter?: string[];
  searchRecencyFilter?: 'month' | 'week' | 'day' | 'hour';
  returnRelatedQuestions?: boolean;
  searchAfterDateFilter?: string;
  searchBeforeDateFilter?: string;
}

export interface PerplexityStreamOptions extends StreamOptions {
  searchDomainFilter?: string[];
  searchRecencyFilter?: 'month' | 'week' | 'day' | 'hour';
  returnRelatedQuestions?: boolean;
  searchAfterDateFilter?: string;
  searchBeforeDateFilter?: string;
}

export interface PerplexityCitation {
  url: string;
  title: string;
  text: string;
}

export interface PerplexityResponse extends LLMResponse {
  citations?: PerplexityCitation[];
  relatedQuestions?: string[];
}

export class PerplexityAdapter extends BaseAdapter {
  readonly name = 'perplexity';
  readonly baseUrl = 'https://api.perplexity.ai';
  
  private client: AxiosInstance;

  constructor(model?: string) {
    super('PERPLEXITY_API_KEY', model || PERPLEXITY_DEFAULT_MODEL);
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: this.buildHeaders({
        'Authorization': `Bearer ${this.apiKey}`
      }),
      timeout: 120000 // 2 minutes for search operations
    });

    this.initializeCache();
  }

  async generateUncached(prompt: string, options?: PerplexityOptions): Promise<PerplexityResponse> {
    try {
      const requestData = this.buildRequestData(prompt, options);
      
      const response = await this.withRetry(async () => {
        return await this.client.post('/chat/completions', requestData);
      });

      return this.parseResponse(response.data, options?.model || this.currentModel);
    } catch (error) {
      throw this.handleError(error, 'generation');
    }
  }

  async generateStream(prompt: string, options?: PerplexityStreamOptions): Promise<PerplexityResponse> {
    try {
      const requestData = this.buildRequestData(prompt, { ...options, stream: true });
      
      const response = await this.withRetry(async () => {
        return await this.client.post('/chat/completions', requestData, {
          responseType: 'stream'
        });
      });

      return await this.handleStreamResponse(response, options);
    } catch (error) {
      options?.onError?.(error as Error);
      throw this.handleError(error, 'streaming generation');
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return PERPLEXITY_MODELS.map(model => ({
      id: model.apiName,
      name: model.name,
      contextWindow: model.contextWindow,
      maxOutputTokens: model.maxTokens,
      supportsJSON: model.capabilities.supportsJSON,
      supportsImages: model.capabilities.supportsImages,
      supportsFunctions: model.capabilities.supportsFunctions,
      supportsStreaming: model.capabilities.supportsStreaming,
      supportsThinking: model.capabilities.supportsThinking,
      pricing: {
        inputPerMillion: model.inputCostPerMillion,
        outputPerMillion: model.outputCostPerMillion,
        currency: 'USD',
        lastUpdated: '2025-01-17'
      }
    }));
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: false,
      supportsThinking: true, // For reasoning models
      maxContextWindow: 200000, // Max for Sonar Pro models
      supportedFeatures: [
        'chat',
        'streaming',
        'json_mode',
        'web_search',
        'citations',
        'reasoning',
        'search_filtering',
        'related_questions'
      ]
    };
  }

  async getModelPricing(modelId: string): Promise<CostDetails | null> {
    const modelSpec = PERPLEXITY_MODELS.find(m => m.apiName === modelId);
    if (modelSpec) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
        rateInputPerMillion: modelSpec.inputCostPerMillion,
        rateOutputPerMillion: modelSpec.outputCostPerMillion
      };
    }
    return null;
  }

  // Private methods
  private buildRequestData(prompt: string, options?: PerplexityOptions): any {
    const model = options?.model || this.currentModel;
    const messages = this.buildMessages(prompt, options?.systemPrompt);

    const requestData: any = {
      model,
      messages,
      stream: options?.stream || false
    };

    // Standard parameters
    if (options?.temperature !== undefined) requestData.temperature = options.temperature;
    if (options?.maxTokens !== undefined) requestData.max_tokens = options.maxTokens;
    if (options?.topP !== undefined) requestData.top_p = options.topP;
    if (options?.stopSequences) requestData.stop = options.stopSequences;

    // JSON mode
    if (options?.jsonMode) {
      requestData.response_format = { type: 'json_object' };
    }

    // Perplexity-specific search parameters
    if (options?.searchDomainFilter) {
      requestData.search_domain_filter = options.searchDomainFilter;
    }
    if (options?.searchRecencyFilter) {
      requestData.search_recency_filter = options.searchRecencyFilter;
    }
    if (options?.returnRelatedQuestions !== undefined) {
      requestData.return_related_questions = options.returnRelatedQuestions;
    }
    if (options?.searchAfterDateFilter) {
      requestData.search_after_date_filter = options.searchAfterDateFilter;
    }
    if (options?.searchBeforeDateFilter) {
      requestData.search_before_date_filter = options.searchBeforeDateFilter;
    }

    return requestData;
  }

  private parseResponse(responseData: any, model: string): PerplexityResponse {
    const choice = responseData.choices?.[0];
    if (!choice) {
      throw new Error('No response choice received from Perplexity');
    }

    const content = choice.message?.content || '';
    const citations = choice.message?.citations || [];
    const relatedQuestions = responseData.related_questions || [];
    
    const usage = this.extractUsage(responseData);
    const finishReason = this.mapFinishReason(choice.finish_reason);

    const response: PerplexityResponse = {
      text: content,
      model: responseData.model || model,
      provider: this.name,
      usage: usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      citations,
      relatedQuestions,
      finishReason,
      metadata: {
        id: responseData.id,
        created: responseData.created,
        citationCount: citations.length,
        relatedQuestionCount: relatedQuestions.length
      }
    };

    return response;
  }

  private async handleStreamResponse(
    response: any, 
    options?: PerplexityStreamOptions
  ): Promise<PerplexityResponse> {
    let fullText = '';
    let citations: PerplexityCitation[] = [];
    let relatedQuestions: string[] = [];
    let usage: TokenUsage | undefined;
    let finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 'stop';
    let responseId = '';
    let created = 0;

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              const finalResponse: PerplexityResponse = {
                text: fullText,
                model: options?.model || this.currentModel,
                provider: this.name,
                usage: usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                citations,
                relatedQuestions,
                finishReason,
                metadata: {
                  id: responseId,
                  created,
                  citationCount: citations.length,
                  relatedQuestionCount: relatedQuestions.length,
                  streamed: true
                }
              };
              
              options?.onComplete?.(finalResponse);
              resolve(finalResponse);
              return;
            }

            try {
              const parsed = JSON.parse(data);
              
              // Extract response metadata
              if (parsed.id) responseId = parsed.id;
              if (parsed.created) created = parsed.created;
              if (parsed.usage) usage = this.extractUsage(parsed);
              if (parsed.related_questions) relatedQuestions = parsed.related_questions;

              const choice = parsed.choices?.[0];
              if (choice) {
                const delta = choice.delta?.content || '';
                if (delta) {
                  fullText += delta;
                  options?.onToken?.(delta);
                }

                if (choice.message?.citations) {
                  citations = choice.message.citations;
                }

                if (choice.finish_reason) {
                  finishReason = this.mapFinishReason(choice.finish_reason);
                }
              }
            } catch (parseError) {
              // Ignore parse errors for partial chunks
            }
          }
        }
      });

      response.data.on('error', (error: Error) => {
        options?.onError?.(error);
        reject(error);
      });

      response.data.on('end', () => {
        // Fallback if [DONE] wasn't received
        const finalResponse: PerplexityResponse = {
          text: fullText,
          model: options?.model || this.currentModel,
          provider: this.name,
          usage: usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          citations,
          relatedQuestions,
          finishReason,
          metadata: {
            id: responseId,
            created,
            citationCount: citations.length,
            relatedQuestionCount: relatedQuestions.length,
            streamed: true
          }
        };
        
        options?.onComplete?.(finalResponse);
        resolve(finalResponse);
      });
    });
  }

  private mapFinishReason(reason: string): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  protected extractUsage(response: any): TokenUsage | undefined {
    if (response.usage) {
      return {
        promptTokens: response.usage.prompt_tokens || 0,
        completionTokens: response.usage.completion_tokens || 0,
        totalTokens: response.usage.total_tokens || 0
      };
    }
    return undefined;
  }

  // Utility methods for search features
  async searchWithDomainFilter(
    prompt: string, 
    domains: string[], 
    options?: PerplexityOptions
  ): Promise<PerplexityResponse> {
    return this.generateUncached(prompt, {
      ...options,
      searchDomainFilter: domains
    });
  }

  async searchRecent(
    prompt: string, 
    recency: 'month' | 'week' | 'day' | 'hour',
    options?: PerplexityOptions
  ): Promise<PerplexityResponse> {
    return this.generateUncached(prompt, {
      ...options,
      searchRecencyFilter: recency
    });
  }

  async searchWithRelatedQuestions(
    prompt: string,
    options?: PerplexityOptions
  ): Promise<PerplexityResponse> {
    return this.generateUncached(prompt, {
      ...options,
      returnRelatedQuestions: true
    });
  }
}