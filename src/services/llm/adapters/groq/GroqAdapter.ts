/**
 * Groq Adapter with Ultra-Fast Inference
 * Leverages Groq's high-performance LLM serving infrastructure
 * Uses OpenAI-compatible API with extended usage metrics
 * 
 * Key Features:
 * - Ultra-fast inference (up to 750 tokens/second)
 * - Extended usage metrics (queueTime, promptTime, completionTime)
 * - OpenAI API compatibility
 * - Vision and audio model support
 * - Compound model capabilities
 */

import Groq from 'groq-sdk';
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
import { ModelRegistry } from '../ModelRegistry';
import { ModelSpec } from '../modelTypes';
import { GROQ_MODELS, GROQ_DEFAULT_MODEL } from './GroqModels';

/**
 * Extended usage metrics specific to Groq
 */
interface GroqUsage extends TokenUsage {
  queueTime?: number;      // Time spent in queue (ms)
  promptTime?: number;     // Time to process prompt (ms)
  completionTime?: number; // Time to generate completion (ms)
  totalTime?: number;      // Total request time (ms)
}

export class GroqAdapter extends BaseAdapter {
  readonly name = 'groq';
  readonly baseUrl = 'https://api.groq.com/openai/v1';
  
  private client: Groq;

  constructor(model?: string) {
    super('GROQ_API_KEY', model || GROQ_DEFAULT_MODEL);
    
    // Initialize Groq client with official SDK
    this.client = new Groq({
      apiKey: this.apiKey,
      timeout: 120000, // 2 minutes for complex requests
      maxRetries: 3
    });
    
    this.initializeCache({
      maxSize: 2000, // Larger cache for fast responses
      defaultTTL: 7200000 // 2 hours - longer TTL for stable results
    });
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      try {
        const model = options?.model || this.currentModel;
        this.validateModel(model);

        const messages = this.buildMessages(prompt, options?.systemPrompt);
        
        const requestParams: any = {
          model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 8192,
          stream: false
        };

        // Add optional parameters
        if (options?.topP !== undefined) requestParams.top_p = options.topP;
        if (options?.frequencyPenalty !== undefined) requestParams.frequency_penalty = options.frequencyPenalty;
        if (options?.presencePenalty !== undefined) requestParams.presence_penalty = options.presencePenalty;
        if (options?.stopSequences) requestParams.stop = options.stopSequences;

        // JSON mode support
        if (options?.jsonMode) {
          requestParams.response_format = { type: 'json_object' };
        }

        // Function calling support
        if (options?.tools && options.tools.length > 0) {
          requestParams.tools = this.convertTools(options.tools);
          requestParams.tool_choice = 'auto';
        }

        // Record start time for performance metrics
        const startTime = Date.now();
        
        const response = await this.client.chat.completions.create(requestParams);
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        const choice = response.choices?.[0];
        if (!choice) {
          throw new LLMProviderError(
            'No response choice received from Groq',
            this.name,
            'NO_RESPONSE_CHOICE'
          );
        }

        // Extract Groq-specific usage metrics
        const usage = this.extractGroqUsage(response, totalTime);
        
        // Build response with extended metadata
        const llmResponse = await this.buildLLMResponse(
          choice.message?.content || '',
          response.model,
          usage,
          {
            groqMetrics: {
              totalTime,
              queueTime: usage.queueTime,
              promptTime: usage.promptTime,
              completionTime: usage.completionTime,
              tokensPerSecond: usage.completionTokens && usage.completionTime 
                ? Math.round((usage.completionTokens / usage.completionTime) * 1000)
                : undefined
            },
            finishReason: choice.finish_reason,
            logprobs: choice.logprobs
          },
          this.mapFinishReason(choice.finish_reason),
          choice.message?.tool_calls
        );

        return llmResponse;
      } catch (error) {
        return this.handleGroqError(error, 'generation');
      }
    });
  }

  async generateStream(prompt: string, options?: StreamOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      try {
        const model = options?.model || this.currentModel;
        this.validateModel(model);

        const messages = this.buildMessages(prompt, options?.systemPrompt);
        
        const streamParams: any = {
          model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 8192,
          stream: true,
          stream_options: { include_usage: true } // Get usage metrics in stream
        };

        // Add optional parameters
        if (options?.topP !== undefined) streamParams.top_p = options.topP;
        if (options?.frequencyPenalty !== undefined) streamParams.frequency_penalty = options.frequencyPenalty;
        if (options?.presencePenalty !== undefined) streamParams.presence_penalty = options.presencePenalty;
        if (options?.stopSequences) streamParams.stop = options.stopSequences;

        // JSON mode support
        if (options?.jsonMode) {
          streamParams.response_format = { type: 'json_object' };
        }

        // Function calling support
        if (options?.tools && options.tools.length > 0) {
          streamParams.tools = this.convertTools(options.tools);
          streamParams.tool_choice = 'auto';
        }

        const startTime = Date.now();
        const stream = await this.client.chat.completions.create(streamParams);

        let fullText = '';
        let usage: GroqUsage | undefined;
        let finishReason: string | null = null;
        let toolCalls: any[] = [];
        let responseModel = model;

        for await (const chunk of stream as any) {
          // Handle content deltas
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            fullText += delta.content;
            options?.onToken?.(delta.content);
          }

          // Handle tool calls
          if (delta?.tool_calls) {
            toolCalls = delta.tool_calls;
          }

          // Handle finish reason
          if (chunk.choices?.[0]?.finish_reason) {
            finishReason = chunk.choices[0].finish_reason;
          }

          // Handle usage metrics (typically in the last chunk)
          if (chunk.usage) {
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            usage = this.extractGroqUsage({ usage: chunk.usage }, totalTime);
          }

          // Handle model info
          if (chunk.model) {
            responseModel = chunk.model;
          }
        }

        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Ensure we have usage metrics
        if (!usage) {
          usage = {
            promptTokens: 0,
            completionTokens: fullText.length / 4, // Rough estimate
            totalTokens: fullText.length / 4,
            totalTime
          };
        }

        const response = await this.buildLLMResponse(
          fullText,
          responseModel,
          usage,
          {
            groqMetrics: {
              totalTime,
              queueTime: usage.queueTime,
              promptTime: usage.promptTime,
              completionTime: usage.completionTime,
              tokensPerSecond: usage.completionTokens && usage.completionTime 
                ? Math.round((usage.completionTokens / usage.completionTime) * 1000)
                : undefined
            },
            streaming: true
          },
          this.mapFinishReason(finishReason),
          toolCalls
        );

        options?.onComplete?.(response);
        return response;
      } catch (error) {
        options?.onError?.(error as Error);
        return this.handleGroqError(error, 'streaming generation');
      }
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      // Use centralized model registry for consistent model information
      return GROQ_MODELS.map(model => ModelRegistry.toModelInfo(model));
    } catch (error) {
      this.handleError(error, 'listing models');
      return [];
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsJSON: true,
      supportsImages: true, // Via vision models
      supportsFunctions: true,
      supportsThinking: true, // Via reasoning models
      maxContextWindow: 131072, // Llama 3.1/3.2 context window
      supportedFeatures: [
        'chat',
        'streaming',
        'json_mode',
        'function_calling',
        'vision', // Llama 3.2 vision models
        'audio_transcription', // Whisper models
        'ultra_fast_inference',
        'extended_usage_metrics',
        'compound_models',
        'reasoning' // Llama 3.1 405B reasoning
      ]
    };
  }

  async getModelPricing(modelId: string): Promise<CostDetails | null> {
    const modelSpec = GROQ_MODELS.find(m => m.apiName === modelId);
    if (!modelSpec) return null;

    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: 'USD',
      rateInputPerMillion: modelSpec.inputCostPerMillion,
      rateOutputPerMillion: modelSpec.outputCostPerMillion
    };
  }

  // Private helper methods

  /**
   * Validate that the requested model is supported by Groq
   */
  private validateModel(model: string): void {
    const supportedModel = GROQ_MODELS.find(m => m.apiName === model);
    if (!supportedModel) {
      throw new LLMProviderError(
        `Model ${model} is not supported by Groq. Available models: ${GROQ_MODELS.map(m => m.apiName).join(', ')}`,
        this.name,
        'UNSUPPORTED_MODEL'
      );
    }
  }

  /**
   * Convert tools to OpenAI format for Groq compatibility
   */
  private convertTools(tools: any[]): any[] {
    return tools.map(tool => {
      if (tool.type === 'function') {
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

  /**
   * Extract Groq-specific usage metrics with performance data
   */
  private extractGroqUsage(response: any, totalTime: number): GroqUsage {
    const baseUsage = this.extractUsage(response);
    
    // Groq provides extended usage metrics in x-groq headers or usage object
    const groqUsage: GroqUsage = {
      promptTokens: baseUsage?.promptTokens || 0,
      completionTokens: baseUsage?.completionTokens || 0,
      totalTokens: baseUsage?.totalTokens || 0,
      totalTime
    };

    // Extract Groq-specific timing metrics if available
    if (response.usage) {
      const usage = response.usage;
      
      // Groq may provide these in extended usage object
      if (usage.queue_time) groqUsage.queueTime = usage.queue_time;
      if (usage.prompt_time) groqUsage.promptTime = usage.prompt_time;
      if (usage.completion_time) groqUsage.completionTime = usage.completion_time;
      if (usage.total_time) groqUsage.totalTime = usage.total_time;
    }

    return groqUsage;
  }

  /**
   * Map Groq finish reasons to standard format
   */
  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    if (!reason) return 'stop';
    
    const reasonMap: Record<string, 'stop' | 'length' | 'tool_calls' | 'content_filter'> = {
      'stop': 'stop',
      'length': 'length',
      'tool_calls': 'tool_calls',
      'content_filter': 'content_filter',
      'function_call': 'tool_calls' // Legacy mapping
    };
    
    return reasonMap[reason] || 'stop';
  }

  /**
   * Enhanced error handling for Groq-specific errors
   */
  private handleGroqError(error: any, operation: string): never {
    if (error instanceof LLMProviderError) {
      throw error;
    }

    // Handle Groq SDK error responses
    if (error instanceof Groq.APIError) {
      const status = error.status;
      let errorCode = 'HTTP_ERROR';
      let message = error.message;

      // Groq-specific error codes
      switch (status) {
        case 400:
          errorCode = 'INVALID_REQUEST';
          if (message.includes('model')) {
            errorCode = 'UNSUPPORTED_MODEL';
          }
          break;
        case 401:
          errorCode = 'AUTHENTICATION_ERROR';
          message = 'Invalid Groq API key. Please check your GROQ_API_KEY environment variable.';
          break;
        case 429:
          errorCode = 'RATE_LIMIT_ERROR';
          message = 'Groq rate limit exceeded. Please try again later.';
          break;
        case 503:
          errorCode = 'SERVICE_UNAVAILABLE';
          message = 'Groq service temporarily unavailable. Please try again.';
          break;
        default:
          if (status >= 500) {
            errorCode = 'SERVER_ERROR';
            message = `Groq server error: ${message}`;
          }
          break;
      }

      throw new LLMProviderError(
        `${operation} failed: ${message}`,
        this.name,
        errorCode,
        error
      );
    }

    // Handle network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new LLMProviderError(
        `${operation} failed: Unable to connect to Groq API. Please check your internet connection.`,
        this.name,
        'NETWORK_ERROR',
        error
      );
    }

    // Generic error fallback
    throw new LLMProviderError(
      `${operation} failed: ${error.message}`,
      this.name,
      'UNKNOWN_ERROR',
      error
    );
  }

  /**
   * Get performance metrics for the last request
   * Useful for monitoring Groq's ultra-fast inference
   */
  getPerformanceMetrics(): {
    averageTokensPerSecond?: number;
    lastRequestTime?: number;
    cacheHitRate?: number;
  } {
    const cacheMetrics = this.getCacheMetrics();
    
    return {
      cacheHitRate: cacheMetrics.hits > 0 ? cacheMetrics.hits / (cacheMetrics.hits + cacheMetrics.misses) : 0,
      // Additional metrics would be tracked in a real implementation
      // These would come from request history or monitoring
    };
  }

  /**
   * Check if a model supports specific capabilities
   */
  supportsCapability(model: string, capability: keyof ModelSpec['capabilities']): boolean {
    const modelSpec = GROQ_MODELS.find(m => m.apiName === model);
    if (!modelSpec) return false;
    
    return modelSpec.capabilities[capability] || false;
  }

  /**
   * Get recommended model for specific use cases
   */
  getRecommendedModel(useCase: 'speed' | 'quality' | 'vision' | 'audio' | 'reasoning'): string {
    const recommendations = {
      speed: 'llama-3.1-8b-instant',
      quality: 'llama-3.1-70b-versatile', 
      vision: 'llama-3.2-90b-vision-preview',
      audio: 'whisper-large-v3',
      reasoning: 'llama-3.1-405b-reasoning'
    };
    
    return recommendations[useCase] || GROQ_DEFAULT_MODEL;
  }
}