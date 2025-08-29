/**
 * Mistral AI Adapter with true streaming support
 * Implements Mistral's native streaming using client.chat.stream()
 * Based on official Mistral TypeScript SDK documentation
 */

import { Mistral } from '@mistralai/mistralai';
import { BaseAdapter } from '../BaseAdapter';
import { 
  GenerateOptions, 
  StreamChunk, 
  LLMResponse, 
  ModelInfo, 
  ProviderCapabilities,
  ModelPricing
} from '../types';
import { MISTRAL_MODELS, MISTRAL_DEFAULT_MODEL } from './MistralModels';
import { MCPToolExecution, MCPCapableAdapter } from '../shared/MCPToolExecution';

export class MistralAdapter extends BaseAdapter implements MCPCapableAdapter {
  readonly name = 'mistral';
  readonly baseUrl = 'https://api.mistral.ai';
  
  private client: Mistral;
  mcpConnector?: any;

  constructor(apiKey: string, mcpConnector?: any, model?: string) {
    super(apiKey, model || MISTRAL_DEFAULT_MODEL);
    
    this.client = new Mistral({ apiKey: this.apiKey });
    this.mcpConnector = mcpConnector;
    this.initializeCache();
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    try {
      const model = options?.model || this.currentModel;
      
      // If tools are provided (pre-converted by ChatService), use tool-enabled generation
      if (options?.tools && options.tools.length > 0) {
        console.log('[Mistral Adapter] Using tool-enabled generation', {
          toolCount: options.tools.length
        });
        return await this.generateWithProvidedTools(prompt, options);
      }
      
      // Otherwise use basic chat completions
      console.log('[Mistral Adapter] Using basic chat completions (no tools)');
      return await this.generateWithChatCompletions(prompt, options);
    } catch (error) {
      throw this.handleError(error, 'generation');
    }
  }

