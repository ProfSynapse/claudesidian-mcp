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
    const model = options?.model || this.currentModel;
    const messages = this.buildMessages(prompt, options?.systemPrompt);
    
    const TOOL_ITERATION_THRESHOLD = 15;
    let totalToolIterations = 0;
    
    // Initial request with pre-converted tools
    const requestBody = {
      model,
      messages,
      tools: options?.tools, // Use pre-converted tools from ChatService
      tool_choice: 'auto',
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      frequency_penalty: options?.frequencyPenalty,
      presence_penalty: options?.presencePenalty,
      response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
      stop: options?.stopSequences
    };

    // Initial API call
    let response = await fetch(`${this.baseUrl}/chat/completions`, {
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

    let data = await response.json();
    let choice = data.choices[0];

    if (!choice) {
      throw new Error('No response from OpenRouter');
    }

    let finalText = choice.message?.content || '';
    const usage = this.extractUsage(data);
    let finishReason = choice.finish_reason || 'stop';
    let conversationMessages = [...messages];

    // Implement iterative tool execution with user confirmation system
    while (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      totalToolIterations++;
      
      console.log(`[OpenRouter Tool Safety] Tool iteration ${totalToolIterations}/${TOOL_ITERATION_THRESHOLD}`);
      
      // Check if we've hit the threshold
      if (totalToolIterations >= TOOL_ITERATION_THRESHOLD) {
        console.log(`[OpenRouter Tool Safety] Hit ${TOOL_ITERATION_THRESHOLD} tool iteration threshold - activating dead switch`);
        
        // Create dead switch response for the LLM
        const deadSwitchMessage = {
          role: 'system' as const,
          content: `TOOL_LIMIT_REACHED: You have used ${TOOL_ITERATION_THRESHOLD} tool iterations. You must now ask the user if they want to continue with more tool calls. Explain what you've accomplished so far and what you still need to do. Wait for user confirmation before proceeding further.`
        };
        
        // Get final response with dead switch message
        const deadSwitchMessages = [
          ...conversationMessages,
          choice.message,
          deadSwitchMessage
        ];
        
        const deadSwitchResponse = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            ...this.buildHeaders(),
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://synaptic-lab-kit.com',
            'X-Title': 'Synaptic Lab Kit'
          },
          body: JSON.stringify({
            model,
            messages: deadSwitchMessages,
            // Remove tools to force user interaction
            temperature: options?.temperature,
            max_tokens: options?.maxTokens
          })
        });
        
        if (deadSwitchResponse.ok) {
          const deadSwitchData = await deadSwitchResponse.json();
          const deadSwitchChoice = deadSwitchData.choices[0];
          if (deadSwitchChoice?.message?.content) {
            finalText = deadSwitchChoice.message.content;
            finishReason = 'stop';
            console.log(`[OpenRouter Tool Safety] Dead switch activated - awaiting user confirmation`);
          }
        }
        break;
      }
      
      // Execute current tool calls
      console.log(`[OpenRouter Adapter] Processing ${choice.message.tool_calls.length} tool calls (iteration ${totalToolIterations})`);
      
      try {
        // Convert OpenRouter tool calls to MCPToolCall format  
        const mcpToolCalls = choice.message.tool_calls.map((tc: any) => ({
          id: tc.id,
          function: {
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || '{}'
          }
        }));

        // Execute tool calls via shared utility
        const toolResults = await MCPToolExecution.executeToolCalls(this, mcpToolCalls, 'openrouter');

        // Format tool results for OpenRouter continuation
        const toolMessages = MCPToolExecution.buildToolMessages(toolResults);

        // Update conversation with tool call and results
        conversationMessages = [
          ...conversationMessages,
          choice.message,
          ...toolMessages
        ];

        console.log(`[OpenRouter Adapter] Continuing conversation with ${toolResults.length} tool results`);

        // Make continuation request with tools still available
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
            messages: conversationMessages,
            tools: options?.tools, // Keep tools available
            tool_choice: 'auto'
          })
        });

        if (!continuationResponse.ok) {
          throw new Error(`HTTP ${continuationResponse.status}: ${continuationResponse.statusText}`);
        }

        // Update for next iteration
        data = await continuationResponse.json();
        choice = data.choices[0];
        
        if (choice?.message?.content) {
          finalText = choice.message.content;
          finishReason = choice.finish_reason || 'stop';
        }

      } catch (error) {
        console.error('[OpenRouter Adapter] Tool execution failed:', error);
        const toolNames = (choice.message.tool_calls || []).map((tc: any) => tc.function?.name).join(', ');
        finalText = `I tried to use tools (${toolNames}) but encountered an error: ${error instanceof Error ? error.message : String(error)}`;
        break;
      }
    }
    
    console.log(`[OpenRouter Tool Safety] Tool execution completed after ${totalToolIterations} iterations`);

    return this.buildLLMResponse(
      finalText,
      model,
      usage,
      MCPToolExecution.buildToolMetadata([]),
      finishReason as any
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