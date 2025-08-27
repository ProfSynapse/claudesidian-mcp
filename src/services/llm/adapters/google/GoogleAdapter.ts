/**
 * Google Gemini Adapter with true streaming support
 * Implements Google Gemini streaming protocol using generateContentStream
 * Based on official Google Gemini JavaScript SDK documentation
 */

import { GoogleGenAI } from '@google/genai';
import { BaseAdapter } from '../BaseAdapter';
import { 
  GenerateOptions, 
  StreamChunk, 
  LLMResponse, 
  ModelInfo, 
  ProviderCapabilities,
  ModelPricing
} from '../types';
import { GOOGLE_MODELS, GOOGLE_DEFAULT_MODEL } from './GoogleModels';

export class GoogleAdapter extends BaseAdapter {
  readonly name = 'google';
  readonly baseUrl = 'https://generativelanguage.googleapis.com/v1';
  
  private client: GoogleGenAI;

  constructor(apiKey: string, model?: string) {
    super(apiKey, model || GOOGLE_DEFAULT_MODEL);
    
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    this.initializeCache();
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      try {
        const request: any = {
          model: options?.model || this.currentModel,
          contents: [{
            role: 'user',
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: options?.temperature,
            maxOutputTokens: options?.maxTokens,
            topK: 40,
            topP: 0.95
          }
        };

        // Add system instruction if provided
        if (options?.systemPrompt) {
          request.systemInstruction = {
            role: 'system',
            parts: [{ text: options.systemPrompt }]
          };
        }

        // Add tools if provided
        if (options?.tools && options.tools.length > 0) {
          request.tools = this.convertTools(options.tools);
        }

        const response = await this.client.models.generateContent(request);
        
        const extractedUsage = this.extractUsage(response);
        const finishReason = this.mapFinishReason(response.finishReason);
        const toolCalls = this.extractToolCalls(response);

        return await this.buildLLMResponse(
          response.text || '',
          options?.model || this.currentModel,
          extractedUsage,
          {},
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
      console.log('[GoogleAdapter] Starting streaming response');
      
      const request: any = {
        model: options?.model || this.currentModel,
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: options?.temperature,
          maxOutputTokens: options?.maxTokens,
          topK: 40,
          topP: 0.95
        }
      };

      // Add system instruction if provided
      if (options?.systemPrompt) {
        request.systemInstruction = {
          role: 'system',
          parts: [{ text: options.systemPrompt }]
        };
      }

      // Add tools if provided
      if (options?.tools && options.tools.length > 0) {
        request.tools = this.convertTools(options.tools);
      }

      const response = await this.client.models.generateContentStream(request);
      
      let usage: any = undefined;

      for await (const chunk of response) {
        console.log('[GoogleAdapter] Stream chunk received');
        
        if (chunk.text) {
          yield { 
            content: chunk.text, 
            complete: false 
          };
        }
        
        // Extract usage information if available
        if (chunk.usageMetadata) {
          usage = chunk.usageMetadata;
        }
      }
      
      // Final chunk with usage information
      yield { 
        content: '', 
        complete: true, 
        usage: this.extractUsage({ usageMetadata: usage }) 
      };
      
      console.log('[GoogleAdapter] Streaming completed');
    } catch (error) {
      console.error('[GoogleAdapter] Streaming error:', error);
      throw error;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      return GOOGLE_MODELS.map(model => ({
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
      maxContextWindow: 2097152,
      supportedFeatures: [
        'messages',
        'function_calling',
        'vision',
        'streaming',
        'json_mode',
        'thinking_mode'
      ]
    };
  }

  // Private methods
  private convertTools(tools: any[]): any[] {
    return tools.map(tool => {
      if (tool.type === 'function') {
        return {
          function_declarations: [{
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters
          }]
        };
      }
      return tool;
    });
  }

  private extractToolCalls(response: any): any[] {
    if (!response.functionCalls) return [];
    
    return response.functionCalls.map((call: any) => ({
      id: call.name + '_' + Date.now(),
      type: 'function',
      function: {
        name: call.name,
        arguments: JSON.stringify(call.args || {})
      }
    }));
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    if (!reason) return 'stop';
    
    const reasonMap: Record<string, 'stop' | 'length' | 'tool_calls' | 'content_filter'> = {
      'STOP': 'stop',
      'MAX_TOKENS': 'length',
      'SAFETY': 'content_filter',
      'RECITATION': 'content_filter',
      'OTHER': 'stop'
    };
    return reasonMap[reason] || 'stop';
  }

  protected extractUsage(response: any): any {
    const usage = response.usageMetadata || response.usage;
    if (usage) {
      return {
        promptTokens: usage.promptTokenCount || usage.inputTokens || 0,
        completionTokens: usage.candidatesTokenCount || usage.outputTokens || 0,
        totalTokens: usage.totalTokenCount || usage.totalTokens || 0
      };
    }
    return undefined;
  }

  private getCostPer1kTokens(modelId: string): { input: number; output: number } | undefined {
    const model = GOOGLE_MODELS.find(m => m.apiName === modelId);
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