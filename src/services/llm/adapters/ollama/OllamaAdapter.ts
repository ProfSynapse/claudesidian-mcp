/**
 * Ollama LLM Adapter
 * Provides local, privacy-focused LLM models via Ollama
 * Similar to the embedding provider but for text generation
 */

import { BaseAdapter } from '../BaseAdapter';
import { 
  GenerateOptions, 
  StreamOptions, 
  LLMResponse, 
  ModelInfo, 
  ProviderCapabilities,
  CostDetails,
  TokenUsage,
  LLMProviderError
} from '../types';

export class OllamaAdapter extends BaseAdapter {
  readonly name = 'ollama';
  readonly baseUrl: string;
  
  private ollamaUrl: string;

  constructor(ollamaUrl = 'http://127.0.0.1:11434', defaultModel = 'llama3.1') {
    // Ollama doesn't need an API key - set requiresApiKey to false
    super('', defaultModel, ollamaUrl, false);
    
    this.ollamaUrl = ollamaUrl;
    this.baseUrl = ollamaUrl;
    
    this.initializeCache();
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    try {
      const model = options?.model || this.currentModel;
      
      const requestBody: any = {
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: options?.temperature,
          num_predict: options?.maxTokens,
          stop: options?.stopSequences,
          top_p: options?.topP,
          frequency_penalty: options?.frequencyPenalty,
          presence_penalty: options?.presencePenalty
        }
      };

      // Remove undefined values
      Object.keys(requestBody.options).forEach(key => {
        if (requestBody.options[key] === undefined) {
          delete requestBody.options[key];
        }
      });

      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new LLMProviderError(
          `Ollama API error: ${response.status} ${response.statusText} - ${errorText}`,
          'generation',
          'API_ERROR'
        );
      }

      const data = await response.json();

      if (!data.response) {
        throw new LLMProviderError(
          'Invalid response format from Ollama API: missing response field',
          'generation',
          'INVALID_RESPONSE'
        );
      }

      // Extract usage information
      const usage: TokenUsage = {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
      };