  async* generateStreamAsync(prompt: string, options?: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      console.log('[MistralAdapter] Starting streaming response');
      
      const result = await this.client.chat.stream({
        model: options?.model || this.currentModel,
        messages: this.buildMessages(prompt, options?.systemPrompt),
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        topP: options?.topP,
        stop: options?.stopSequences,
        tools: options?.tools ? this.convertTools(options.tools) : undefined
      });

      let usage: any = undefined;

      for await (const chunk of result) {
        const streamText = chunk.data.choices[0]?.delta?.content;
        
        if (typeof streamText === "string" && streamText) {
          yield { content: streamText, complete: false };
        }

        // Extract usage information if available
        if (chunk.data.usage) {
          usage = chunk.data.usage;
        }
      }

      // Final chunk with usage information
      yield { 
        content: '', 
        complete: true, 
        usage: this.extractUsage({ usage }) 
      };
      
      console.log('[MistralAdapter] Streaming completed');
    } catch (error) {
      console.error('[MistralAdapter] Streaming error:', error);
      throw error;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      return MISTRAL_MODELS.map(model => ({
        id: model.apiName,
        name: model.name,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxTokens,
        supportsJSON: model.capabilities.supportsJSON,
        supportsImages: model.capabilities.supportsImages,
        supportsFunctions: model.capabilities.supportsFunctions,
        supportsStreaming: model.capabilities.supportsStreaming,
        supportsThinking: false,
        costPer1kTokens: {
          input: model.inputCostPerMillion / 1000,
          output: model.outputCostPerMillion / 1000
        },
        pricing: {
          inputPerMillion: model.inputCostPerMillion,
          outputPerMillion: model.outputCostPerMillion,
          currency: 'USD',
          lastUpdated: new Date().toISOString()
        }
      }));
    } catch (error) {
      this.handleError(error, 'listing models');
      return [];
    }
  }

  getCapabilities(): ProviderCapabilities {
    const baseCapabilities = {
      supportsStreaming: true,
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: true,
      supportsThinking: false,
      maxContextWindow: 128000,
      supportedFeatures: [
        'messages',
        'function_calling',
        'streaming',
        'json_mode'
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
   * Generate with pre-converted tools (from ChatService) using centralized execution
   */
  private async generateWithProvidedTools(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    // Use centralized tool execution wrapper to eliminate code duplication
    const model = options?.model || this.currentModel;

    return MCPToolExecution.executeWithToolSupport(
      this,
      'mistral',
      {
        model,
        tools: options?.tools || [],
        prompt,
        systemPrompt: options?.systemPrompt
      },
      {
        buildMessages: (prompt: string, systemPrompt?: string) => 
          this.buildMessages(prompt, systemPrompt),
        
        buildRequestBody: (messages: any[], isInitial: boolean) => ({
          model,
          messages,
          tools: options?.tools ? this.convertTools(options.tools) : undefined,
          toolChoice: 'auto',
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          topP: options?.topP,
          stop: options?.stopSequences
        }),
        
        makeApiCall: async (requestBody: any) => {
          return await this.client.chat.complete(requestBody);
        },
        
        extractResponse: async (response: any) => {
          const choice = response.choices[0];
          
          return {
            content: this.extractMessageContent(choice?.message?.content) || '',
            usage: this.extractUsage(response),
            finishReason: choice?.finishReason || 'stop',
            toolCalls: choice?.message?.toolCalls,
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
   * Generate using standard chat completions
   */
  private async generateWithChatCompletions(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const model = options?.model || this.currentModel;
    
    const chatParams: any = {
      model,
      messages: this.buildMessages(prompt, options?.systemPrompt),
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      topP: options?.topP,
      stop: options?.stopSequences
    };

    // Add tools if provided
    if (options?.tools) {
      chatParams.tools = this.convertTools(options.tools);
    }

    const response = await this.client.chat.complete(chatParams);
    const choice = response.choices[0];
    
    if (!choice) {
      throw new Error('No response from Mistral');
    }
    
    let text = this.extractMessageContent(choice.message?.content) || '';
    const usage = this.extractUsage(response);
    let finishReason = choice.finishReason || 'stop';

    // If tools were provided and we got tool calls, we need to handle them
    // For now, just return the response as-is since tool execution is complex
    if (options?.tools && choice.message?.toolCalls && choice.message.toolCalls.length > 0) {
      console.log(`[Mistral Adapter] Received ${choice.message.toolCalls.length} tool calls, but tool execution not implemented in basic mode`);
      text = text || '[AI requested tool calls but tool execution not available]';
    }

    return this.buildLLMResponse(
      text,
      model,
      usage,
      undefined,
      finishReason as any
    );
  }

  // Private methods
  private convertTools(tools: any[]): any[] {
    return tools.map(tool => {
      if (tool.type === 'function' && tool.function) {
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

  private extractToolCalls(message: any): any[] {
    return message?.tool_calls || [];
  }

  private extractMessageContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .filter(chunk => chunk.type === 'text')
        .map(chunk => chunk.text || '')
        .join('');
    }
    return '';
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    if (!reason) return 'stop';
    
    const reasonMap: Record<string, 'stop' | 'length' | 'tool_calls' | 'content_filter'> = {
      'stop': 'stop',
      'length': 'length',
      'tool_calls': 'tool_calls',
      'model_length': 'length',
      'content_filter': 'content_filter'
    };
    return reasonMap[reason] || 'stop';
  }

  protected extractUsage(response: any): any {
    const usage = response.usage;
    if (usage) {
      return {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0
      };
    }
    return undefined;
  }

  private getCostPer1kTokens(modelId: string): { input: number; output: number } | undefined {
    const model = MISTRAL_MODELS.find(m => m.apiName === modelId);
    if (!model) return undefined;
    
    return {
      input: model.inputCostPerMillion / 1000,
      output: model.outputCostPerMillion / 1000
    };
  }

  async getModelPricing(modelId: string): Promise<ModelPricing | null> {
    const costs = this.getCostPer1kTokens(modelId);
    if (!costs) return null;
    
    return {
      rateInputPerMillion: costs.input * 1000,
      rateOutputPerMillion: costs.output * 1000,
      currency: 'USD'
    };
  }
}