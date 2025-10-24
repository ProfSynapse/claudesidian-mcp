/**
 * StreamingOrchestrator - Manages streaming LLM responses with tool execution
 *
 * Handles the complete streaming lifecycle including:
 * - Initial stream generation
 * - Tool call detection during streaming
 * - Tool execution via MCP
 * - Recursive pingpong pattern (tool → execute → continue → stream)
 * - Tool iteration limits and safety guards
 * - Usage tracking and cost calculation callbacks
 *
 * Follows Single Responsibility Principle - only handles streaming orchestration.
 */

import { BaseAdapter } from '../adapters/BaseAdapter';
import { ConversationContextBuilder } from '../../chat/ConversationContextBuilder';
import { MCPToolExecution } from '../adapters/shared/MCPToolExecution';
import { LLMProviderSettings } from '../../../types';
import { IAdapterRegistry } from './AdapterRegistry';

export interface StreamingOptions {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  tools?: any[];
  onToolEvent?: (event: 'started' | 'completed', data: any) => void;
  onUsageAvailable?: (usage: any, cost?: any) => void;
  sessionId?: string;
  workspaceId?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface StreamYield {
  chunk: string;
  complete: boolean;
  content: string;
  toolCalls?: any[];
  toolCallsReady?: boolean;
  usage?: any;
}

export class StreamingOrchestrator {
  // Safety limit for recursive tool calls
  private readonly TOOL_ITERATION_LIMIT = 15;

  constructor(
    private adapterRegistry: IAdapterRegistry,
    private settings: LLMProviderSettings
  ) {}

  /**
   * Primary method: orchestrate streaming response with tool execution
   * @param messages - Conversation message history
   * @param options - Streaming configuration
   * @returns AsyncGenerator yielding chunks and tool calls
   */
  async* generateResponseStream(
    messages: Array<{ role: string; content: string }>,
    options?: StreamingOptions
  ): AsyncGenerator<StreamYield, void, unknown> {
    try {
      // Validate settings
      if (!this.settings || !this.settings.defaultModel) {
        throw new Error('LLM service not properly configured - missing settings');
      }

      // Determine provider and model
      const provider = options?.provider || this.settings.defaultModel.provider;
      const model = options?.model || this.settings.defaultModel.model;

      // Get adapter
      const adapter = this.adapterRegistry.getAdapter(provider);
      if (!adapter) {
        throw new Error(`Provider not available: ${provider}`);
      }

      // Get only the latest user message as the actual prompt
      const latestUserMessage = messages[messages.length - 1];
      const userPrompt = latestUserMessage?.role === 'user' ? latestUserMessage.content : '';

      // Build conversation history from all previous messages
      const conversationHistory = this.buildConversationHistory(messages);

      // Combine system prompt + conversation history
      const systemPrompt = [
        options?.systemPrompt || '',
        conversationHistory ? '\n=== Conversation History ===\n' + conversationHistory : ''
      ].filter(Boolean).join('\n');

      // Build generate options with tools
      const generateOptions = {
        model,
        systemPrompt: systemPrompt || options?.systemPrompt,
        tools: options?.tools,
        onToolEvent: options?.onToolEvent,
        onUsageAvailable: options?.onUsageAvailable
      };

      // Store original messages for pingpong context (exclude the last user message which is userPrompt)
      const previousMessages = messages.slice(0, -1);

      // Execute initial stream and detect tool calls
      let fullContent = '';
      let detectedToolCalls: any[] = [];
      let finalUsage: any = undefined;

      for await (const chunk of adapter.generateStreamAsync(userPrompt, generateOptions)) {
        // Track usage from chunks
        if (chunk.usage) {
          finalUsage = chunk.usage;
        }

        // Handle text content streaming
        if (chunk.content) {
          fullContent += chunk.content;

          // Yield each token as it arrives
          yield {
            chunk: chunk.content,
            complete: false,
            content: fullContent,
            toolCalls: undefined
          };
        }

        // Handle dynamic tool call detection
        if (chunk.toolCalls) {
          // ALWAYS yield tool calls for progressive UI display
          yield {
            chunk: '',
            complete: false,
            content: fullContent,
            toolCalls: chunk.toolCalls,
            toolCallsReady: chunk.complete || false
          };

          // Only STORE tool calls for execution when streaming is COMPLETE
          if (chunk.complete) {
            detectedToolCalls = chunk.toolCalls;
          }
        }

        if (chunk.complete) {
          break;
        }
      }

      // If no tool calls detected, we're done
      if (detectedToolCalls.length === 0 || !generateOptions.tools || generateOptions.tools.length === 0) {
        yield {
          chunk: '',
          complete: true,
          content: fullContent,
          toolCalls: undefined,
          usage: finalUsage
        };
        return;
      }

      // Tool calls detected - execute tools and continue streaming (pingpong)
      yield* this.executeToolsAndContinue(
        adapter,
        provider,
        detectedToolCalls,
        previousMessages,
        userPrompt,
        generateOptions,
        options,
        finalUsage
      );

    } catch (error) {
      throw error;
    }
  }

