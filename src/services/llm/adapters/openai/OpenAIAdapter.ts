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
import { MCPToolExecution, MCPCapableAdapter } from '../shared/MCPToolExecution';

export class OpenAIAdapter extends BaseAdapter implements MCPCapableAdapter {
  readonly name = 'openai';
  readonly baseUrl = 'https://api.openai.com/v1';
  
  private client: OpenAI;
  private deepResearch: DeepResearchHandler;
  mcpConnector?: any;

  constructor(apiKey: string, mcpConnector?: any) {
    super(apiKey, 'gpt-5');
    
    this.client = new OpenAI({
      apiKey: this.apiKey,
      dangerouslyAllowBrowser: true, // Required for Obsidian plugin environment
    });
    
    this.deepResearch = new DeepResearchHandler(this.client);
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
   * Implements user confirmation system for extended tool use
   */
  private async generateWithProvidedTools(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const model = options?.model || this.currentModel;
    const messages = this.buildMessages(prompt, options?.systemPrompt);
    
    const TOOL_ITERATION_THRESHOLD = 15;
    let totalToolIterations = 0;
    
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

    // Implement iterative tool execution with user confirmation system
    let currentResponse = response;
    let currentChoice = choice;
    let conversationMessages = [...messages];
    
    // Tool execution loop with threshold protection
    while (currentChoice?.message?.tool_calls && currentChoice.message.tool_calls.length > 0) {
      totalToolIterations++;
      
      console.log(`[OpenAI Tool Safety] Tool iteration ${totalToolIterations}/${TOOL_ITERATION_THRESHOLD}`);
      
      // Check if we've hit the threshold
      if (totalToolIterations >= TOOL_ITERATION_THRESHOLD) {
        console.log(`[OpenAI Tool Safety] Hit ${TOOL_ITERATION_THRESHOLD} tool iteration threshold - activating dead switch`);
        
        // Create dead switch response for the LLM
        const deadSwitchMessage = {
          role: 'system' as const,
          content: `TOOL_LIMIT_REACHED: You have used ${TOOL_ITERATION_THRESHOLD} tool iterations. You must now ask the user if they want to continue with more tool calls. Explain what you've accomplished so far and what you still need to do. Wait for user confirmation before proceeding further.`
        };
        
        // Get final response with dead switch message
        const deadSwitchMessages = [
          ...conversationMessages,
          currentChoice.message,
          deadSwitchMessage
        ];
        
        const deadSwitchResponse = await this.client.chat.completions.create({
          model,
          messages: deadSwitchMessages,
          // Remove tools to force user interaction
          temperature: options?.temperature,
          max_tokens: options?.maxTokens
        });
        
        const deadSwitchChoice = deadSwitchResponse.choices[0];
        if (deadSwitchChoice?.message?.content) {
          finalText = deadSwitchChoice.message.content;
          finishReason = 'stop';
          console.log(`[OpenAI Tool Safety] Dead switch activated - awaiting user confirmation`);
        }
        break;
      }
      
      // Execute current tool calls
      console.log(`[OpenAI Adapter] Processing ${currentChoice.message.tool_calls.length} tool calls (iteration ${totalToolIterations})`);
      
      try {
        // Convert OpenAI tool calls to MCPToolCall format
        const mcpToolCalls = currentChoice.message.tool_calls.map(tc => ({
          id: tc.id,
          function: {
            name: (tc as any).function?.name || '',
            arguments: (tc as any).function?.arguments || '{}'
          }
        }));
        
        // Execute tools via shared MCP utility
        const toolResults = await MCPToolExecution.executeToolCalls(this, mcpToolCalls, 'openai');
        
        // Create tool result messages for OpenAI continuation
        const toolMessages = MCPToolExecution.buildToolMessages(toolResults);
        
        // Update conversation with tool call and results
        conversationMessages = [
          ...conversationMessages,
          currentChoice.message,
          ...toolMessages
        ];
        
        console.log(`[OpenAI Adapter] Continuing conversation with ${toolResults.length} tool results`);

        // Make continuation request with tools still available
        const continuationResponse = await this.client.chat.completions.create({
          model,
          messages: conversationMessages,
          tools: options?.tools as any,
          tool_choice: 'auto',
          temperature: options?.temperature,
          max_tokens: options?.maxTokens
        });

        // Update for next iteration
        currentResponse = continuationResponse;
        currentChoice = continuationResponse.choices[0];
        
        if (currentChoice?.message?.content) {
          finalText = currentChoice.message.content;
          finishReason = currentChoice.finish_reason || 'stop';
        }
        
      } catch (error) {
        console.error('[OpenAI Adapter] Tool execution failed:', error);
        const toolNames = (currentChoice.message.tool_calls || []).map((tc: any) => tc.function?.name).join(', ');
        finalText = `I tried to use tools (${toolNames}) but encountered an error: ${error instanceof Error ? error.message : String(error)}`;
        break;
      }
    }
    
    console.log(`[OpenAI Tool Safety] Tool execution completed after ${totalToolIterations} iterations`);

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
   * Check if MCP is available via connector
   */
  supportsMCP(): boolean {
    return MCPToolExecution.supportsMCP(this);
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