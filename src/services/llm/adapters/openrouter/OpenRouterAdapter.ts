/**
 * OpenRouter Adapter - Clean implementation with SSE streaming
 * Supports 400+ models through OpenRouter's unified API
 * Based on OpenRouter streaming documentation
 */

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
import { MCPToolExecution, MCPCapableAdapter } from '../shared/MCPToolExecution';

export class OpenRouterAdapter extends BaseAdapter implements MCPCapableAdapter {
  readonly name = 'openrouter';
  readonly baseUrl = 'https://openrouter.ai/api/v1';
  
  mcpConnector?: any;

  constructor(apiKey: string, mcpConnector?: any) {
    super(apiKey, 'anthropic/claude-3.5-sonnet');
    this.mcpConnector = mcpConnector;
    this.initializeCache();
    
    // MCP connector will be provided via constructor
  }

  /**
   * Generate response without caching
   */
  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    try {
      const model = options?.model || this.currentModel;
      
      // If tools are provided (pre-converted by ChatService), use tool-enabled generation
      if (options?.tools && options.tools.length > 0) {
        console.log('[OpenRouter Adapter] Using tool-enabled generation', {
          toolCount: options.tools.length
        });
        return await this.generateWithProvidedTools(prompt, options);
      }
      
      const requestBody = {
        model,
        messages: this.buildMessages(prompt, options?.systemPrompt),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        frequency_penalty: options?.frequencyPenalty,
        presence_penalty: options?.presencePenalty,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        stop: options?.stopSequences,
        tools: options?.tools
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.buildHeaders(),
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://synaptic-lab-kit.com',
          'X-Title': 'Synaptic Lab Kit'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      const text = data.choices[0]?.message?.content || '';
      const usage = this.extractUsage(data);
      const finishReason = data.choices[0]?.finish_reason || 'stop';

      return this.buildLLMResponse(
        text,
        model,
        usage,
        undefined,
        finishReason as any
      );
    } catch (error) {
      throw this.handleError(error, 'generation');
    }
  }

  /**
   * Generate streaming response using OpenRouter's SSE format
   */
  async* generateStreamAsync(prompt: string, options?: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const model = options?.model || this.currentModel;
      
      const requestBody = {
        model,
        messages: this.buildMessages(prompt, options?.systemPrompt),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        frequency_penalty: options?.frequencyPenalty,
        presence_penalty: options?.presencePenalty,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        stop: options?.stopSequences,
        tools: options?.tools,
        stream: true // Enable streaming
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.buildHeaders(),
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://synaptic-lab-kit.com',
          'X-Title': 'Synaptic Lab Kit'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let tokenCount = 0;
      let usage: any = undefined;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Append new chunk to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete lines from buffer
          while (true) {
            const lineEnd = buffer.indexOf('\n');
            if (lineEnd === -1) break;

            const line = buffer.slice(0, lineEnd).trim();
            buffer = buffer.slice(lineEnd + 1);

            // Skip empty lines and comments (OpenRouter sends ": OPENROUTER PROCESSING")
            if (!line || line.startsWith(':')) continue;

            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                break;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices[0]?.delta;
                const content = delta?.content;
                
                if (content) {
                  tokenCount++;
                  
                  // Yield each token immediately
                  yield { 
                    content, 
                    complete: false
                  };
                }

                // Capture usage info when available
                if (parsed.usage) {
                  usage = parsed.usage;
                }
              } catch (parseError) {
                console.warn(`[OpenRouterAdapter] Failed to parse SSE data:`, parseError);
                // Continue processing other chunks
              }
            }
          }
        }

        // Yield final completion with usage info
        const extractedUsage = this.extractUsage({ usage });
        yield { 
          content: '', 
          complete: true, 
          usage: extractedUsage 
        };

      } finally {
        reader.cancel();
      }

    } catch (error) {
      console.error('[OpenRouterAdapter] Streaming error:', error);
      throw this.handleError(error, 'streaming generation');
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      // Use centralized model registry
      const openrouterModels = ModelRegistry.getProviderModels('openrouter');
      return openrouterModels.map(model => ModelRegistry.toModelInfo(model));
    } catch (error) {
      this.handleError(error, 'listing models');
      return [];
    }
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities {
    const baseCapabilities = {
      supportsStreaming: true,
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsThinking: false,
      maxContextWindow: 2000000, // Varies by model
      supportedFeatures: [
        'streaming',
        'json_mode',
        'function_calling',
        'image_input',
        '400+ models'
      ]
    };

    // Add MCP support if available
    if (this.supportsMCP()) {
      baseCapabilities.supportedFeatures.push('mcp_integration');
    }

    return baseCapabilities;
  }



  /**
   * Check if MCP is available via connector
   */
  supportsMCP(): boolean {
    return MCPToolExecution.supportsMCP(this);
  }


  /**
   * Generate with pre-converted tools (from ChatService) using iterative execution
   */
  private async generateWithProvidedTools(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    // Use centralized tool execution wrapper to eliminate code duplication
    const model = options?.model || this.currentModel;

    console.log('[OpenRouter Debug] generateWithProvidedTools called, onToolEvent callback:', !!options?.onToolEvent);
    
    return MCPToolExecution.executeWithToolSupport(
      this,
      'openrouter',
      {
        model,
        tools: options?.tools || [],
        prompt,
        systemPrompt: options?.systemPrompt,
        onToolEvent: options?.onToolEvent
      },
      {
        buildMessages: (prompt: string, systemPrompt?: string) => 
          this.buildMessages(prompt, systemPrompt),
        
        buildRequestBody: (messages: any[], isInitial: boolean) => ({
          model,
          messages,
          tools: options?.tools,
          tool_choice: 'auto',
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
          top_p: options?.topP,
          frequency_penalty: options?.frequencyPenalty,
          presence_penalty: options?.presencePenalty,
          response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
          stop: options?.stopSequences
        }),
        
        makeApiCall: async (requestBody: any) => {
          return await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              ...this.buildHeaders(),
              'Authorization': `Bearer ${this.apiKey}`,
              'HTTP-Referer': 'https://synaptic-lab-kit.com',
              'X-Title': 'Synaptic Lab Kit'
            },
            body: JSON.stringify(requestBody)
          });
        },
        
        extractResponse: async (response: Response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const data = await response.json();
          const choice = data.choices[0];
          
          return {
            content: choice?.message?.content || '',
            usage: this.extractUsage(data),
            finishReason: choice?.finish_reason || 'stop',
            toolCalls: choice?.message?.tool_calls,
            choice: choice
          };
        },
        
        buildLLMResponse: async (
          content: string,
          model: string,
          usage?: any,
          metadata?: any,
          finishReason?: any,
          toolCalls?: any[]
        ) => {
          return this.buildLLMResponse(content, model, usage, metadata, finishReason, toolCalls);
        }
      }
    );
  }

  // The basic OpenRouter generation logic is now handled by the main generateUncached method

  /**
   * Get model pricing
   */
  async getModelPricing(modelId: string): Promise<ModelPricing | null> {
    try {
      const models = ModelRegistry.getProviderModels('openrouter');
      const model = models.find(m => m.apiName === modelId);
      if (!model) {
        return null;
      }

      return {
        rateInputPerMillion: model.inputCostPerMillion,
        rateOutputPerMillion: model.outputCostPerMillion,
        currency: 'USD'
      };
    } catch (error) {
      console.warn(`Failed to get pricing for model ${modelId}:`, error);
      return null;
    }
  }
}