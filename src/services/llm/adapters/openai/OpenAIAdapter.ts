/**
 * OpenAI Adapter with Responses API support
 * Supports latest OpenAI features including the new Responses API
 * Based on 2025 API documentation
 */

import OpenAI from 'openai';
import { BaseAdapter } from '../BaseAdapter';
import { 
  GenerateOptions, 
  StreamOptions, 
  LLMResponse, 
  ModelInfo, 
  ProviderCapabilities,
  CostDetails 
} from '../types';
import { ModelRegistry } from '../ModelRegistry';

export class OpenAIAdapter extends BaseAdapter {
  readonly name = 'openai';
  readonly baseUrl = 'https://api.openai.com/v1';
  
  private client: OpenAI;

  constructor() {
    super('OPENAI_API_KEY', 'gpt-4o');
    
    this.client = new OpenAI({
      apiKey: this.apiKey,
      organization: process.env.OPENAI_ORG_ID,
      project: process.env.OPENAI_PROJECT_ID
    });
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    try {
      // Try Responses API first, fallback to Chat Completions
      try {
        const result = await this.generateWithResponsesAPI(prompt, options);
        return result;
      } catch (responsesError) {
        console.warn('Responses API failed, falling back to Chat Completions:', responsesError);
        const result = await this.generateWithChatCompletions(prompt, options);
        return result;
      }
    } catch (error) {
      throw this.handleError(error, 'generation');
    }
  }

