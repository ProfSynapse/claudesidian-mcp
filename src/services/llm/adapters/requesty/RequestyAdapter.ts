/**
 * Requesty AI Adapter for 150+ models via router
 * OpenAI-compatible interface with model routing
 * Updated June 17, 2025 with latest Requesty router features
 */

import { BaseAdapter } from '../BaseAdapter';
import { GenerateOptions, StreamOptions, LLMResponse, ModelInfo, ProviderCapabilities, CostDetails } from '../types';
import { ModelRegistry } from '../ModelRegistry';

export class RequestyAdapter extends BaseAdapter {
  readonly name = 'requesty';
  readonly baseUrl = 'https://router.requesty.ai/v1';

  constructor(model?: string) {
    super('REQUESTY_API_KEY', model || 'gpt-4-turbo');
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            ...this.buildHeaders(),
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://synaptic-lab-kit.com',
            'X-Title': 'Synaptic Lab Kit',
            'User-Agent': 'Synaptic-Lab-Kit/1.0.0'
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
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json() as any;
        
        const usage = this.extractUsage(data);
        const result: LLMResponse = {
          text: data.choices[0].message.content || '',
          model: data.model,
          provider: this.name,
          finishReason: data.choices[0].finish_reason,
          toolCalls: data.choices[0].message.tool_calls,
          metadata: {
            routed_provider: data.provider_used,
            analytics: data.analytics
          }
        };
        
        if (usage) {
          result.usage = usage;
        }
        
        return result;
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
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://synaptic-lab-kit.com',
            'X-Title': 'Synaptic Lab Kit',
            'User-Agent': 'Synaptic-Lab-Kit/1.0.0'
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
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as any;
      
      return data.data?.map((model: any) => ({
        id: model.id,
        name: model.name || model.id,
        contextWindow: model.context_window || 8192,
        maxOutputTokens: model.max_output_tokens || 4096,
        supportsJSON: model.features?.includes('json_mode') || true,
        supportsImages: model.features?.includes('vision') || false,
        supportsFunctions: model.features?.includes('function_calling') || true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kTokens: model.pricing ? {
          input: model.pricing.input * 1000,
          output: model.pricing.output * 1000
        } : undefined
      })) || this.getRegistryModels();
    } catch (error) {
      console.warn('Failed to fetch Requesty models, using defaults:', error);
      return this.getRegistryModels();
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsThinking: false,
      maxContextWindow: 128000, // Varies by model
      supportedFeatures: [
        'chat_completions',
        'model_routing',
        'analytics',
        'cost_optimization',
        'streaming',
        'function_calling',
        'json_mode',
        'multi_provider'
      ]
    };
  }

  private getRegistryModels(): ModelInfo[] {
    // Use centralized model registry
    const requestyModels = ModelRegistry.getProviderModels('requesty');
    return requestyModels.map(model => ModelRegistry.toModelInfo(model));
  }


  async getModelPricing(modelId: string): Promise<CostDetails | null> {
    // Use centralized model registry for pricing
    const modelSpec = ModelRegistry.findModel('requesty', modelId);
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
}