/**
 * OpenRouter Adapter - Clean implementation with centralized SSE streaming
 * Supports 400+ models through OpenRouter's unified API
 * Uses BaseAdapter's processSSEStream for reliable streaming
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
  }

  /**
   * Generate response without caching
   */
  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    try {
      const model = options?.model || this.currentModel;
      
      // Handle post-stream tool execution: if detectedToolCalls are provided, execute only tools
      if (options?.detectedToolCalls && options.detectedToolCalls.length > 0) {
        console.log('[OpenRouter Adapter] Post-stream tool execution', {
          detectedToolCalls: options.detectedToolCalls.length,
          onToolEvent: !!options?.onToolEvent
        });
        return await this.executeDetectedToolCalls(options.detectedToolCalls, model, prompt, options);
      }
      
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
   * Generate streaming response using centralized SSE processing
   */
  async* generateStreamAsync(prompt: string, options?: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const model = options?.model || this.currentModel;
      
      const requestBody = {
        model,
        messages: options?.conversationHistory || this.buildMessages(prompt, options?.systemPrompt),
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

      // Use centralized SSE streaming with OpenRouter-specific extraction
      yield* this.processSSEStream(response, {
        debugLabel: 'OpenRouter',
        accumulateToolCalls: true,
        toolCallThrottling: {
          initialYield: true,
          progressInterval: 50
        },

        extractContent: (parsed: any) => {
          // Process all available choices - reasoning models may use multiple choices
          // Choice 0 might be reasoning, Choice 1 might be actual response
          for (const choice of parsed.choices || []) {
            const delta = choice?.delta;
            const content = delta?.content || delta?.text || choice?.text;
            if (content) {
              return content;
            }
          }
          return null;
        },

        extractToolCalls: (parsed: any) => {
          // Extract tool calls from any choice that has them
          for (const choice of parsed.choices || []) {
            const toolCalls = choice?.delta?.tool_calls;
            if (toolCalls) {
              return toolCalls;
            }
          }
          return null;
        },

        extractFinishReason: (parsed: any) => {
          // Extract finish reason from any choice
          for (const choice of parsed.choices || []) {
            if (choice?.finish_reason) {
              return choice.finish_reason;
            }
          }
          return null;
        },

        extractUsage: (parsed: any) => {
          return parsed.usage || null;
        },

        onParseError: (error: Error, rawData: string) => {
          // Failed to parse SSE data
        }
      });

    } catch (error) {
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

  /**
   * Execute detected tool calls from streaming and get AI response
   * Used for post-stream tool execution - implements pingpong pattern
   */
  private async executeDetectedToolCalls(detectedToolCalls: any[], model: string, prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    console.log('[OpenRouter Adapter] Executing detected tool calls:', {
      toolCount: detectedToolCalls.length,
      onToolEvent: !!options?.onToolEvent
    });

    try {
      // Convert to MCP format
      const mcpToolCalls: any[] = detectedToolCalls.map((tc: any) => ({
        id: tc.id,
        function: {
          name: tc.function?.name || tc.name,
          arguments: tc.function?.arguments || JSON.stringify(tc.parameters || {})
        }
      }));

      // Execute tool calls directly using MCPToolExecution
      const toolResults = await MCPToolExecution.executeToolCalls(
        this, 
        mcpToolCalls, 
        'openrouter',
        options?.onToolEvent
      );

      console.log('[OpenRouter Adapter] Tool execution completed:', {
        resultsCount: toolResults.length,
        successCount: toolResults.filter(r => r.success).length
      });

      // Now do the "pingpong" - send the conversation with tool results back to the LLM
      const messages = this.buildMessages(prompt, options?.systemPrompt);
      
      // Add the assistant message with tool calls
      messages.push({
        role: 'assistant' as const,
        content: '', // Empty content since this was a tool call
        tool_calls: detectedToolCalls
      });

      // Add tool result messages
      const toolMessages = MCPToolExecution.buildToolMessages(toolResults);
      messages.push(...toolMessages);

      console.log('[OpenRouter Adapter] Sending conversation with tool results back to LLM for final response');

      // Make API call to get AI's response to the tool results  
      const requestBody = {
        model,
        messages,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        frequency_penalty: options?.frequencyPenalty,
        presence_penalty: options?.presencePenalty,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        stop: options?.stopSequences
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
      const choice = data.choices[0];
      const finalContent = choice?.message?.content || 'No response from AI after tool execution';
      const usage = this.extractUsage(data);

      console.log('[OpenRouter Adapter] Got AI response to tool results:', {
        contentLength: finalContent.length,
        finishReason: choice?.finish_reason
      });

      // Combine original tool calls with their execution results
      const completeToolCalls = detectedToolCalls.map(originalCall => {
        const result = toolResults.find(r => r.id === originalCall.id);
        return {
          id: originalCall.id,
          name: originalCall.function?.name || originalCall.name,
          parameters: JSON.parse(originalCall.function?.arguments || '{}'),
          result: result?.result,
          success: result?.success || false,
          error: result?.error,
          executionTime: result?.executionTime
        };
      });

      // Return LLMResponse with AI's natural language response to tool results
      return this.buildLLMResponse(
        finalContent,
        model,
        usage,
        MCPToolExecution.buildToolMetadata(toolResults),
        choice?.finish_reason || 'stop',
        completeToolCalls
      );

    } catch (error) {
      console.error('[OpenRouter Adapter] Post-stream tool execution failed:', error);
      throw this.handleError(error, 'post-stream tool execution');
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