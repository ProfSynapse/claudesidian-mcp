/**
 * Groq Adapter with true streaming support and Ultra-Fast Inference
 * Leverages Groq's high-performance LLM serving infrastructure
 * Uses OpenAI-compatible streaming API with extended usage metrics
 * Based on official Groq SDK streaming documentation
 */

import Groq from 'groq-sdk';
import { BaseAdapter } from '../BaseAdapter';
import { 
  GenerateOptions, 
  StreamChunk, 
  LLMResponse, 
  ModelInfo, 
  ProviderCapabilities,
  ModelPricing
} from '../types';
import { GROQ_MODELS, GROQ_DEFAULT_MODEL } from './GroqModels';

export class GroqAdapter extends BaseAdapter {
  readonly name = 'groq';
  readonly baseUrl = 'https://api.groq.com/openai/v1';
  
  private client: Groq;

  constructor(apiKey: string, model?: string) {
    super(apiKey, model || GROQ_DEFAULT_MODEL);
    
    this.client = new Groq({ 
      apiKey: this.apiKey,
      dangerouslyAllowBrowser: true 
    });
    this.initializeCache();
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      try {
        const response = await this.client.chat.completions.create({
          model: options?.model || this.currentModel,
          messages: this.buildMessages(prompt, options?.systemPrompt),
          temperature: options?.temperature,
          max_completion_tokens: options?.maxTokens,
          top_p: options?.topP,
          stop: options?.stopSequences,
          tools: options?.tools ? this.convertTools(options.tools) : undefined,
          response_format: options?.jsonMode ? { type: 'json_object' } : undefined
        });

        const usage = this.extractUsage(response);
        const finishReason = this.mapFinishReason(response.choices[0]?.finish_reason);
        const toolCalls = this.extractToolCalls(response.choices[0]?.message);

        return await this.buildLLMResponse(
          response.choices[0]?.message?.content || '',
          options?.model || this.currentModel,
          usage,
          { 
            provider: 'groq',
            // Groq provides extended performance metrics
            queueTime: (response as any).x_groq?.queue_time,
            promptTime: (response as any).x_groq?.prompt_time,
            completionTime: (response as any).x_groq?.completion_time
          },
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
      console.log('[GroqAdapter] Starting streaming response');
      
      const stream = await this.client.chat.completions.create({
        model: options?.model || this.currentModel,
        messages: this.buildMessages(prompt, options?.systemPrompt),
        temperature: options?.temperature,
        max_completion_tokens: options?.maxTokens,
        top_p: options?.topP,
        stop: options?.stopSequences,
        tools: options?.tools ? this.convertTools(options.tools) : undefined,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        stream: true
      });

      let usage: any = undefined;

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        
        if (content) {
          yield { content, complete: false };
        }
        
        // Extract usage information if available (typically in the last chunk)
        if ((chunk as any).usage || (chunk as any).x_groq) {
          usage = {
            usage: (chunk as any).usage,
            x_groq: (chunk as any).x_groq
          };
        }
      }

      // Final chunk with usage information
      yield { 
        content: '', 
        complete: true, 
        usage: this.extractUsage(usage) 
      };
      
      console.log('[GroqAdapter] Streaming completed');
    } catch (error) {
      console.error('[GroqAdapter] Streaming error:', error);
      throw error;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      return GROQ_MODELS.map(model => ({
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
      supportsImages: true,
      supportsFunctions: true,
      supportsThinking: false,
      maxContextWindow: 128000,
      supportedFeatures: [
        'messages',
        'function_calling',
        'vision',
        'streaming',
        'json_mode',
        'ultra_fast_inference',
        'extended_metrics'
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

  protected extractUsage(response: any): any {
    const usage = response?.usage;
    if (usage) {
      return {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        // Groq-specific extended metrics
        queueTime: response?.x_groq?.queue_time,
        promptTime: response?.x_groq?.prompt_time,
        completionTime: response?.x_groq?.completion_time
      };
    }
    return undefined;
  }

  private getCostPer1kTokens(modelId: string): { input: number; output: number } | undefined {
    const model = GROQ_MODELS.find(m => m.apiName === modelId);
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