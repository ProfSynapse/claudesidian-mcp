/**
 * OpenRouter Adapter for 400+ models
 * Supports OpenRouter's unified API with model variants
 * Updated June 17, 2025 with latest OpenRouter features and authentication
 */

import { BaseAdapter } from '../BaseAdapter';
import { GenerateOptions, StreamOptions, LLMResponse, ModelInfo, ProviderCapabilities, CostDetails } from '../types';
import { ModelRegistry } from '../ModelRegistry';

export class OpenRouterAdapter extends BaseAdapter {
  readonly name = 'openrouter';
  readonly baseUrl = 'https://openrouter.ai/api/v1';

  constructor(model?: string) {
    super('OPENROUTER_API_KEY', model || 'anthropic/claude-3.5-sonnet');
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
            'X-Title': 'Synaptic Lab Kit'
          },
          body: JSON.stringify({
            model: options?.model || this.currentModel,
            messages: this.buildMessages(prompt, options?.systemPrompt),
            temperature: options?.temperature,
            max_tokens: options?.maxTokens,
            response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
            stop: options?.stopSequences,
            tools: options?.tools,
            // Include usage information in response
            usage: { include: true }
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
            provider_used: data.provider,
            cost: data.cost
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
            'X-Title': 'Synaptic Lab Kit'
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
      
      return data.data.map((model: any) => ({
        id: model.id,
        name: model.name || model.id,
        contextWindow: model.context_length || 8192,
        maxOutputTokens: model.max_completion_tokens || 4096,
        supportsJSON: true, // Most models support JSON through OpenRouter
        supportsImages: model.modalities?.includes('image') || false,
        supportsFunctions: model.modalities?.includes('tool') || false,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kTokens: {
          input: parseFloat(model.pricing?.prompt || '0') * 1000,
          output: parseFloat(model.pricing?.completion || '0') * 1000
        }
      }));
    } catch (error) {
      // Fallback to centralized model registry
      const openrouterModels = ModelRegistry.getProviderModels('openrouter');
      return openrouterModels.map(model => ModelRegistry.toModelInfo(model));
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsThinking: false,
      maxContextWindow: 2000000, // Varies by model
      supportedFeatures: [
        'chat_completions',
        'model_routing',
        'fallback_providers',
        'cost_optimization',
        'streaming',
        'function_calling',
        'json_mode',
        'free_models'
      ]
    };
  }

  // Model variants
  addModelVariant(baseModel: string, variant: 'free' | 'nitro' | 'floor' | 'online'): string {
    return `${baseModel}:${variant}`;
  }



  async getModelPricing(modelId: string): Promise<CostDetails | null> {
    // Use centralized model registry for pricing
    const modelSpec = ModelRegistry.findModel('openrouter', modelId);
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