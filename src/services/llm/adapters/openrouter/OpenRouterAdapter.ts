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
import { MCPFunctionBridge } from '../../../mcp-bridge/core/MCPFunctionBridge';
import { ToolCallRequest, ToolCallResult } from '../../../mcp-bridge/types/BridgeTypes';

export class OpenRouterAdapter extends BaseAdapter {
  readonly name = 'openrouter';
  readonly baseUrl = 'https://openrouter.ai/api/v1';
  
  private mcpBridge: MCPFunctionBridge | null = null;

  constructor(apiKey: string, model?: string) {
    super(apiKey, model || 'anthropic/claude-3.5-sonnet');
    this.initializeCache();
    
    // Initialize MCP bridge for tool calling
    this.initializeMCPBridge();
  }

  /**
   * Generate response without caching
   */
  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    try {
      const model = options?.model || this.currentModel;
      
      // Check if MCP bridge is available and tools should be used
      const enableTools = (options as any)?.enableTools !== false; // Default to true
      
      if (this.mcpBridge && enableTools && this.mcpBridge.isInitialized()) {
        console.log('[OpenRouter Bridge] Using MCP bridge for tool-enabled generation');
        return await this.generateWithMCPTools(prompt, options);
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
   * Initialize MCP bridge for tool calling
   */
  private initializeMCPBridge(): void {
    try {
      this.mcpBridge = new MCPFunctionBridge();
      console.log('[OpenRouter Bridge] MCP bridge initialized successfully');
    } catch (error) {
      console.error('[OpenRouter Bridge] Failed to initialize MCP bridge:', error);
    }
  }

  /**
   * Initialize MCP bridge and connect to server
   */
  async configureMCPServer(serverUrl?: string): Promise<void> {
    if (!this.mcpBridge) {
      console.warn('[OpenRouterAdapter] Cannot configure MCP - bridge not initialized');
      return;
    }

    try {
      // Update server URL if provided
      if (serverUrl) {
        this.mcpBridge.updateConfiguration({
          mcpServer: { 
            url: serverUrl,
            timeout: 30000,
            retries: 2,
            healthCheckInterval: 60000
          }
        });
      }

      await this.mcpBridge.initialize();
      console.log(`[OpenRouterAdapter] MCP bridge connected successfully`);
    } catch (error) {
      console.error('[OpenRouterAdapter] Failed to configure MCP bridge:', error);
    }
  }

  /**
   * Check if MCP bridge is available and healthy
   */
  supportsMCP(): boolean {
    return this.mcpBridge !== null && this.mcpBridge.isInitialized() && this.mcpBridge.isHealthy();
  }

  /**
   * Get MCP bridge configuration
   */
  getMCPConfig(): { serverUrl: string } | null {
    if (!this.mcpBridge) return null;
    const config = this.mcpBridge.getConfiguration();
    return { serverUrl: config.mcpServer.url };
  }

  /**
   * Generate response using MCP bridge for tool calling
   */
  private async generateWithMCPTools(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    if (!this.mcpBridge) {
      throw new Error('MCP bridge not available');
    }

    const model = options?.model || this.currentModel;
    const messages = this.buildMessages(prompt, options?.systemPrompt);
    
    try {
      // Get available tools from MCP bridge (using openrouter provider)
      const mcpTools = await this.mcpBridge.getToolsForProvider('openrouter');
      
      console.log(`[OpenRouter Bridge] Using ${mcpTools.length} tools for generation`);

      // Build OpenRouter request with tools (same format as OpenAI)
      const requestBody = {
        model,
        messages,
        tools: mcpTools.map(t => t.tool), // Extract OpenAI-compatible tool format
        tool_choice: 'auto', // Let the model decide when to use tools
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        frequency_penalty: options?.frequencyPenalty,
        presence_penalty: options?.presencePenalty,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        stop: options?.stopSequences
      };

      // Call OpenRouter API
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
      const choice = data.choices[0];

      if (!choice) {
        throw new Error('No response from OpenRouter');
      }

      let finalText = choice.message?.content || '';
      const usage = this.extractUsage(data);
      let finishReason = choice.finish_reason || 'stop';
      const toolCalls: any[] = [];

      // Handle tool calls if present
      if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
        console.log(`[OpenRouter Bridge] Processing ${choice.message.tool_calls.length} tool calls`);

        // Convert OpenRouter tool calls to bridge format (same as OpenAI)
        const bridgeToolCalls: ToolCallRequest[] = choice.message.tool_calls.map((toolCall: any) => ({
          id: toolCall.id,
          name: toolCall.function.name,
          parameters: JSON.parse(toolCall.function.arguments || '{}'),
          provider: 'openrouter' as const,
          metadata: {
            timestamp: new Date().toISOString()
          }
        }));

        // Execute tool calls via bridge
        const toolResults = await this.mcpBridge.executeToolCalls(bridgeToolCalls);

        // Format tool results for OpenRouter continuation
        const toolMessages = toolResults.map(result => ({
          role: 'tool' as const,
          tool_call_id: result.id,
          content: result.success 
            ? JSON.stringify(result.result)
            : `Error: ${result.error}`
        }));

        // Continue conversation with tool results
        const continuationMessages = [
          ...messages,
          choice.message, // Include the assistant message with tool calls
          ...toolMessages
        ];

        const continuationResponse = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            ...this.buildHeaders(),
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://synaptic-lab-kit.com',
            'X-Title': 'Synaptic Lab Kit'
          },
          body: JSON.stringify({
            ...requestBody,
            messages: continuationMessages,
            tools: undefined, // Remove tools for continuation
            tool_choice: undefined
          })
        });

        if (continuationResponse.ok) {
          const continuationData = await continuationResponse.json();
          const continuationChoice = continuationData.choices[0];
          
          if (continuationChoice?.message?.content) {
            finalText = continuationChoice.message.content;
            finishReason = continuationChoice.finish_reason || 'stop';
          }
        }

        // Add tool execution info to response metadata
        toolCalls.push(...toolResults.map(result => ({
          id: result.id,
          name: result.name,
          parameters: result.result,
          success: result.success,
          error: result.error,
          executionTime: result.executionTime
        })));
      }

      return this.buildLLMResponse(
        finalText,
        model,
        usage,
        {
          mcpEnabled: true,
          toolCallCount: toolCalls.length,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined
        },
        finishReason as any
      );

    } catch (error) {
      console.error('[OpenRouter Bridge] Tool-enabled generation failed:', error);
      throw error;
    }
  }

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