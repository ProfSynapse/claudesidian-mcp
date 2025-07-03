/**
 * Mistral AI Adapter with Agents API and latest models
 * Supports Mistral OCR 25.05, Agents API, and specialized models
 * Updated June 17, 2025 with latest La Plateforme API features
 */

import { BaseAdapter } from '../BaseAdapter';
import { GenerateOptions, StreamOptions, LLMResponse, ModelInfo, ProviderCapabilities, ModelPricing } from '../types';

export class MistralAdapter extends BaseAdapter {
  readonly name = 'mistral';
  readonly baseUrl = 'https://api.mistral.ai/v1';

  constructor(apiKey: string, model?: string) {
    super(apiKey, model || 'mistral-large-latest');
    this.initializeCache();
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            ...this.buildHeaders(),
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: options?.model || this.currentModel,
            messages: this.buildMessages(prompt, options?.systemPrompt),
            temperature: options?.temperature,
            max_tokens: options?.maxTokens,
            response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
            stop: options?.stopSequences,
            tools: options?.tools
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as any;
        
        const usage = this.extractUsage(data);
        const finishReason = data.choices[0].finish_reason;
        const toolCalls = data.choices[0].message.tool_calls;
        
        return await this.buildLLMResponse(
          data.choices[0].message.content || '',
          data.model,
          usage,
          undefined,
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
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            ...this.buildHeaders(),
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: options?.model || this.currentModel,
            messages: this.buildMessages(prompt, options?.systemPrompt),
            temperature: options?.temperature,
            max_tokens: options?.maxTokens,
            stream: true
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        let fullText = '';
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;

              try {
                const parsed = JSON.parse(data);
                const deltaText = parsed.choices[0]?.delta?.content || '';
                if (deltaText) {
                  fullText += deltaText;
                  options?.onToken?.(deltaText);
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }

        const result: LLMResponse = {
          text: fullText,
          model: options?.model || this.currentModel,
          provider: this.name,
          finishReason: 'stop'
        };

        options?.onComplete?.(result);
        return result;
      } catch (error) {
        options?.onError?.(error as Error);
        this.handleError(error, 'streaming generation');
      }
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    const models = [
      {
        id: 'mistral-large-latest',
        name: 'Mistral Large Latest',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        features: ['chat', 'function_calling', 'json_mode', 'multimodal']
      },
      {
        id: 'mistral-medium-latest',
        name: 'Mistral Medium Latest', 
        contextWindow: 128000,
        maxOutputTokens: 8192,
        features: ['chat', 'function_calling', 'json_mode']
      },
      {
        id: 'mistral-small-3.1-25.03',
        name: 'Mistral Small 3.1',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        features: ['chat', 'multimodal', 'function_calling']
      },
      {
        id: 'mistral-ocr-25.05',
        name: 'Mistral OCR 25.05',
        contextWindow: 32000,
        maxOutputTokens: 4096,
        features: ['ocr', 'document_understanding']
      },
      {
        id: 'codestral-25.01',
        name: 'Codestral 25.01',
        contextWindow: 32000,
        maxOutputTokens: 4096,
        features: ['code_generation', 'code_completion']
      }
    ];

    return models.map(model => ({
      id: model.id,
      name: model.name,
      contextWindow: model.contextWindow,
      maxOutputTokens: model.maxOutputTokens,
      supportsJSON: model.features.includes('json_mode'),
      supportsImages: model.features.includes('multimodal'),
      supportsFunctions: model.features.includes('function_calling'),
      supportsStreaming: true,
      supportsThinking: false,
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
        'chat_completions',
        'agents_api',
        'function_calling',
        'json_mode',
        'ocr',
        'code_generation',
        'streaming'
      ]
    };
  }

  private getCostPer1kTokens(modelId: string): { input: number; output: number } | undefined {
    const costs: Record<string, { input: number; output: number }> = {
      'mistral-large-latest': { input: 0.002, output: 0.006 },
      'mistral-medium-latest': { input: 0.0025, output: 0.0075 },
      'mistral-small-3.1-25.03': { input: 0.001, output: 0.003 },
      'mistral-ocr-25.05': { input: 0.00015, output: 0.00015 }, // Per 1K tokens
      'codestral-25.01': { input: 0.001, output: 0.003 }
    };
    // Note: Free tier available on La Plateforme for experimentation
    return costs[modelId];
  }

  async getModelPricing(modelId: string): Promise<ModelPricing | null> {
    console.log('MistralAdapter: getModelPricing called for model:', modelId);
    
    const costs = this.getCostPer1kTokens(modelId);
    console.log('MistralAdapter: getCostPer1kTokens result:', costs);
    
    if (!costs) {
      console.log('MistralAdapter: No costs found for model:', modelId);
      return null;
    }

    const pricing: ModelPricing = {
      rateInputPerMillion: costs.input * 1000,
      rateOutputPerMillion: costs.output * 1000,
      currency: 'USD'
    };
    
    console.log('MistralAdapter: returning pricing:', pricing);
    return pricing;
  }
}