      return {
        text: data.response,
        model: model,
        provider: this.name,
        usage: usage,
        cost: {
          inputCost: 0, // Local models are free
          outputCost: 0,
          totalCost: 0,
          currency: 'USD',
          rateInputPerMillion: 0,
          rateOutputPerMillion: 0
        },
        finishReason: data.done ? 'stop' : 'length',
        metadata: {
          cached: false,
          modelDetails: data.model,
          totalDuration: data.total_duration,
          loadDuration: data.load_duration,
          promptEvalDuration: data.prompt_eval_duration,
          evalDuration: data.eval_duration
        }
      };
    } catch (error) {
      if (error instanceof LLMProviderError) {
        throw error;
      }
      throw new LLMProviderError(
        `Ollama generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'generation',
        'NETWORK_ERROR'
      );
    }
  }

  async generateStream(prompt: string, options?: StreamOptions): Promise<LLMResponse> {
    try {
      const model = options?.model || this.currentModel;
      
      const requestBody: any = {
        model: model,
        prompt: prompt,
        stream: true,
        options: {
          temperature: options?.temperature,
          num_predict: options?.maxTokens,
          stop: options?.stopSequences,
          top_p: options?.topP,
          frequency_penalty: options?.frequencyPenalty,
          presence_penalty: options?.presencePenalty
        }
      };

      // Remove undefined values
      Object.keys(requestBody.options).forEach(key => {
        if (requestBody.options[key] === undefined) {
          delete requestBody.options[key];
        }
      });

      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new LLMProviderError(
          `Ollama API error: ${response.status} ${response.statusText} - ${errorText}`,
          'streaming',
          'API_ERROR'
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new LLMProviderError(
          'No response body available for streaming',
          'streaming',
          'NO_RESPONSE_BODY'
        );
      }

      let fullText = '';
      let usage: TokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      };
      let finishReason: 'stop' | 'length' = 'stop';
      let metadata: Record<string, any> = {};

      try {
        const decoder = new TextDecoder();
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              
              if (data.response) {
                fullText += data.response;
                options?.onToken?.(data.response);
              }
              
              if (data.done) {
                usage = {
                  promptTokens: data.prompt_eval_count || 0,
                  completionTokens: data.eval_count || 0,
                  totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
                };
                
                metadata = {
                  modelDetails: data.model,
                  totalDuration: data.total_duration,
                  loadDuration: data.load_duration,
                  promptEvalDuration: data.prompt_eval_duration,
                  evalDuration: data.eval_duration
                };
                
                finishReason = 'stop';
                break;
              }
            } catch (parseError) {
              // Skip invalid JSON lines
              continue;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const result: LLMResponse = {
        text: fullText,
        model: model,
        provider: this.name,
        usage: usage,
        cost: {
          inputCost: 0, // Local models are free
          outputCost: 0,
          totalCost: 0,
          currency: 'USD',
          rateInputPerMillion: 0,
          rateOutputPerMillion: 0
        },
        finishReason: finishReason,
        metadata: {
          ...metadata,
          cached: false,
          streamed: true
        }
      };

      options?.onComplete?.(result);
      return result;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error('Unknown streaming error');
      options?.onError?.(errorObj);
      
      if (error instanceof LLMProviderError) {
        throw error;
      }
      throw new LLMProviderError(
        `Ollama streaming failed: ${errorObj.message}`,
        'streaming',
        'NETWORK_ERROR'
      );
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    // Only return the configured model, not all available models
    // This ensures the UI only shows the model the user specifically configured
    return [{
      id: this.currentModel,
      name: this.currentModel,
      contextWindow: this.estimateContextWindow(this.currentModel),
      supportsStreaming: true,
      supportsJSON: false, // Ollama doesn't have built-in JSON mode
      supportsImages: this.currentModel.includes('vision') || this.currentModel.includes('llava'),
      supportsFunctions: false,
      supportsThinking: false,
      pricing: {
        inputPerMillion: 0, // Local models are free
        outputPerMillion: 0,
        currency: 'USD',
        lastUpdated: new Date().toISOString()
      }
    }];
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsJSON: false, // Ollama doesn't have built-in JSON mode
      supportsImages: false, // Depends on specific model
      supportsFunctions: false,
      supportsThinking: false,
      maxContextWindow: 128000, // Varies by model, this is a reasonable default
      supportedFeatures: ['streaming', 'local', 'privacy']
    };
  }

  async getModelPricing(modelId: string): Promise<CostDetails | null> {
    // Local models are free
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: 'USD',
      rateInputPerMillion: 0,
      rateOutputPerMillion: 0
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        method: 'GET'
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  // Utility methods
  private formatSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  private estimateContextWindow(modelName: string): number {
    // Rough estimates based on common Ollama models
    if (modelName.includes('llama3.1')) return 128000;
    if (modelName.includes('llama3')) return 8192;
    if (modelName.includes('llama2')) return 4096;
    if (modelName.includes('mistral')) return 32768;
    if (modelName.includes('codellama')) return 16384;
    if (modelName.includes('gemma')) return 8192;
    if (modelName.includes('qwen')) return 32768;
    if (modelName.includes('phi')) return 4096;
    
    // Default reasonable estimate
    return 8192;
  }

  protected buildMessages(prompt: string, systemPrompt?: string): any[] {
    const messages = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });
    
    return messages;
  }

  protected handleError(error: any, operation: string): never {
    if (error instanceof LLMProviderError) {
      throw error;
    }

    let message = `Ollama ${operation} failed`;
    let code = 'UNKNOWN_ERROR';

    if (error?.message) {
      message += `: ${error.message}`;
    }

    if (error?.code === 'ECONNREFUSED') {
      message = 'Cannot connect to Ollama server. Make sure Ollama is running.';
      code = 'CONNECTION_REFUSED';
    } else if (error?.code === 'ENOTFOUND') {
      message = 'Ollama server not found. Check the URL configuration.';
      code = 'SERVER_NOT_FOUND';
    }

    throw new LLMProviderError(message, this.name, code, error);
  }
}