  async generateStream(prompt: string, options?: StreamOptions): Promise<LLMResponse> {
    try {
      // Try Responses API streaming first, fallback to Chat Completions
      try {
        const result = await this.generateWithResponsesAPIStream(prompt, options);
        return result;
      } catch (responsesError) {
        console.warn('Responses API streaming failed, falling back to Chat Completions:', responsesError);
        
        const streamParams: any = {
          model: options?.model || this.currentModel,
          messages: this.buildMessages(prompt, options?.systemPrompt),
          stream: true
        };

        if (options?.temperature !== undefined) streamParams.temperature = options.temperature;
        if (options?.maxTokens !== undefined) streamParams.max_tokens = options.maxTokens;
        if (options?.jsonMode) streamParams.response_format = { type: 'json_object' };
        if (options?.stopSequences) streamParams.stop = options.stopSequences;
        if (options?.tools) streamParams.tools = options.tools;

        const stream = await this.client.chat.completions.create(streamParams);

        let fullText = '';
        let usage: any = undefined;
        let finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 'stop';

        for await (const chunk of stream as any) {
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            options?.onToken?.(delta);
          }
          
          if (chunk.usage) {
            usage = chunk.usage;
          }

          if (chunk.choices[0]?.finish_reason) {
            const reason = chunk.choices[0].finish_reason;
            if (reason === 'stop' || reason === 'length' || reason === 'tool_calls' || reason === 'content_filter') {
              finishReason = reason;
            }
          }
        }

        const extractedUsage = this.extractUsage({ usage });
        const response = await this.buildLLMResponse(
          fullText,
          this.currentModel,
          extractedUsage,
          undefined,
          finishReason
        );

        if (options?.onComplete) {
          options.onComplete(response);
        }
        return response;
      }
    } catch (error) {
      options?.onError?.(error as Error);
      throw this.handleError(error, 'streaming generation');
    }
  }

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

  // Private methods
  private async generateWithResponsesAPI(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const responseParams: any = {
      model: options?.model || this.currentModel,
      messages: this.buildMessages(prompt, options?.systemPrompt),
      // Include usage information in response
      include_usage: true
    };

    // Add response-specific parameters
    if (options?.temperature !== undefined) responseParams.temperature = options.temperature;
    if (options?.maxTokens !== undefined) responseParams.max_completion_tokens = options.maxTokens;
    if (options?.stopSequences) responseParams.stop = options.stopSequences;
    if (options?.tools) responseParams.tools = options.tools;
    
    // Response format for structured outputs
    if (options?.jsonMode) {
      responseParams.response_format = { type: 'json_object' };
    }

    // Use the new Responses API endpoint
    const response = await (this.client as any).responses.create(responseParams);

    const extractedUsage = this.extractUsage(response);
    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error('No response choice received from OpenAI Responses API');
    }
    
    const finishReason = choice.finish_reason;
    const mappedFinishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 
      finishReason === 'stop' || finishReason === 'length' || finishReason === 'tool_calls' || finishReason === 'content_filter' 
        ? finishReason 
        : 'stop';
    
    return await this.buildLLMResponse(
      choice.message?.content || '',
      response.model,
      extractedUsage,
      undefined,
      mappedFinishReason,
      choice.message?.tool_calls
    );
  }

  private async generateWithResponsesAPIStream(prompt: string, options?: StreamOptions): Promise<LLMResponse> {
    const streamParams: any = {
      model: options?.model || this.currentModel,
      messages: this.buildMessages(prompt, options?.systemPrompt),
      stream: true,
      // Include usage information in streaming response
      stream_options: { include_usage: true }
    };

    if (options?.temperature !== undefined) streamParams.temperature = options.temperature;
    if (options?.maxTokens !== undefined) streamParams.max_completion_tokens = options.maxTokens;
    if (options?.jsonMode) streamParams.response_format = { type: 'json_object' };
    if (options?.stopSequences) streamParams.stop = options.stopSequences;
    if (options?.tools) streamParams.tools = options.tools;

    // Use the new Responses API with streaming
    const stream = await (this.client as any).responses.create(streamParams);

    let fullText = '';
    let usage: any = undefined;
    let finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 'stop';

    for await (const chunk of stream as any) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullText += delta;
        options?.onToken?.(delta);
      }
      
      if (chunk.usage) {
        usage = chunk.usage;
      }

      if (chunk.choices[0]?.finish_reason) {
        const reason = chunk.choices[0].finish_reason;
        if (reason === 'stop' || reason === 'length' || reason === 'tool_calls' || reason === 'content_filter') {
          finishReason = reason;
        }
      }
    }

    const extractedUsage = this.extractUsage({ usage });
    const response = await this.buildLLMResponse(
      fullText,
      this.currentModel,
      extractedUsage,
      undefined,
      finishReason
    );

    if (options?.onComplete) {
      options.onComplete(response);
    }
    return response;
  }

  // Fallback to Chat Completions API if Responses API is not available
  private async generateWithChatCompletions(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const completionParams: any = {
      model: options?.model || this.currentModel,
      messages: this.buildMessages(prompt, options?.systemPrompt)
    };

    if (options?.temperature !== undefined) completionParams.temperature = options.temperature;
    if (options?.maxTokens !== undefined) completionParams.max_tokens = options.maxTokens;
    if (options?.jsonMode) completionParams.response_format = { type: 'json_object' };
    if (options?.stopSequences) completionParams.stop = options.stopSequences;
    if (options?.tools) completionParams.tools = options.tools;

    const response = await this.client.chat.completions.create(completionParams);

    const extractedUsage = this.extractUsage(response);
    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error('No response choice received from OpenAI');
    }
    
    const finishReason = choice.finish_reason;
    const mappedFinishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 
      finishReason === 'stop' || finishReason === 'length' || finishReason === 'tool_calls' || finishReason === 'content_filter' 
        ? finishReason 
        : 'stop';
    
    return await this.buildLLMResponse(
      choice.message?.content || '',
      response.model,
      extractedUsage,
      undefined,
      mappedFinishReason,
      choice.message?.tool_calls
    );
  }



  async getModelPricing(modelId: string): Promise<CostDetails | null> {
    // Use centralized model registry for pricing
    const modelSpec = ModelRegistry.findModel('openai', modelId);
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

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsThinking: true, // For reasoning models
      maxContextWindow: 200000, // Conservative estimate for GPT-4
      supportedFeatures: [
        'chat',
        'streaming',
        'json_mode',
        'function_calling',
        'vision',
        'reasoning',
        'responses_api'
      ]
    };
  }

}