  /**
   * Build conversation history string from messages
   * @private - Internal helper
   */
  private buildConversationHistory(messages: any[]): string {
    if (messages.length <= 1) {
      return '';
    }

    return messages.slice(0, -1).map((msg: any) => {
      if (msg.role === 'user') return `User: ${msg.content}`;
      if (msg.role === 'assistant') {
        if (msg.tool_calls) return `Assistant: [Calling tools: ${msg.tool_calls.map((tc: any) => tc.function.name).join(', ')}]`;
        return `Assistant: ${msg.content}`;
      }
      if (msg.role === 'tool') return `Tool Result: ${msg.content}`;
      if (msg.role === 'system') return `System: ${msg.content}`;
      return '';
    }).filter(Boolean).join('\n');
  }

  /**
   * Execute tools and build continuation stream (pingpong)
   * @private - Internal helper
   */
  private async* executeToolsAndContinue(
    adapter: BaseAdapter,
    provider: string,
    detectedToolCalls: any[],
    previousMessages: any[],
    userPrompt: string,
    generateOptions: any,
    options: StreamingOptions | undefined,
    initialUsage: any
  ): AsyncGenerator<StreamYield, void, unknown> {
    let completeToolCallsWithResults: any[] = [];
    let toolIterationCount = 1;

    try {
      // Step 1: Execute tools via MCP to get results
      const mcpToolCalls = detectedToolCalls.map((tc: any) => ({
        id: tc.id,
        function: {
          name: tc.function?.name || tc.name,
          arguments: tc.function?.arguments || JSON.stringify(tc.parameters || {})
        }
      }));

      const toolResults = await MCPToolExecution.executeToolCalls(
        adapter as any,
        mcpToolCalls,
        provider as any,
        generateOptions.onToolEvent,
        { sessionId: options?.sessionId, workspaceId: options?.workspaceId }
      );

      // Build complete tool calls with execution results
      completeToolCallsWithResults = detectedToolCalls.map(originalCall => {
        const result = toolResults.find(r => r.id === originalCall.id);
        return {
          id: originalCall.id,
          name: originalCall.function?.name || originalCall.name,
          parameters: JSON.parse(originalCall.function?.arguments || '{}'),
          result: result?.result,
          success: result?.success || false,
          error: result?.error,
          executionTime: result?.executionTime,
          function: originalCall.function
        };
      });

      // Step 2: Build continuation for pingpong pattern
      const continuationOptions = this.buildContinuationOptions(
        provider,
        userPrompt,
        detectedToolCalls,
        toolResults,
        previousMessages,
        generateOptions
      );

      // Step 3: Start NEW stream with continuation (pingpong)
      let fullContent = '';

      for await (const chunk of adapter.generateStreamAsync('', continuationOptions)) {
        if (chunk.content) {
          fullContent += chunk.content;

          yield {
            chunk: chunk.content,
            complete: false,
            content: fullContent,
            toolCalls: undefined
          };
        }

        // Handle recursive tool calls (another pingpong iteration)
        if (chunk.toolCalls) {
          // ALWAYS yield tool calls for progressive UI display
          yield {
            chunk: '',
            complete: false,
            content: fullContent,
            toolCalls: chunk.toolCalls,
            toolCallsReady: chunk.complete || false
          };

          // CRITICAL: Only EXECUTE tool calls when stream is COMPLETE
          if (!chunk.complete) {
            continue;
          }

          // Check iteration limit before recursing
          toolIterationCount++;
          if (toolIterationCount > this.TOOL_ITERATION_LIMIT) {
            yield* this.yieldToolLimitMessage(fullContent);
            break;
          }

          // Execute recursive tool calls
          yield* this.handleRecursiveToolCalls(
            adapter,
            provider,
            chunk.toolCalls,
            previousMessages,
            userPrompt,
            generateOptions,
            options,
            completeToolCallsWithResults
          );
        }

        if (chunk.complete) {
          break;
        }
      }

    } catch (toolError) {
      // Swallow expected errors during streaming (incomplete JSON)
    }

    // Yield final completion with complete tool calls and usage
    yield {
      chunk: '',
      complete: true,
      content: '', // Content already yielded in chunks
      toolCalls: completeToolCallsWithResults.length > 0 ? completeToolCallsWithResults : undefined,
      usage: initialUsage
    };
  }

