/**
 * Mistral AI Adapter with true streaming support
 * Implements Mistral's native streaming using client.chat.stream()
 * Based on official Mistral TypeScript SDK documentation
 */

import { Mistral } from '@mistralai/mistralai';
import { BaseAdapter } from '../BaseAdapter';
import { 
  GenerateOptions, 
  StreamChunk, 
  LLMResponse, 
  ModelInfo, 
  ProviderCapabilities,
  ModelPricing
} from '../types';
import { MISTRAL_MODELS, MISTRAL_DEFAULT_MODEL } from './MistralModels';

export class MistralAdapter extends BaseAdapter {
  readonly name = 'mistral';
  readonly baseUrl = 'https://api.mistral.ai';
  
  private client: Mistral;

  constructor(apiKey: string, model?: string) {
    super(apiKey, model || MISTRAL_DEFAULT_MODEL);
    
    this.client = new Mistral({ apiKey: this.apiKey });
    this.initializeCache();
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      try {
        const response = await this.client.chat.complete({
          model: options?.model || this.currentModel,
          messages: this.buildMessages(prompt, options?.systemPrompt),
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          topP: options?.topP,
          stop: options?.stopSequences,
          tools: options?.tools ? this.convertTools(options.tools) : undefined
        });

        const usage = this.extractUsage(response);
        const finishReason = this.mapFinishReason(response.choices[0]?.finishReason);
        const toolCalls = this.extractToolCalls(response.choices[0]?.message);

        return await this.buildLLMResponse(
          this.extractMessageContent(response.choices[0]?.message?.content) || '',
          options?.model || this.currentModel,
          usage,
          { provider: 'mistral' },
          finishReason,
          toolCalls
        );
      } catch (error) {
        this.handleError(error, 'generation');
      }
    });
  }

  async* generateStreamAsync(prompt: string, options?: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      console.log('[MistralAdapter] Starting streaming response');
      
      const result = await this.client.chat.stream({
        model: options?.model || this.currentModel,
        messages: this.buildMessages(prompt, options?.systemPrompt),
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        topP: options?.topP,
        stop: options?.stopSequences,
        tools: options?.tools ? this.convertTools(options.tools) : undefined
      });

      let usage: any = undefined;

      for await (const chunk of result) {
        const streamText = chunk.data.choices[0]?.delta?.content;
        
        if (typeof streamText === "string" && streamText) {
          yield { content: streamText, complete: false };
        }

        // Extract usage information if available
        if (chunk.data.usage) {
          usage = chunk.data.usage;
        }
      }

      // Final chunk with usage information
      yield { 
        content: '', 
        complete: true, 
        usage: this.extractUsage({ usage }) 
      };
      
      console.log('[MistralAdapter] Streaming completed');
    } catch (error) {
      console.error('[MistralAdapter] Streaming error:', error);
      throw error;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      return MISTRAL_MODELS.map(model => ({
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
      maxContextWindow: 128000,
      supportedFeatures: [
        'messages',
        'function_calling',
        'streaming',
        'json_mode'
      ]
    };
  }

  // Private methods
  private convertTools(tools: any[]): any[] {
    return tools.map(tool => {
      if (tool.type === 'function' && tool.function) {
        return {
          type: 'function',
          function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters
          }
        };
      }
      return tool;
    });
  }

  private extractToolCalls(message: any): any[] {
    return message?.tool_calls || [];
  }

  private extractMessageContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .filter(chunk => chunk.type === 'text')
        .map(chunk => chunk.text || '')
        .join('');
    }
    return '';
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    if (!reason) return 'stop';
    
    const reasonMap: Record<string, 'stop' | 'length' | 'tool_calls' | 'content_filter'> = {
      'stop': 'stop',
      'length': 'length',
      'tool_calls': 'tool_calls',
      'model_length': 'length',
      'content_filter': 'content_filter'
    };
    return reasonMap[reason] || 'stop';
  }

  protected extractUsage(response: any): any {
    const usage = response.usage;
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
    const model = MISTRAL_MODELS.find(m => m.apiName === modelId);
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