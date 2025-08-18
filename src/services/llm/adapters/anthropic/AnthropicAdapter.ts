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
  ModelPricing
} from '../types';
import { ANTHROPIC_MODELS, ANTHROPIC_DEFAULT_MODEL } from './AnthropicModels';

export class AnthropicAdapter extends BaseAdapter {
  readonly name = 'anthropic';
  readonly baseUrl = 'https://api.anthropic.com';
  
  private client: Anthropic;

  constructor(apiKey: string, model?: string) {
    super(apiKey, model || ANTHROPIC_DEFAULT_MODEL);
    
    this.client = new Anthropic({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      dangerouslyAllowBrowser: true
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
        
        const extractedUsage = this.extractUsage(response);
        const finishReason = this.mapStopReason(response.stop_reason);
        const toolCalls = this.extractToolCalls(response.content);
        const metadata = {
          thinking: this.extractThinking(response),
          stopSequence: response.stop_sequence
        };

        return await this.buildLLMResponse(
          this.extractTextFromContent(response.content),
          response.model,
          extractedUsage,
          metadata,
          finishReason,
          toolCalls
        );
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
      return ANTHROPIC_MODELS.map(model => ({
        id: model.apiName,
        name: model.name,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxTokens,
        supportsJSON: model.capabilities.supportsJSON,
        supportsImages: model.capabilities.supportsImages,
        supportsFunctions: model.capabilities.supportsFunctions,
        supportsStreaming: model.capabilities.supportsStreaming,
        supportsThinking: model.capabilities.supportsThinking,
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
    const model = ANTHROPIC_MODELS.find(m => m.apiName === modelId);
    return model?.capabilities.supportsThinking || false;
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
    const model = ANTHROPIC_MODELS.find(m => m.apiName === modelId);
    if (!model) return undefined;
    
    return {
      input: model.inputCostPerMillion / 1000,
      output: model.outputCostPerMillion / 1000
    };
  }

  async getModelPricing(modelId: string): Promise<ModelPricing | null> {
    console.log('AnthropicAdapter: getModelPricing called for model:', modelId);
    
    const costs = this.getCostPer1kTokens(modelId);
    console.log('AnthropicAdapter: getCostPer1kTokens result:', costs);
    
    if (!costs) {
      console.log('AnthropicAdapter: No costs found for model:', modelId);
      return null;
    }
    
    const pricing: ModelPricing = {
      rateInputPerMillion: costs.input * 1000, // Convert per 1k to per million
      rateOutputPerMillion: costs.output * 1000,
      currency: 'USD'
    };
    
    console.log('AnthropicAdapter: returning pricing:', pricing);
    return pricing;
  }
}