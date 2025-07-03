/**
 * Google Gemini Adapter with 2.5 models and thinking capabilities
 * Supports latest Gemini features including thinking mode
 * Based on 2025 API documentation from Google AI Studio
 * Updated June 17, 2025 with latest model availability and pricing
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseAdapter } from '../BaseAdapter';
import { 
  GenerateOptions, 
  StreamOptions, 
  LLMResponse, 
  ModelInfo, 
  ProviderCapabilities,
  ModelPricing
} from '../types';
import { ModelRegistry } from '../ModelRegistry';

export class GoogleAdapter extends BaseAdapter {
  readonly name = 'google';
  readonly baseUrl = 'https://generativelanguage.googleapis.com/v1';
  
  private client: GoogleGenerativeAI;

  constructor(apiKey: string, model?: string) {
    super(apiKey, model || 'gemini-2.5-flash');
    
    this.client = new GoogleGenerativeAI(this.apiKey);
    this.initializeCache();
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      try {
        const model = this.client.getGenerativeModel({ 
          model: options?.model || this.currentModel 
        });

        const generationConfig: any = {
          temperature: options?.temperature,
          maxOutputTokens: options?.maxTokens,
          topK: 40,
          topP: 0.95
        };

        // Build request
        const request: any = {
          contents: [{
            role: 'user',
            parts: [{ text: prompt }]
          }],
          generationConfig
        };

        // Add system instruction if provided
        if (options?.systemPrompt) {
          request.systemInstruction = {
            parts: [{ text: options.systemPrompt }]
          };
        }

        // Enable thinking mode for 2.5 models
        if (options?.enableThinking && this.supportsThinking(options?.model || this.currentModel)) {
          request.thinking = true;
        }

        // Add tools if provided
        if (options?.tools && options.tools.length > 0) {
          request.tools = this.convertTools(options.tools);
        }

        const response = await model.generateContent(request);
        
        const extractedUsage = this.extractGeminiUsage(response);
        const finishReason = this.mapFinishReason(response.response.candidates?.[0]?.finishReason);
        const metadata = {
          thinking: options?.enableThinking ? response.response.candidates?.[0]?.content?.parts?.find((p: any) => p.thought !== undefined) : undefined
        };

        return await this.buildLLMResponse(
          response.response.text() || '',
          options?.model || this.currentModel,
          extractedUsage,
          metadata,
          finishReason
        );
      } catch (error) {
        this.handleError(error, 'generation');
      }
    });
  }

  async generateStream(prompt: string, options?: StreamOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      try {
        const model = this.client.getGenerativeModel({ 
          model: options?.model || this.currentModel 
        });

        const request: any = {
          contents: [{
            role: 'user',
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: options?.temperature,
            maxOutputTokens: options?.maxTokens
          }
        };

        if (options?.systemPrompt) {
          request.systemInstruction = {
            parts: [{ text: options.systemPrompt }]
          };
        }

        const streamingResponse = await model.generateContentStream(request);
        
        let fullText = '';
        let usage: any = undefined;

        for await (const chunk of streamingResponse.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            fullText += chunkText;
            options?.onToken?.(chunkText);
          }
        }

        const finalResponse = await streamingResponse.response;
        usage = this.extractGeminiUsage({ response: finalResponse });

        const response: LLMResponse = {
          text: fullText,
          model: options?.model || this.currentModel,
          provider: this.name,
          usage,
          finishReason: this.mapFinishReason(finalResponse.candidates?.[0]?.finishReason)
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
      // Use centralized model registry
      const googleModels = ModelRegistry.getProviderModels('google');
      return googleModels.map(model => ModelRegistry.toModelInfo(model));
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
      maxContextWindow: 2000000, // Gemini 1.5 Pro
      supportedFeatures: [
        'text_generation',
        'multimodal',
        'function_calling',
        'thinking_mode',
        'streaming',
        'long_context',
        'text_to_speech'
      ]
    };
  }

  // Private methods
  private supportsThinking(modelId: string): boolean {
    return [
      'gemini-2.5-pro-exp-03-25',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash-001'
    ].includes(modelId);
  }

  private convertTools(tools: any[]): any[] {
    return tools.map(tool => {
      if (tool.type === 'function') {
        return {
          functionDeclarations: [{
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters
          }]
        };
      }
      return tool;
    });
  }

  private extractGeminiUsage(response: any): any {
    const usage = response.response?.usageMetadata;
    if (usage) {
      return {
        promptTokens: usage.promptTokenCount || 0,
        completionTokens: usage.candidatesTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0
      };
    }
    return undefined;
  }

  private mapFinishReason(reason: any): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    const reasonMap: Record<string, 'stop' | 'length' | 'tool_calls' | 'content_filter'> = {
      'FINISH_REASON_STOP': 'stop',
      'FINISH_REASON_MAX_TOKENS': 'length',
      'FINISH_REASON_SAFETY': 'content_filter',
      'FINISH_REASON_RECITATION': 'content_filter'
    };
    return reasonMap[reason] || 'stop';
  }

  async getModelPricing(modelId: string): Promise<ModelPricing | null> {
    console.log('GoogleAdapter: getModelPricing called for model:', modelId);
    
    // Use centralized model registry for pricing
    const modelSpec = ModelRegistry.findModel('google', modelId);
    console.log('GoogleAdapter: ModelRegistry.findModel result:', modelSpec);
    
    if (modelSpec) {
      const pricing: ModelPricing = {
        rateInputPerMillion: modelSpec.inputCostPerMillion,
        rateOutputPerMillion: modelSpec.outputCostPerMillion,
        currency: 'USD'
      };
      console.log('GoogleAdapter: returning pricing:', pricing);
      return pricing;
    }

    console.log('GoogleAdapter: No model spec found for:', modelId);
    return null;
  }
}