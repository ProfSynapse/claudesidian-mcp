/**
 * Base LLM Adapter
 * Abstract class that all provider adapters extend
 * Based on patterns from services/llm/BaseLLMProvider.ts
 */

import { 
  GenerateOptions, 
  StreamOptions, 
  LLMResponse, 
  ModelInfo, 
  LLMProviderError,
  ProviderConfig,
  ProviderCapabilities,
  TokenUsage,
  CostDetails
} from './types';
import { BaseCache, CacheManager } from '../utils/CacheManager';
import { createHash } from 'crypto';

export abstract class BaseAdapter {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  
  protected apiKey: string;
  protected currentModel: string;
  protected config: ProviderConfig;
  protected cache!: BaseCache<LLMResponse>;

  constructor(envKeyName: string, defaultModel: string, baseUrl?: string) {
    this.apiKey = process.env[envKeyName] || '';
    this.currentModel = defaultModel;
    
    if (!this.apiKey) {
      console.warn(`⚠️ ${envKeyName} not found in environment variables`);
    }

    this.config = {
      apiKey: this.apiKey,
      baseUrl: baseUrl || ''
    };

    this.validateConfiguration();
  }

  protected initializeCache(cacheConfig?: any): void {
    const cacheName = `${this.name}-responses`;
    this.cache = CacheManager.getCache<LLMResponse>(cacheName) || 
                 CacheManager.createLRUCache<LLMResponse>(cacheName, {
                   maxSize: cacheConfig?.maxSize || 1000,
                   defaultTTL: cacheConfig?.defaultTTL || 3600000, // 1 hour
                   ...cacheConfig
                 });
  }

  // Abstract methods that each provider must implement
  abstract generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse>;
  abstract generateStream(prompt: string, options?: StreamOptions): Promise<LLMResponse>;
  abstract listModels(): Promise<ModelInfo[]>;
  abstract getCapabilities(): ProviderCapabilities;
  abstract getModelPricing(modelId: string): Promise<CostDetails | null>;

  // Cached generate method
  async generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    // Skip cache if explicitly disabled or for streaming
    if (options?.disableCache) {
      return this.generateUncached(prompt, options);
    }

    const cacheKey = this.generateCacheKey(prompt, options);
    
