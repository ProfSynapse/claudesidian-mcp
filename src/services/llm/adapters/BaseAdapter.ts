/**
 * Base LLM Adapter
 * Abstract class that all provider adapters extend
 * Based on patterns from services/llm/BaseLLMProvider.ts
 */

import { 
  GenerateOptions, 
  StreamChunk, 
  LLMResponse, 
  ModelInfo, 
  LLMProviderError,
  ProviderConfig,
  ProviderCapabilities,
  TokenUsage,
  CostDetails,
  ModelPricing
} from './types';
import { BaseCache, CacheManager } from '../utils/CacheManager';
import { createHash } from 'crypto';
import { createParser, type ParsedEvent, type ParseEvent } from 'eventsource-parser';

export abstract class BaseAdapter {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  
  protected apiKey: string;
  protected currentModel: string;
  protected config: ProviderConfig;
  protected cache!: BaseCache<LLMResponse>;

  constructor(apiKey: string, defaultModel: string, baseUrl?: string, requiresApiKey: boolean = true) {
    this.apiKey = apiKey || '';
    this.currentModel = defaultModel;

    this.config = {
      apiKey: this.apiKey,
      baseUrl: baseUrl || ''
    };

    if (!this.apiKey && requiresApiKey) {
      console.warn(`⚠️ API key not provided for adapter`);
    }
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
  abstract generateStreamAsync(prompt: string, options?: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown>;
  abstract listModels(): Promise<ModelInfo[]>;
  abstract getCapabilities(): ProviderCapabilities;
  abstract getModelPricing(modelId: string): Promise<ModelPricing | null>;

  /**
   * Centralized SSE streaming processor using eventsource-parser
   * Handles all the complex buffering, parsing, and error recovery
   * Each adapter provides extraction functions for their specific format
   */
  protected async* processSSEStream(
    response: Response,
    options: {
      extractContent: (parsed: any) => string | null;
      extractToolCalls: (parsed: any) => any[] | null;
      extractFinishReason: (parsed: any) => string | null;
      extractUsage?: (parsed: any) => any;
      onParseError?: (error: Error, rawData: string) => void;
      debugLabel?: string;
      // Tool call accumulation settings
      accumulateToolCalls?: boolean;
      toolCallThrottling?: {
        initialYield: boolean;
        progressInterval: number; // Yield every N characters of arguments
      };
    }
  ): AsyncGenerator<StreamChunk, void, unknown> {
    if (!response.body) {
      throw new Error('Response body is not readable');
    }

    const debugLabel = options.debugLabel || 'SSE';
    let tokenCount = 0;
    let usage: any = undefined;
    
    // Tool call accumulation system
    const toolCallsAccumulator: Map<number, any> = new Map();
    let accumulatedContent = '';
    
    // Event queue for handling async events in sync generator
    const eventQueue: StreamChunk[] = [];
    let isCompleted = false;
    let completionError: Error | null = null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const parser = createParser((event: ParseEvent) => {
      if (isCompleted) return;

      // Handle reconnect intervals
      if (event.type === 'reconnect-interval') {
        return;
      }

      // Handle [DONE] event
      if (event.data === '[DONE]') {
        
        const finalUsage = usage ? { 
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0 
        } : undefined;

        const finalToolCalls = options.accumulateToolCalls && toolCallsAccumulator.size > 0 
          ? Array.from(toolCallsAccumulator.values()) 
          : undefined;

        eventQueue.push({
          content: '',
          complete: true,
          usage: finalUsage,
          toolCalls: finalToolCalls
        });
        
        isCompleted = true;
        return;
      }

      try {
        const parsed = JSON.parse(event.data);

          // Extract content using adapter-specific logic
          const content = options.extractContent(parsed);
          if (content) {
            tokenCount++;
            accumulatedContent += content;
            
            eventQueue.push({ 
              content, 
              complete: false 
            });
          }

          // Extract tool calls using adapter-specific logic
          const toolCalls = options.extractToolCalls(parsed);
          if (toolCalls && options.accumulateToolCalls) {
            
            let shouldYieldToolCalls = false;
            
            for (const toolCall of toolCalls) {
              const index = toolCall.index || 0;
              
              if (!toolCallsAccumulator.has(index)) {
                // Initialize new tool call
                toolCallsAccumulator.set(index, {
                  id: toolCall.id || '',
                  type: toolCall.type || 'function',
                  function: {
                    name: toolCall.function?.name || '',
                    arguments: toolCall.function?.arguments || ''
                  }
                });
                shouldYieldToolCalls = options.toolCallThrottling?.initialYield !== false;
              } else {
                // Accumulate existing tool call
                const existing = toolCallsAccumulator.get(index);
                if (toolCall.id) existing.id = toolCall.id;
                if (toolCall.function?.name) existing.function.name = toolCall.function.name;
                if (toolCall.function?.arguments) {
                  existing.function.arguments += toolCall.function.arguments;
                  
                  // Check throttling conditions
                  const argLength = existing.function.arguments.length;
                  const interval = options.toolCallThrottling?.progressInterval || 50;
                  shouldYieldToolCalls = argLength > 0 && argLength % interval === 0;
                }
              }
            }
            
            if (shouldYieldToolCalls) {
              const currentToolCalls = Array.from(toolCallsAccumulator.values());
              
              eventQueue.push({
                content: '',
                complete: false,
                toolCalls: currentToolCalls
              });
            }
          }

          // Extract usage information
          if (options.extractUsage) {
            const extractedUsage = options.extractUsage(parsed);
            if (extractedUsage) {
              console.log(`[${debugLabel} SSE Debug] Usage extracted from stream event:`, extractedUsage);
              usage = extractedUsage;
            } else if (parsed.usage) {
              console.log(`[${debugLabel} SSE Debug] Event has usage but extractUsage returned null:`, parsed.usage);
            }
          }

          // Handle completion
          const finishReason = options.extractFinishReason(parsed);
          if (finishReason === 'stop' || finishReason === 'length' || finishReason === 'tool_calls') {

            // Include accumulated tool calls in completion event (same pattern as [DONE])
            const finalToolCalls = options.accumulateToolCalls && toolCallsAccumulator.size > 0
              ? Array.from(toolCallsAccumulator.values())
              : undefined;

            const finalUsageFormatted = usage ? {
              promptTokens: usage.prompt_tokens || 0,
              completionTokens: usage.completion_tokens || 0,
              totalTokens: usage.total_tokens || 0
            } : undefined;

            console.log(`[${debugLabel} SSE Debug] Yielding completion chunk with usage:`, {
              hasUsage: !!finalUsageFormatted,
              usage: finalUsageFormatted,
              rawUsage: usage
            });

            eventQueue.push({
              content: '',
              complete: true,
              toolCalls: finalToolCalls,
              usage: finalUsageFormatted
            });

            isCompleted = true;
          }

        } catch (parseError) {
          if (options.onParseError) {
            options.onParseError(parseError as Error, event.data);
          }
          // Continue processing other events
        }
      });

    try {
      // Process the stream
      while (!isCompleted && !completionError) {
        const { done, value } = await reader.read();
        
        if (done) {
          isCompleted = true;
          break;
        }

        // Feed chunk to parser
        const chunk = decoder.decode(value, { stream: true });
        parser.feed(chunk);

        // Yield any queued events
        while (eventQueue.length > 0) {
          const event = eventQueue.shift()!;
          yield event;
          
          // If this was a completion event, we're done
          if (event.complete) {
            isCompleted = true;
            break;
          }
        }
      }

      // Yield any remaining queued events
      while (eventQueue.length > 0) {
        const event = eventQueue.shift()!;
        yield event;
      }

      // If we completed without a completion event, yield one
      if (!isCompleted || (!eventQueue.length && !completionError)) {
        yield {
          content: '',
          complete: true,
          usage: usage ? {
            promptTokens: usage.prompt_tokens || 0,
            completionTokens: usage.completion_tokens || 0,
            totalTokens: usage.total_tokens || 0
          } : undefined
        };
      }

    } catch (error) {
      throw error;
    } finally {
      try {
        reader.cancel();
      } catch (error) {
      }
    }

    if (completionError) {
      throw completionError;
    }
  }

  /**
   * Process streaming responses with automatic tool call accumulation
   * Supports both SDK streams (OpenAI, Groq, Mistral) and SSE streams (Requesty, Perplexity, OpenRouter)
   *
   * This unified method handles:
   * - Text content streaming
   * - Tool call accumulation (incremental delta.tool_calls)
   * - Usage/metadata extraction
   * - Finish reason detection
   *
   * Used by: OpenAI, Groq, Mistral, Requesty, Perplexity, OpenRouter
   */
  protected async* processStream(
    stream: AsyncIterable<any> | Response,
    options: {
      extractContent: (chunk: any) => string | null;
      extractToolCalls: (chunk: any) => any[] | null;
      extractFinishReason: (chunk: any) => string | null;
      extractUsage?: (chunk: any) => any;
      debugLabel?: string;
    }
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const debugLabel = options.debugLabel || 'Stream';

    // Determine if this is SDK stream or SSE Response
    const isSdkStream = Symbol.iterator in Object(stream) || Symbol.asyncIterator in Object(stream);

    if (isSdkStream) {
      // Process SDK stream (OpenAI SDK, Groq, Mistral)
      console.log(`[${debugLabel}] Processing SDK stream with tool call accumulation`);

      const toolCallsAccumulator: Map<number, any> = new Map();
      let usage: any = undefined;

      for await (const chunk of stream as AsyncIterable<any>) {
        yield* this.processStreamChunk(chunk, options, toolCallsAccumulator, usage);

        // Update usage reference if extracted
        if (options.extractUsage) {
          const extractedUsage = options.extractUsage(chunk);
          if (extractedUsage) {
            usage = extractedUsage;
          }
        }
      }

      // Yield final completion with accumulated tool calls
      const finalToolCalls = toolCallsAccumulator.size > 0
        ? Array.from(toolCallsAccumulator.values())
        : undefined;

      const finalUsage = usage ? {
        promptTokens: usage.prompt_tokens || usage.promptTokens || 0,
        completionTokens: usage.completion_tokens || usage.completionTokens || 0,
        totalTokens: usage.total_tokens || usage.totalTokens || 0
      } : undefined;

      yield {
        content: '',
        complete: true,
        usage: finalUsage,
        toolCalls: finalToolCalls
      };
    } else {
      // Process SSE stream (Requesty, Perplexity, OpenRouter via Response object)
      console.log(`[${debugLabel}] Processing SSE stream with tool call accumulation`);

      yield* this.processSSEStream(stream as Response, {
        ...options,
        accumulateToolCalls: true,
        toolCallThrottling: {
          initialYield: true,
          progressInterval: 50
        }
      });
    }
  }

  /**
   * Process individual stream chunk with tool call accumulation
   * Handles delta.content and delta.tool_calls from any OpenAI-compatible provider
   */
  private* processStreamChunk(
    chunk: any,
    options: {
      extractContent: (chunk: any) => string | null;
      extractToolCalls: (chunk: any) => any[] | null;
      extractFinishReason: (chunk: any) => string | null;
      extractUsage?: (chunk: any) => any;
    },
    toolCallsAccumulator: Map<number, any>,
    usageRef: any
  ): Generator<StreamChunk, void, unknown> {

    // Extract text content
    const content = options.extractContent(chunk);
    if (content) {
      yield { content, complete: false };
    }

    // Extract and accumulate tool calls
    const toolCalls = options.extractToolCalls(chunk);
    if (toolCalls) {
      for (const toolCall of toolCalls) {
        const index = toolCall.index || 0;

        if (!toolCallsAccumulator.has(index)) {
          // Initialize new tool call
          toolCallsAccumulator.set(index, {
            id: toolCall.id || '',
            type: toolCall.type || 'function',
            function: {
              name: toolCall.function?.name || '',
              arguments: toolCall.function?.arguments || ''
            }
          });
        } else {
          // Accumulate existing tool call arguments
          const existing = toolCallsAccumulator.get(index);
          if (toolCall.id) existing.id = toolCall.id;
          if (toolCall.function?.name) existing.function.name = toolCall.function.name;
          if (toolCall.function?.arguments) {
            existing.function.arguments += toolCall.function.arguments;
          }
        }
      }

      // Yield progress for UI (every 50 characters of arguments)
      const currentToolCalls = Array.from(toolCallsAccumulator.values());
      const totalArgLength = currentToolCalls.reduce((sum, tc) =>
        sum + (tc.function?.arguments?.length || 0), 0
      );

      if (totalArgLength > 0 && totalArgLength % 50 === 0) {
        yield {
          content: '',
          complete: false,
          toolCalls: currentToolCalls
        };
      }
    }
  }

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
    
    const modelPricing = await this.getModelPricing(model);
    
    if (!modelPricing) {
      return null;
    }
    
    // Calculate actual costs based on token usage and pricing rates
    const inputCost = (usage.promptTokens / 1_000_000) * modelPricing.rateInputPerMillion;
    const outputCost = (usage.completionTokens / 1_000_000) * modelPricing.rateOutputPerMillion;
    const totalCost = inputCost + outputCost;

    const costDetails: CostDetails = {
      inputCost,
      outputCost,
      totalCost,
      currency: modelPricing.currency || 'USD',
      rateInputPerMillion: modelPricing.rateInputPerMillion,
      rateOutputPerMillion: modelPricing.rateOutputPerMillion
    };
    
    console.log('BaseAdapter: calculated cost successfully', {
      provider: this.name,
      model,
      usage,
      rates: {
        input: modelPricing.rateInputPerMillion,
        output: modelPricing.rateOutputPerMillion
      },
      calculatedCosts: costDetails
    });
    return costDetails;
  }

  protected async buildLLMResponse(
    content: string,
    model: string,
    usage?: TokenUsage,
    metadata?: Record<string, any>,
    finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter',
    toolCalls?: any[]
  ): Promise<LLMResponse> {
    console.log('[BaseAdapter Cost Debug] buildLLMResponse called:', {
      provider: this.name,
      model,
      hasUsage: !!usage,
      usage: usage
    });

    const response: LLMResponse = {
      text: content,
      model,
      provider: this.name,
      usage: usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      metadata: metadata || {},
      finishReason: finishReason || 'stop',
      toolCalls: toolCalls || []
    };

    // Extract webSearchResults from metadata if present
    if (metadata?.webSearchResults) {
      response.webSearchResults = metadata.webSearchResults;
    }

    // Calculate cost if usage is available
    if (usage) {
      console.log('[BaseAdapter Cost Debug] Attempting to calculate cost for usage:', usage);
      const cost = await this.calculateCost(usage, model);
      if (cost) {
        console.log('[BaseAdapter Cost Debug] Cost calculated successfully:', cost);
        response.cost = cost;
      } else {
        console.warn('[BaseAdapter Cost Debug] calculateCost returned null');
      }
    } else {
      console.warn('[BaseAdapter Cost Debug] No usage data provided, skipping cost calculation');
    }

    console.log('[BaseAdapter Cost Debug] Final response:', {
      hasCost: !!response.cost,
      cost: response.cost
    });

    return response;
  }

  // Rate limiting and retry logic
  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
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