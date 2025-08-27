/**
 * OpenAI Adapter - Clean implementation focused on streaming
 * Supports both regular chat completions and deep research models
 */

import OpenAI from 'openai';
import { BaseAdapter } from '../BaseAdapter';
import { 
  GenerateOptions, 
  StreamChunk, 
  LLMResponse, 
  ModelInfo, 
  ProviderCapabilities,
  ModelPricing 
} from '../types';
import { ModelRegistry } from '../ModelRegistry';
import { DeepResearchHandler } from './DeepResearchHandler';

export class OpenAIAdapter extends BaseAdapter {
  readonly name = 'openai';
  readonly baseUrl = 'https://api.openai.com/v1';
  
  private client: OpenAI;
  private deepResearch: DeepResearchHandler;

  constructor(apiKey: string) {
    super(apiKey, 'gpt-5');
    
    this.client = new OpenAI({
      apiKey: this.apiKey,
      dangerouslyAllowBrowser: true, // Required for Obsidian plugin environment
    });
    
    this.deepResearch = new DeepResearchHandler(this.client);
    this.initializeCache();
  }

  /**
   * Generate response without caching
   */
  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    try {
      const model = options?.model || this.currentModel;
      
      // Route deep research models to specialized handler
      if (this.deepResearch.isDeepResearchModel(model)) {
        return await this.deepResearch.generate(prompt, options);
      }
      
      // Use Chat Completions API for standard models
      return await this.generateWithChatCompletions(prompt, options);
    } catch (error) {
      throw this.handleError(error, 'generation');
    }
  }

  /**
   * Generate streaming response using async generator
   */
  async* generateStreamAsync(prompt: string, options?: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const model = options?.model || this.currentModel;
      
      console.log(`[OpenAIAdapter] Starting streaming for model: ${model}`);

      // Deep research models cannot be used in streaming chat
      if (this.deepResearch.isDeepResearchModel(model)) {
        throw new Error(`Deep research models (${model}) cannot be used in streaming chat. Please select a different model for real-time conversations.`);
      }

      // Build streaming parameters
      const streamParams: any = {
        model,
        messages: this.buildMessages(prompt, options?.systemPrompt),
        stream: true
      };

      // Add optional parameters
      if (options?.temperature !== undefined) streamParams.temperature = options.temperature;
      if (options?.maxTokens !== undefined) streamParams.max_tokens = options.maxTokens;
      if (options?.jsonMode) streamParams.response_format = { type: 'json_object' };
      if (options?.stopSequences) streamParams.stop = options.stopSequences;
      if (options?.tools) streamParams.tools = options.tools;
      if (options?.topP !== undefined) streamParams.top_p = options.topP;
      if (options?.frequencyPenalty !== undefined) streamParams.frequency_penalty = options.frequencyPenalty;
      if (options?.presencePenalty !== undefined) streamParams.presence_penalty = options.presencePenalty;

      console.log(`[OpenAIAdapter] Creating stream with params:`, { ...streamParams, messages: '[hidden]' });
      
      // Create OpenAI stream  
      const stream = await this.client.chat.completions.create(streamParams) as any;

      let tokenCount = 0;
      let usage: any = undefined;
      let finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 'stop';

      // Stream tokens as they arrive
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        
        if (delta) {
          tokenCount++;
          console.log(`[OpenAIAdapter] Token ${tokenCount}: "${delta}"`);
          
          // Yield each token immediately
          yield { 
            content: delta, 
            complete: false
          };
        }
        
        // Capture usage info when available
        if (chunk.usage) {
          usage = chunk.usage;
        }

        // Capture finish reason
        if (chunk.choices[0]?.finish_reason) {
          const reason = chunk.choices[0].finish_reason;
          if (reason === 'stop' || reason === 'length' || reason === 'tool_calls' || reason === 'content_filter') {
            finishReason = reason;
          }
        }
      }

      console.log(`[OpenAIAdapter] Streaming complete! Total tokens: ${tokenCount}`);
      
      // Yield final completion with usage info
      const extractedUsage = this.extractUsage({ usage });
      yield { 
        content: '', 
        complete: true, 
        usage: extractedUsage 
      };

    } catch (error) {
      console.error('[OpenAIAdapter] Streaming error:', error);
      throw this.handleError(error, 'streaming generation');
    }
  }

  /**
   * Generate using standard chat completions
   */
  private async generateWithChatCompletions(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const model = options?.model || this.currentModel;
    
    const chatParams: any = {
      model,
      messages: this.buildMessages(prompt, options?.systemPrompt)
    };

    // Add optional parameters
    if (options?.temperature !== undefined) chatParams.temperature = options.temperature;
    if (options?.maxTokens !== undefined) chatParams.max_tokens = options.maxTokens;
    if (options?.jsonMode) chatParams.response_format = { type: 'json_object' };
    if (options?.stopSequences) chatParams.stop = options.stopSequences;
    if (options?.tools) chatParams.tools = options.tools;
    if (options?.topP !== undefined) chatParams.top_p = options.topP;
    if (options?.frequencyPenalty !== undefined) chatParams.frequency_penalty = options.frequencyPenalty;
    if (options?.presencePenalty !== undefined) chatParams.presence_penalty = options.presencePenalty;

    const response = await this.client.chat.completions.create(chatParams);
    
    const text = response.choices[0]?.message?.content || '';
    const usage = this.extractUsage({ usage: response.usage });
    const finishReason = response.choices[0]?.finish_reason || 'stop';

    return this.buildLLMResponse(
      text,
      model,
      usage,
      undefined,
      finishReason as any
    );
  }

  /**
   * List available models
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      // Use centralized model registry instead of API call
      const openaiModels = ModelRegistry.getProviderModels('openai');
      return openaiModels.map(model => ModelRegistry.toModelInfo(model));
    } catch (error) {
      this.handleError(error, 'listing models');
      return [];
    }
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsThinking: true,
      supportsImageGeneration: true,
      maxContextWindow: 2000000, // GPT-5 context window
      supportedFeatures: [
        'streaming',
        'json_mode',
        'function_calling',
        'image_input',
        'image_generation',
        'thinking_models',
        'deep_research'
      ]
    };
  }

  /**
   * Get model pricing
   */
  async getModelPricing(modelId: string): Promise<ModelPricing | null> {
    try {
      const models = ModelRegistry.getProviderModels('openai');
      const model = models.find(m => m.id === modelId);
      if (!model) {
        return null;
      }

      return {
        rateInputPerMillion: model.pricing.inputPerMillion,
        rateOutputPerMillion: model.pricing.outputPerMillion,
        currency: model.pricing.currency
      };
    } catch (error) {
      console.warn(`Failed to get pricing for model ${modelId}:`, error);
      return null;
    }
  }
}