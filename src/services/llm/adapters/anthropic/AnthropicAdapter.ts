/**
 * Anthropic Claude Adapter with Claude 4 and extended thinking
 * Supports latest Claude features including extended thinking mode
 * Based on 2025 API documentation
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseAdapter } from '../BaseAdapter';
import { 
  GenerateOptions, 
  StreamOptions, 
  LLMResponse, 
  ModelInfo, 
  ProviderCapabilities,
  CostDetails
} from '../types';

export class AnthropicAdapter extends BaseAdapter {
  readonly name = 'anthropic';
  readonly baseUrl = 'https://api.anthropic.com';
  
  private client: Anthropic;

  constructor(model?: string) {
    super('ANTHROPIC_API_KEY', model || 'claude-3-5-sonnet-20241022');
    
    this.client = new Anthropic({
      apiKey: this.apiKey,
      baseURL: this.baseUrl
    });
    
    this.initializeCache();
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      try {
        const messages = this.buildMessages(prompt, options?.systemPrompt);
        
        const requestParams: any = {
          model: options?.model || this.currentModel,
          max_tokens: options?.maxTokens || 4096,
          messages: messages.filter(msg => msg.role !== 'system'),
          temperature: options?.temperature,
          stop_sequences: options?.stopSequences
        };

        // Add system message if provided
        const systemMessage = messages.find(msg => msg.role === 'system');
        if (systemMessage) {
          requestParams.system = systemMessage.content;
        }

        // Extended thinking mode for Claude 4 models
        if (options?.enableThinking && this.supportsThinking(options?.model || this.currentModel)) {
          requestParams.thinking = 'extended';
        }

        // Interleaved thinking (beta feature)
        if (options?.enableInteractiveThinking) {
          requestParams.beta = process.env.ANTHROPIC_BETA_FEATURES || 'interleaved-thinking-2025-05-14';
        }

        // Add tools if provided
        if (options?.tools && options.tools.length > 0) {
          requestParams.tools = this.convertTools(options.tools);
        }

        // Special tools
        if (options?.webSearch) {
          requestParams.tools = requestParams.tools || [];
          requestParams.tools.push({
            type: 'web_search',
            web_search: { max_results: 10 }
          });
        }

        const response = await this.client.messages.create(requestParams);
        
        return {
          text: this.extractTextFromContent(response.content),
          model: response.model,
          provider: this.name,
          usage: this.extractUsage(response),
          finishReason: this.mapStopReason(response.stop_reason),
          toolCalls: this.extractToolCalls(response.content),
          metadata: {
            thinking: this.extractThinking(response),
            stopSequence: response.stop_sequence
          }
        };
      } catch (error) {
        this.handleError(error, 'generation');
      }
    });
  }

  async generateStream(prompt: string, options?: StreamOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      try {
        const messages = this.buildMessages(prompt, options?.systemPrompt);
        
        const requestParams: any = {
          model: options?.model || this.currentModel,
          max_tokens: options?.maxTokens || 4096,
          messages: messages.filter(msg => msg.role !== 'system'),
          temperature: options?.temperature,
          stream: true
        };

        // Add system message if provided
        const systemMessage = messages.find(msg => msg.role === 'system');
        if (systemMessage) {
          requestParams.system = systemMessage.content;
        }

        const stream = await this.client.messages.create(requestParams as any);
        
        let fullText = '';
        let usage: any = undefined;
        let model = '';
        let stopReason = '';

        for await (const chunk of stream as any) {
          if (chunk.type === 'content_block_delta') {
            const deltaText = chunk.delta.text || '';
            if (deltaText) {
              fullText += deltaText;
              options?.onToken?.(deltaText);
            }
          } else if (chunk.type === 'message_start') {
            model = chunk.message.model;
            usage = chunk.message.usage;
          } else if (chunk.type === 'message_delta') {
            stopReason = chunk.delta.stop_reason || '';
            if (chunk.usage) {
              usage = chunk.usage;
            }
          }
        }

        const response: LLMResponse = {
          text: fullText,
          model: model || this.currentModel,
          provider: this.name,
          usage: this.extractUsage({ usage }),
          finishReason: this.mapStopReason(stopReason)
        };

        options?.onComplete?.(response);
        return response;
      } catch (error) {
        options?.onError?.(error as Error);
        this.handleError(error, 'streaming generation');
      }
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      // Claude models available as of 2025
      const models = [
        {
          id: 'claude-4-opus-20250124',
          name: 'Claude 4 Opus',
          contextWindow: 200000,
          maxOutputTokens: 4096,
          supportsThinking: true,
          tier: 'premium'
        },
        {
          id: 'claude-4-sonnet-20250124',
          name: 'Claude 4 Sonnet',
          contextWindow: 200000,
          maxOutputTokens: 4096,
          supportsThinking: true,
          tier: 'standard'
        },
        {
          id: 'claude-3.5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          contextWindow: 200000,
          maxOutputTokens: 4096,
          supportsThinking: false,
          tier: 'standard'
        },
        {
          id: 'claude-3.5-haiku-20241022',
          name: 'Claude 3.5 Haiku',
          contextWindow: 200000,
          maxOutputTokens: 4096,
          supportsThinking: false,
          tier: 'fast'
        }
      ];

      return models.map(model => ({
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        supportsJSON: true,
        supportsImages: true,
        supportsFunctions: true,
        supportsStreaming: true,
        supportsThinking: model.supportsThinking,
        costPer1kTokens: this.getCostPer1kTokens(model.id),
        pricing: this.getCostPer1kTokens(model.id) ? {
          inputPerMillion: this.getCostPer1kTokens(model.id)!.input * 1000,
          outputPerMillion: this.getCostPer1kTokens(model.id)!.output * 1000,
          currency: 'USD',
          lastUpdated: new Date().toISOString()
        } : {
          inputPerMillion: 0,
          outputPerMillion: 0,
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
      supportsImages: true,
      supportsFunctions: true,
      supportsThinking: true,
      maxContextWindow: 200000,
      supportedFeatures: [
        'messages',
        'extended_thinking',
        'interleaved_thinking',
        'function_calling',
        'web_search',
        'computer_use',
        'code_execution',
        'mcp_connector',
        'vision',
        'streaming'
      ]
    };
  }

  // Private methods
  private supportsThinking(modelId: string): boolean {
    return [
      'claude-4-opus-20250124',
      'claude-4-sonnet-20250124'
    ].includes(modelId);
  }

  private convertTools(tools: any[]): any[] {
    return tools.map(tool => {
      if (tool.type === 'function') {
        return {
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters
        };
      }
      return tool;
    });
  }

  private extractTextFromContent(content: any[]): string {
    return content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');
  }

  private extractToolCalls(content: any[]): any[] {
    return content
      .filter(block => block.type === 'tool_use')
      .map(block => ({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input)
        }
      }));
  }

  private extractThinking(response: any): string | undefined {
    // Extract thinking process from response if available
    if (response.thinking) {
      return typeof response.thinking === 'string' ? response.thinking : JSON.stringify(response.thinking);
    }
    return undefined;
  }

  private mapStopReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    if (!reason) return 'stop'; // Handle null case
    
    const reasonMap: Record<string, 'stop' | 'length' | 'tool_calls' | 'content_filter'> = {
      'end_turn': 'stop',
      'max_tokens': 'length',
      'tool_use': 'tool_calls',
      'stop_sequence': 'stop'
    };
    return reasonMap[reason] || 'stop';
  }

  protected extractUsage(response: any): any {
    if (response.usage) {
      return {
        promptTokens: response.usage.input_tokens || 0,
        completionTokens: response.usage.output_tokens || 0,
        totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)
      };
    }
    return undefined;
  }

  private getCostPer1kTokens(modelId: string): { input: number; output: number } | undefined {
    const costs: Record<string, { input: number; output: number }> = {
      'claude-4-opus-20250124': { input: 0.015, output: 0.075 }, // Estimated
      'claude-4-sonnet-20250124': { input: 0.003, output: 0.015 }, // Estimated
      'claude-3.5-sonnet-20241022': { input: 0.003, output: 0.015 },
      'claude-3.5-haiku-20241022': { input: 0.00025, output: 0.00125 }
    };
    return costs[modelId];
  }

  async getModelPricing(modelId: string): Promise<CostDetails | null> {
    const costs = this.getCostPer1kTokens(modelId);
    if (!costs) return null;
    
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: 'USD',
      rateInputPerMillion: costs.input * 1000, // Convert per 1k to per million
      rateOutputPerMillion: costs.output * 1000
    };
  }
}