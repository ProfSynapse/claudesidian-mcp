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
import { MCPFunctionBridge } from '../../../mcp-bridge/core/MCPFunctionBridge';
import { ToolCallRequest, ToolCallResult } from '../../../mcp-bridge/types/BridgeTypes';

export class OpenAIAdapter extends BaseAdapter {
  readonly name = 'openai';
  readonly baseUrl = 'https://api.openai.com/v1';
  
  private client: OpenAI;
  private deepResearch: DeepResearchHandler;
  private mcpBridge: MCPFunctionBridge | null = null;
  private mcpSessionId: string | null = null;
  private mcpConnector?: any;

  constructor(apiKey: string, mcpConnector?: any) {
    super(apiKey, 'gpt-5');
    
    this.client = new OpenAI({
      apiKey: this.apiKey,
      dangerouslyAllowBrowser: true, // Required for Obsidian plugin environment
    });
    
    this.deepResearch = new DeepResearchHandler(this.client);
    this.mcpConnector = mcpConnector;
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
      
      // Route deep research models to specialized handler
      if (this.deepResearch.isDeepResearchModel(model)) {
        return await this.deepResearch.generate(prompt, options);
      }
      
      // If tools are provided (pre-converted by ChatService), use tool-enabled generation
      if (options?.tools && options.tools.length > 0) {
        console.log('[OpenAI Adapter] Using tool-enabled generation', {
          toolCount: options.tools.length
        });
        return await this.generateWithProvidedTools(prompt, options);
      }
      
      // Otherwise use basic chat completions
      console.log('[OpenAI Adapter] Using basic chat completions (no tools)');
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
   * Generate with pre-converted tools (from ChatService bridge)
   */
  private async generateWithProvidedTools(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const model = options?.model || this.currentModel;
    const messages = this.buildMessages(prompt, options?.systemPrompt);
    
    const chatParams: any = {
      model,
      messages,
      tools: options?.tools, // Use pre-converted tools
      tool_choice: 'auto'
    };

    // Add optional parameters
    if (options?.temperature !== undefined) chatParams.temperature = options.temperature;
    if (options?.maxTokens !== undefined) chatParams.max_tokens = options.maxTokens;
    if (options?.jsonMode) chatParams.response_format = { type: 'json_object' };
    if (options?.stopSequences) chatParams.stop = options.stopSequences;
    if (options?.topP !== undefined) chatParams.top_p = options.topP;
    if (options?.frequencyPenalty !== undefined) chatParams.frequency_penalty = options.frequencyPenalty;
    if (options?.presencePenalty !== undefined) chatParams.presence_penalty = options.presencePenalty;

    // Call OpenAI API
    const response = await this.client.chat.completions.create(chatParams);
    const choice = response.choices[0];

    if (!choice) {
      throw new Error('No response from OpenAI');
    }

    let finalText = choice.message?.content || '';
    const usage = this.extractUsage({ usage: response.usage });
    let finishReason = choice.finish_reason || 'stop';

    console.log(`[OpenAI Adapter] Tool response analysis:`, {
      hasContent: !!finalText,
      contentLength: finalText.length,
      finishReason,
      hasToolCalls: !!(choice.message?.tool_calls),
      toolCallCount: choice.message?.tool_calls?.length || 0
    });

    // Handle tool calls if present - implement full execution flow
    if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
      console.log(`[OpenAI Adapter] Processing ${choice.message.tool_calls.length} tool calls`);
      
      // DEBUG: Log the actual tool calls from OpenAI to see if common parameters are included
      console.log('[DEBUG] Raw tool calls from OpenAI:', JSON.stringify(choice.message.tool_calls, null, 2));
      
      try {
        // Execute tools via MCP server (HTTP request to localhost:3000)
        const toolResults = await this.executeToolsViaMCP(choice.message.tool_calls);
        
        // Create tool result messages for OpenAI continuation
        const toolMessages = toolResults.map(result => ({
          role: 'tool' as const,
          tool_call_id: result.id,
          content: result.success 
            ? JSON.stringify(result.result)
            : `Error: ${result.error}`
        }));
        
        console.log(`[OpenAI Adapter] Tool messages being sent back to OpenAI:`, JSON.stringify(toolMessages, null, 2));

        // Continue conversation with tool results
        const continuationMessages = [
          ...messages,
          choice.message, // Include the assistant message with tool calls
          ...toolMessages
        ];

        console.log(`[OpenAI Adapter] Continuing conversation with ${toolResults.length} tool results`);

        // Make continuation request to get final response
        const continuationResponse = await this.client.chat.completions.create({
          model,
          messages: continuationMessages,
          // Remove tools for continuation to prevent infinite loop
          temperature: options?.temperature,
          max_tokens: options?.maxTokens
        });

        const continuationChoice = continuationResponse.choices[0];
        if (continuationChoice?.message?.content) {
          finalText = continuationChoice.message.content;
          finishReason = continuationChoice.finish_reason || 'stop';
          console.log(`[OpenAI Adapter] Got continuation response: ${finalText.substring(0, 100)}...`);
        }

      } catch (error) {
        console.error('[OpenAI Adapter] Tool execution failed:', error);
        const toolNames = choice.message.tool_calls.map((tc: any) => tc.function?.name).join(', ');
        finalText = `I tried to use tools (${toolNames}) but encountered an error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    return this.buildLLMResponse(
      finalText,
      model,
      usage,
      undefined,
      finishReason as any
    );
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
    const choice = response.choices[0];
    
    if (!choice) {
      throw new Error('No response from OpenAI');
    }
    
    let text = choice.message?.content || '';
    const usage = this.extractUsage({ usage: response.usage });
    let finishReason = choice.finish_reason || 'stop';

    // If tools were provided and we got tool calls, we need to handle them
    // For now, just return the response as-is since tool execution is complex
    // TODO: Implement proper tool call execution if needed
    if (options?.tools && choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
      console.log(`[OpenAI Adapter] Received ${choice.message.tool_calls.length} tool calls, but tool execution not implemented in basic mode`);
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

  /**
   * Execute tools via existing MCP connector (not HTTP)
   */
  private async executeToolsViaMCP(toolCalls: any[]): Promise<Array<{
    id: string;
    success: boolean;
    result?: any;
    error?: string;
  }>> {
    const results = [];
    
    for (const toolCall of toolCalls) {
      try {
        const sanitizedToolName = toolCall.function?.name;
        const parameters = JSON.parse(toolCall.function?.arguments || '{}');
        
        // Convert back from sanitized name to original MCP name  
        // The converter replaces dots with underscores, so convert first underscore back to dot
        const originalToolName = sanitizedToolName.replace(/([a-zA-Z])_([a-zA-Z])/, '$1.$2');
        
        console.log(`[OpenAI Tool Execution] Executing ${sanitizedToolName} -> ${originalToolName} with params:`, parameters);
        
        // Convert tool call to AgentModeParams format for existing connector
        const [agent, mode] = originalToolName.split('.');
        const agentModeParams = {
          agent,
          mode, 
          params: parameters
        };
        
        console.log(`[OpenAI Tool Execution] Calling existing connector with:`, agentModeParams);
        
        // Use existing MCP connector (should be available from plugin instance)
        // This uses the existing working MCP infrastructure
        let result: any;
        if (this.mcpConnector) {
          result = await this.mcpConnector.callTool(agentModeParams);
          console.log(`[OpenAI Tool Execution] Tool result for ${originalToolName}:`, JSON.stringify(result, null, 2));
        } else {
          throw new Error('MCP connector not available');
        }
        
        results.push({
          id: toolCall.id,
          success: result.success,
          result: result
        });

      } catch (error) {
        console.error(`[OpenAI Tool Execution] Failed to execute ${toolCall.function?.name}:`, error);
        results.push({
          id: toolCall.id,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return results;
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
      // Get available tools from MCP bridge
      const mcpTools = await this.mcpBridge.getToolsForProvider('openai');
      
      console.log(`[OpenAI Bridge] Using ${mcpTools.length} tools for generation`);
      
      // Extract OpenAI tool format
      const openAITools = mcpTools.map(t => t.tool);
      
      // DEBUG: Log a sample tool schema to verify common parameters are included
      if (openAITools.length > 0) {
        console.log('[DEBUG] Sample tool schema sent to OpenAI:', JSON.stringify(openAITools[0], null, 2));
      }

      // Build OpenAI request with tools
      const chatParams: any = {
        model,
        messages,
        tools: openAITools,
        tool_choice: 'auto' // Let OpenAI decide when to use tools
      };

      // Add optional parameters
      if (options?.temperature !== undefined) chatParams.temperature = options.temperature;
      if (options?.maxTokens !== undefined) chatParams.max_tokens = options.maxTokens;
      if (options?.jsonMode) chatParams.response_format = { type: 'json_object' };
      if (options?.stopSequences) chatParams.stop = options.stopSequences;
      if (options?.topP !== undefined) chatParams.top_p = options.topP;
      if (options?.frequencyPenalty !== undefined) chatParams.frequency_penalty = options.frequencyPenalty;
      if (options?.presencePenalty !== undefined) chatParams.presence_penalty = options.presencePenalty;

      // Call OpenAI API
      const response = await this.client.chat.completions.create(chatParams);
      const choice = response.choices[0];

      if (!choice) {
        throw new Error('No response from OpenAI');
      }

      let finalText = choice.message?.content || '';
      const usage = this.extractUsage({ usage: response.usage });
      let finishReason = choice.finish_reason || 'stop';
      const toolCalls: any[] = [];

      console.log(`[OpenAI Bridge] Response analysis:`, {
        hasContent: !!finalText,
        contentLength: finalText.length,
        finishReason,
        hasMessage: !!choice.message,
        hasToolCalls: !!(choice.message?.tool_calls),
        toolCallCount: choice.message?.tool_calls?.length || 0,
        messageKeys: choice.message ? Object.keys(choice.message) : []
      });

      // Handle tool calls if present
      if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
        console.log(`[OpenAI Bridge] Processing ${choice.message.tool_calls.length} tool calls`);

        // Convert OpenAI tool calls to bridge format
        const bridgeToolCalls: ToolCallRequest[] = choice.message.tool_calls.map((toolCall: any) => ({
          id: toolCall.id,
          name: toolCall.function?.name || toolCall.name,
          parameters: JSON.parse((toolCall.function?.arguments || toolCall.arguments) || '{}'),
          provider: 'openai' as const,
          metadata: {
            timestamp: new Date().toISOString()
          }
        }));

        // Execute tool calls via bridge
        const toolResults = await this.mcpBridge.executeToolCalls(bridgeToolCalls);

        // Format tool results for OpenAI continuation
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

        const continuationResponse = await this.client.chat.completions.create({
          ...chatParams,
          messages: continuationMessages,
          tools: undefined, // Remove tools for continuation
          tool_choice: undefined
        });

        const continuationChoice = continuationResponse.choices[0];
        if (continuationChoice?.message?.content) {
          finalText = continuationChoice.message.content;
          finishReason = continuationChoice.finish_reason || 'stop';
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
      console.error('[OpenAI Bridge] Tool-enabled generation failed:', error);
      throw error;
    }
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
   * Initialize MCP bridge for tool calling
   */
  private initializeMCPBridge(): void {
    try {
      this.mcpBridge = new MCPFunctionBridge();
      console.log('[OpenAI Bridge] MCP bridge initialized successfully');
    } catch (error) {
      console.error('[OpenAI Bridge] Failed to initialize MCP bridge:', error);
    }
  }

  /**
   * Initialize MCP bridge and connect to server
   */
  async configureMCPServer(serverUrl?: string): Promise<void> {
    if (!this.mcpBridge) {
      console.warn('[OpenAIAdapter] Cannot configure MCP - bridge not initialized');
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
      console.log(`[OpenAIAdapter] MCP bridge connected successfully`);
    } catch (error) {
      console.error('[OpenAIAdapter] Failed to configure MCP bridge:', error);
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
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities {
    const baseCapabilities = {
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

    // Add MCP support if available
    if (this.supportsMCP()) {
      baseCapabilities.supportedFeatures.push('mcp_integration');
    }

    return baseCapabilities;
  }

  /**
   * Get model pricing
   */
  async getModelPricing(modelId: string): Promise<ModelPricing | null> {
    try {
      const models = ModelRegistry.getProviderModels('openai');
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