    // Try cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cached: true,
          cacheHit: true
        }
      };
    }

    // Generate new response
    const response = await this.generateUncached(prompt, options);
    
    // Cache the response
    await this.cache.set(cacheKey, response, options?.cacheTTL);
    
    return {
      ...response,
      metadata: {
        ...response.metadata,
        cached: false,
        cacheHit: false
      }
    };
  }

  // Common implementations
  async generateJSON(prompt: string, schema?: any, options?: GenerateOptions): Promise<any> {
    try {
      const response = await this.generate(prompt, { 
        ...options, 
        jsonMode: true 
      });
      
      const parsed = JSON.parse(response.text);
      
      // Basic schema validation if provided
      if (schema && !this.validateSchema(parsed, schema)) {
        throw new LLMProviderError(
          'Response does not match expected schema',
          this.name,
          'SCHEMA_VALIDATION_ERROR'
        );
      }
      
      return parsed;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new LLMProviderError(
          `Invalid JSON response: ${error.message}`,
          this.name,
          'JSON_PARSE_ERROR',
          error
        );
      }
      throw error;
    }
  }

  // Cache management methods
  protected generateCacheKey(prompt: string, options?: GenerateOptions): string {
    const cacheData = {
      prompt,
      model: options?.model || this.currentModel,
      temperature: options?.temperature || 0.7,
      maxTokens: options?.maxTokens || 2000,
      topP: options?.topP,
      frequencyPenalty: options?.frequencyPenalty,
      presencePenalty: options?.presencePenalty,
      stopSequences: options?.stopSequences,
      systemPrompt: options?.systemPrompt,
      jsonMode: options?.jsonMode
    };
    
    const serialized = JSON.stringify(cacheData);
    return createHash('sha256').update(serialized).digest('hex');
  }

  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  getCacheMetrics() {
    return this.cache.getMetrics();
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }
    
    try {
      await this.listModels();
      return true;
    } catch (error) {
      console.warn(`Provider ${this.name} unavailable:`, error);
      return false;
    }
  }

  setModel(model: string): void {
    this.currentModel = model;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  getApiKey(): string {
    return this.apiKey ? '***' + this.apiKey.slice(-4) : 'NOT_SET';
  }

  // Helper methods
  protected validateConfiguration(): void {
    if (!this.apiKey) {
      throw new LLMProviderError(
        `API key not configured for ${this.name}`,
        this.name,
        'MISSING_API_KEY'
      );
    }
  }

  protected buildHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Synaptic-Lab-Kit/1.0.0',
      ...additionalHeaders
    };

    return headers;
  }

  protected handleError(error: any, operation: string): never {
    if (error instanceof LLMProviderError) {
      throw error;
    }

    if (error.response) {
      // HTTP error
      const status = error.response.status;
      const message = error.response.data?.error?.message || error.message;
      
      let errorCode = 'HTTP_ERROR';
      if (status === 401) errorCode = 'AUTHENTICATION_ERROR';
      if (status === 403) errorCode = 'PERMISSION_ERROR';
      if (status === 429) errorCode = 'RATE_LIMIT_ERROR';
      if (status >= 500) errorCode = 'SERVER_ERROR';

      throw new LLMProviderError(
        `${operation} failed: ${message}`,
        this.name,
        errorCode,
        error
      );
    }

    throw new LLMProviderError(
      `${operation} failed: ${error.message}`,
      this.name,
      'UNKNOWN_ERROR',
      error
    );
  }

  protected validateSchema(data: any, schema: any): boolean {
    // Basic schema validation - could be enhanced with a proper validator
    if (typeof schema !== 'object' || schema === null) {
      return true;
    }

    if (schema.type) {
      const expectedType = schema.type;
      const actualType = Array.isArray(data) ? 'array' : typeof data;
      
      if (expectedType !== actualType) {
        return false;
      }
    }

    if (schema.properties && typeof data === 'object') {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (schema.required?.includes(key) && !(key in data)) {
          return false;
        }
        
        if (key in data && !this.validateSchema(data[key], propSchema)) {
          return false;
        }
      }
    }

    return true;
  }

  protected buildMessages(prompt: string, systemPrompt?: string): any[] {
    const messages: any[] = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });
    
    return messages;
  }

  protected extractUsage(response: any): TokenUsage | undefined {
    // Default implementation - override in specific adapters
    if (response.usage) {
      return {
        promptTokens: response.usage.prompt_tokens || response.usage.input_tokens || 0,
        completionTokens: response.usage.completion_tokens || response.usage.output_tokens || 0,
        totalTokens: response.usage.total_tokens || 0
      };
    }
    return undefined;
  }

  // Cost calculation methods
  protected async calculateCost(usage: TokenUsage, model: string): Promise<CostDetails | null> {
    const modelInfo = await this.getModelPricing(model);
    if (!modelInfo) return null;
    
    const inputCost = (usage.promptTokens / 1_000_000) * modelInfo.rateInputPerMillion;
    const outputCost = (usage.completionTokens / 1_000_000) * modelInfo.rateOutputPerMillion;
    const totalCost = inputCost + outputCost;

    return {
      inputCost,
      outputCost,
      totalCost,
      currency: modelInfo.currency,
      rateInputPerMillion: modelInfo.rateInputPerMillion,
      rateOutputPerMillion: modelInfo.rateOutputPerMillion
    };
  }

  protected async buildLLMResponse(
    content: string,
    model: string,
    usage?: TokenUsage,
    metadata?: Record<string, any>,
    finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter',
    toolCalls?: any[]
  ): Promise<LLMResponse> {
    const response: LLMResponse = {
      text: content,
      model,
      provider: this.name,
      usage: usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      metadata: metadata || {},
      finishReason: finishReason || 'stop',
      toolCalls: toolCalls || []
    };

    // Calculate cost if usage is available
    if (usage) {
      const cost = await this.calculateCost(usage, model);
      if (cost) {
        response.cost = cost;
      }
    }

    return response;
  }

  // Rate limiting and retry logic
  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on certain errors
        if (error instanceof LLMProviderError) {
          if (['AUTHENTICATION_ERROR', 'PERMISSION_ERROR', 'MISSING_API_KEY'].includes(error.code || '')) {
            throw error;
          }
        }
        
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }
}