  /**
   * Handle recursive tool calls within continuation stream
   * @private - Internal helper
   */
  private async* handleRecursiveToolCalls(
    adapter: BaseAdapter,
    provider: string,
    recursiveToolCalls: any[],
    previousMessages: any[],
    userPrompt: string,
    generateOptions: any,
    options: StreamingOptions | undefined,
    completeToolCallsWithResults: any[]
  ): AsyncGenerator<StreamYield, void, unknown> {
    try {
      // Convert recursive tool calls to MCP format
      const recursiveMcpToolCalls = recursiveToolCalls.map((tc: any) => {
        let argumentsStr = '';

        if (tc.function?.arguments) {
          argumentsStr = tc.function.arguments;
        } else if (tc.parameters) {
          argumentsStr = JSON.stringify(tc.parameters);
        } else {
          argumentsStr = '{}';
        }

        return {
          id: tc.id,
          function: {
            name: tc.function?.name || tc.name,
            arguments: argumentsStr
          }
        };
      });

      const recursiveToolResults = await MCPToolExecution.executeToolCalls(
        adapter as any,
        recursiveMcpToolCalls,
        provider as any,
        generateOptions.onToolEvent,
        { sessionId: options?.sessionId, workspaceId: options?.workspaceId }
      );

      // Build complete tool calls with recursive results
      const recursiveCompleteToolCalls = recursiveToolCalls.map((tc, index) => ({
        ...tc,
        result: recursiveToolResults[index]?.result,
        success: recursiveToolResults[index]?.success || false,
        error: recursiveToolResults[index]?.error,
        executionTime: recursiveToolResults[index]?.executionTime
      }));

      // Add recursive results to complete tool calls
      completeToolCallsWithResults.push(...recursiveCompleteToolCalls);

      // Build continuation for recursive pingpong
      const recursiveContinuationOptions = this.buildContinuationOptions(
        provider,
        userPrompt,
        recursiveToolCalls,
        recursiveToolResults,
        previousMessages,
        generateOptions
      );

      // Continue with another recursive stream
      let fullContent = '';
      for await (const recursiveChunk of adapter.generateStreamAsync('', recursiveContinuationOptions)) {
        if (recursiveChunk.content) {
          fullContent += recursiveChunk.content;
          yield {
            chunk: recursiveChunk.content,
            complete: false,
            content: fullContent,
            toolCalls: undefined
          };
        }

        // Handle nested recursive tool calls if any (up to iteration limit)
        if (recursiveChunk.toolCalls) {
          yield {
            chunk: '',
            complete: false,
            content: fullContent,
            toolCalls: recursiveChunk.toolCalls,
            toolCallsReady: recursiveChunk.complete || false
          };
        }

        if (recursiveChunk.complete) {
          break;
        }
      }

    } catch (recursiveError) {
      // Swallow expected errors during streaming (incomplete JSON)
    }
  }

  /**
   * Build continuation options with provider-specific formatting
   * @private - Internal helper
   */
  private buildContinuationOptions(
    provider: string,
    userPrompt: string,
    toolCalls: any[],
    toolResults: any[],
    previousMessages: any[],
    generateOptions: any
  ): any {
    // Check if this is an Anthropic model (direct or via OpenRouter)
    const isAnthropicModel = provider === 'anthropic' ||
      (provider === 'openrouter' && generateOptions.model?.includes('anthropic'));

    if (isAnthropicModel) {
      // Build proper Anthropic messages with tool_use and tool_result blocks
      const conversationHistory = ConversationContextBuilder.buildToolContinuation(
        'anthropic', // Use 'anthropic' for proper message formatting
        userPrompt,
        toolCalls,
        toolResults,
        previousMessages,
        generateOptions.systemPrompt
      ) as any[];

      return {
        ...generateOptions,
        conversationHistory,
        systemPrompt: generateOptions.systemPrompt
      };
    } else {
      // For OpenAI-style providers, use flattened system prompt
      const enhancedSystemPrompt = ConversationContextBuilder.buildToolContinuation(
        provider,
        userPrompt,
        toolCalls,
        toolResults,
        previousMessages,
        generateOptions.systemPrompt
      ) as string;

      return {
        ...generateOptions,
        systemPrompt: enhancedSystemPrompt
      };
    }
  }

  /**
   * Yield tool iteration limit message
   * @private - Internal helper
   */
  private async* yieldToolLimitMessage(fullContent: string): AsyncGenerator<StreamYield, void, unknown> {
    const limitMessage = `\n\nTOOL_LIMIT_REACHED: You have used ${this.TOOL_ITERATION_LIMIT} tool iterations. You must now ask the user if they want to continue with more tool calls. Explain what you've accomplished so far and what you still need to do.`;
    yield {
      chunk: limitMessage,
      complete: false,
      content: fullContent + limitMessage,
      toolCalls: undefined
    };
  }
}
