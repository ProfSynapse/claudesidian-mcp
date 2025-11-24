/**
 * LM Studio Adapter
 * Provides local LLM models via LM Studio's OpenAI-compatible API
 * Supports model auto-discovery, streaming, and function calling
 */

import { requestUrl } from 'obsidian';
import { BaseAdapter } from '../BaseAdapter';
import {
  GenerateOptions,
  StreamChunk,
  LLMResponse,
  ModelInfo,
  ProviderCapabilities,
  ModelPricing,
  TokenUsage,
  LLMProviderError
} from '../types';

export class LMStudioAdapter extends BaseAdapter {
  readonly name = 'lmstudio';
  readonly baseUrl: string;

  private serverUrl: string;
  mcpConnector?: any; // For tool execution support

  constructor(serverUrl: string, mcpConnector?: any) {
    // LM Studio doesn't need an API key - set requiresApiKey to false
    super('', '', serverUrl, false);

    this.serverUrl = serverUrl;
    this.baseUrl = serverUrl;
    this.mcpConnector = mcpConnector; // Store for MCPToolExecution

    this.initializeCache();
  }

  /**
   * Generate response without caching using OpenAI-compatible chat completions API
   * Uses Obsidian's requestUrl to bypass CORS
   */
  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    try {
      const model = options?.model || this.currentModel;

      const requestBody: any = {
        model: model,
        messages: this.buildMessages(prompt, options?.systemPrompt),
        stream: false,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        frequency_penalty: options?.frequencyPenalty,
        presence_penalty: options?.presencePenalty,
        stop: options?.stopSequences
      };

      // Add tools if provided (function calling support)
      if (options?.tools && options.tools.length > 0) {
        requestBody.tools = this.convertTools(options.tools);
      }

      // Add JSON mode if requested
      if (options?.jsonMode) {
        requestBody.response_format = { type: 'json_object' };
      }

      // Remove undefined values
      Object.keys(requestBody).forEach(key => {
        if (requestBody[key] === undefined) {
          delete requestBody[key];
        }
      });

      // Use Obsidian's requestUrl to bypass CORS
      const response = await requestUrl({
        url: `${this.serverUrl}/v1/chat/completions`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (response.status !== 200) {
        const errorText = response.text || 'Unknown error';
        throw new LLMProviderError(
          `LM Studio API error: ${response.status} - ${errorText}`,
          'generation',
          'API_ERROR'
        );
      }

      const data = response.json;

      if (!data.choices || !data.choices[0]) {
        throw new LLMProviderError(
          'Invalid response format from LM Studio API: missing choices',
          'generation',
          'INVALID_RESPONSE'
        );
      }

      const choice = data.choices[0];
      const content = choice.message?.content || '';
      const toolCalls = choice.message?.tool_calls || [];

      // Extract usage information
      const usage: TokenUsage = {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      };

      const finishReason = this.mapFinishReason(choice.finish_reason);
      const metadata = {
        cached: false,
        model: data.model,
        id: data.id,
        created: data.created
      };

      return await this.buildLLMResponse(
        content,
        model,
        usage,
        metadata,
        finishReason,
        toolCalls
      );
    } catch (error) {
      if (error instanceof LLMProviderError) {
        throw error;
      }
      throw new LLMProviderError(
        `LM Studio generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'generation',
        'NETWORK_ERROR'
      );
    }
  }

  /**
   * Generate streaming response using async generator
   * Falls back to non-streaming if CORS is blocked
   */
  async* generateStreamAsync(prompt: string, options?: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const model = options?.model || this.currentModel;

      const requestBody: any = {
        model: model,
        messages: this.buildMessages(prompt, options?.systemPrompt),
        stream: true,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        frequency_penalty: options?.frequencyPenalty,
        presence_penalty: options?.presencePenalty,
        stop: options?.stopSequences
      };

      // Add tools if provided (function calling support)
      if (options?.tools && options.tools.length > 0) {
        requestBody.tools = this.convertTools(options.tools);
      }

      // Add JSON mode if requested
      if (options?.jsonMode) {
        requestBody.response_format = { type: 'json_object' };
      }

      // Remove undefined values
      Object.keys(requestBody).forEach(key => {
        if (requestBody[key] === undefined) {
          delete requestBody[key];
        }
      });

      const response = await fetch(`${this.serverUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new LLMProviderError(
          `LM Studio API error: ${response.status} ${response.statusText} - ${errorText}`,
          'streaming',
          'API_ERROR'
        );
      }

      // Process SSE stream using BaseAdapter's processSSEStream
      yield* this.processSSEStream(response, {
        debugLabel: 'LM Studio',
        extractContent: (parsed) => parsed.choices?.[0]?.delta?.content || null,
        extractToolCalls: (parsed) => parsed.choices?.[0]?.delta?.tool_calls || null,
        extractFinishReason: (parsed) => parsed.choices?.[0]?.finish_reason || null,
        extractUsage: (parsed) => parsed.usage,
        accumulateToolCalls: true,
        toolCallThrottling: {
          initialYield: true,
          progressInterval: 50
        }
      });

    } catch (error) {
      console.error('[LMStudioAdapter] Streaming error:', error);

      // Check if it's a CORS error - fall back to non-streaming
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.warn('[LMStudioAdapter] CORS blocked - falling back to non-streaming mode');
        console.warn('[LMStudioAdapter] To enable streaming, configure LM Studio to allow CORS from app://obsidian.md');

        // Fall back to non-streaming
        const result = await this.generateUncached(prompt, options);
        yield {
          content: result.text || '',
          complete: true,
          usage: result.usage,
          metadata: result.metadata
        };
        return;
      }

      if (error instanceof LLMProviderError) {
        throw error;
      }
      throw new LLMProviderError(
        `LM Studio streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'streaming',
        'NETWORK_ERROR'
      );
    }
  }

  /**
   * List available models by querying LM Studio's /v1/models endpoint
   * Discovers loaded models dynamically
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      // Use Obsidian's requestUrl to bypass CORS
      const response = await requestUrl({
        url: `${this.serverUrl}/v1/models`,
        method: 'GET'
      });

      if (response.status !== 200) {
        console.warn(`Failed to fetch models from LM Studio: ${response.status}`);
        return [];
      }

      const data = response.json;

      if (!data.data || !Array.isArray(data.data)) {
        console.warn('Invalid models response format from LM Studio');
        return [];
      }

      return data.data.map((model: any) => {
        const modelId = model.id;
        const isVisionModel = this.detectVisionSupport(modelId);
        const supportsTools = this.detectToolSupport(modelId);

        return {
          id: modelId,
          name: modelId,
          contextWindow: model.context_length || 4096,
          maxOutputTokens: model.max_tokens || 2048,
          supportsJSON: true, // Most models support JSON mode
          supportsImages: isVisionModel,
          supportsFunctions: supportsTools,
          supportsStreaming: true,
          supportsThinking: false,
          pricing: {
            inputPerMillion: 0, // Local models are free
            outputPerMillion: 0,
            currency: 'USD',
            lastUpdated: new Date().toISOString()
          }
        };
      });
    } catch (error) {
      console.error('Error listing LM Studio models:', error);
      return [];
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsJSON: true, // Most models support JSON mode
      supportsImages: false, // Depends on specific model
      supportsFunctions: true, // Many models support function calling via OpenAI-compatible API
      supportsThinking: false,
      maxContextWindow: 128000, // Varies by model, reasonable default
      supportedFeatures: ['streaming', 'function_calling', 'json_mode', 'local', 'privacy']
    };
  }

  async getModelPricing(modelId: string): Promise<ModelPricing | null> {
    // Local models are free - zero rates
    const pricing: ModelPricing = {
      rateInputPerMillion: 0,
      rateOutputPerMillion: 0,
      currency: 'USD'
    };

    return pricing;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await requestUrl({
        url: `${this.serverUrl}/v1/models`,
        method: 'GET'
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Convert tools from Chat Completions format to ensure compatibility
   * Handles both flat and nested tool formats
   */
  private convertTools(tools: any[]): any[] {
    return tools.map((tool: any) => {
      // If already in flat format {type, name, description, parameters}, return as-is
      if (tool.name && !tool.function) {
        return tool;
      }

      // If in nested format {type, function: {name, description, parameters}}, flatten it
      if (tool.function) {
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
   * Detect if a model supports vision based on name patterns
   */
  private detectVisionSupport(modelId: string): boolean {
    const visionKeywords = ['vision', 'llava', 'bakllava', 'cogvlm', 'yi-vl', 'moondream'];
    const lowerModelId = modelId.toLowerCase();
    return visionKeywords.some(keyword => lowerModelId.includes(keyword));
  }

  /**
   * Detect if a model supports tool/function calling based on name patterns
   * Many newer models support function calling
   */
  private detectToolSupport(modelId: string): boolean {
    const toolSupportedKeywords = [
      'gpt', 'mistral', 'mixtral', 'hermes', 'nous', 'qwen',
      'deepseek', 'dolphin', 'functionary', 'gorilla'
    ];
    const lowerModelId = modelId.toLowerCase();
    return toolSupportedKeywords.some(keyword => lowerModelId.includes(keyword));
  }

  /**
   * Map OpenAI finish reasons to our standard types
   */
  private mapFinishReason(reason: string | undefined): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    if (!reason) return 'stop';

    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
      case 'max_tokens':
        return 'length';
      case 'tool_calls':
      case 'function_call':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
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

    let message = `LM Studio ${operation} failed`;
    let code = 'UNKNOWN_ERROR';

    if (error?.message) {
      message += `: ${error.message}`;
    }

    if (error?.code === 'ECONNREFUSED') {
      message = 'Cannot connect to LM Studio server. Make sure LM Studio is running and the server is started.';
      code = 'CONNECTION_REFUSED';
    } else if (error?.code === 'ENOTFOUND') {
      message = 'LM Studio server not found. Check the URL configuration.';
      code = 'SERVER_NOT_FOUND';
    }

    throw new LLMProviderError(message, this.name, code, error);
  }
}
