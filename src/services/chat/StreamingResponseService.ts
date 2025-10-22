/**
 * StreamingResponseService - Manages streaming response generation
 *
 * Responsibilities:
 * - Coordinate LLM streaming with tool execution
 * - Handle progressive tool call detection
 * - Integrate cost tracking during streaming
 * - Persist messages and usage data
 * - Build LLM context with conversation history
 * - Manage streaming lifecycle (start, chunk, complete, abort)
 *
 * This is the core streaming coordination layer that brings together:
 * - ToolCallService (tool detection/events)
 * - CostTrackingService (usage/cost calculation)
 * - LLMService (actual streaming)
 * - ConversationService (persistence)
 *
 * Follows Single Responsibility Principle - only handles streaming coordination.
 */

import { ConversationData } from '../../types/chat/ChatTypes';
import { ConversationContextBuilder } from './ConversationContextBuilder';
import { ToolCallService } from './ToolCallService';
import { CostTrackingService } from './CostTrackingService';

export interface StreamingOptions {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  workspaceId?: string;
  sessionId?: string;
  messageId?: string;
  abortSignal?: AbortSignal;
}

export interface StreamingChunk {
  chunk: string;
  complete: boolean;
  messageId: string;
  toolCalls?: any[];
}

export interface StreamingDependencies {
  llmService: any;
  conversationService: any;
  toolCallService: ToolCallService;
  costTrackingService: CostTrackingService;
}

export class StreamingResponseService {
  private currentProvider?: string;

  constructor(
    private dependencies: StreamingDependencies
  ) {}

  /**
   * Generate streaming response with full coordination
   *
   * Always loads conversation from storage to ensure fresh data with tool calls
   */
  async* generateResponse(
    conversationId: string,
    userMessage: string,
    options?: StreamingOptions
  ): AsyncGenerator<StreamingChunk, void, unknown> {
    try {
      const messageId = options?.messageId || `msg_${Date.now()}_ai`;
      let accumulatedContent = '';

      // Get defaults from LLMService if user didn't select provider/model
      const defaultModel = this.dependencies.llmService.getDefaultModel();

      // Create placeholder message immediately so async usage callback can update it
      // This is saved early to ensure the message exists when async cost calculation completes
      await this.dependencies.conversationService.addMessage({
        conversationId,
        role: 'assistant',
        content: '', // Will be updated as streaming progresses
        id: messageId
      });

      // Get provider for context building
      const provider = options?.provider || defaultModel.provider;
      this.currentProvider = provider; // Store for context building

      // ALWAYS load conversation from storage to get complete history including tool calls
      const conversation = await this.dependencies.conversationService.getConversation(conversationId);

      // Build conversation context for LLM with provider-specific formatting
      // NOTE: buildLLMMessages includes ALL messages from storage, including the user message
      // that was just saved by sendMessage(), so we DON'T add it again here
      const messages = conversation ?
        this.buildLLMMessages(conversation, provider, options?.systemPrompt) : [];

      // Add system prompt if provided and not already added by buildLLMMessages
      if (options?.systemPrompt && !messages.some(m => m.role === 'system')) {
        messages.unshift({ role: 'system', content: options.systemPrompt });
      }

      // Only add user message if it's NOT already in the conversation
      // (happens on first message when conversation is empty)
      if (!conversation || !conversation.messages.some((m: any) => m.content === userMessage && m.role === 'user')) {
        messages.push({ role: 'user', content: userMessage });
      }

      // Get tools from ToolCallService in OpenAI format
      const openAITools = this.dependencies.toolCallService.getAvailableTools();

      // Prepare LLM options with converted tools
      const llmOptions: any = {
        provider: options?.provider || defaultModel.provider,
        model: options?.model || defaultModel.model,
        systemPrompt: options?.systemPrompt,
        tools: openAITools,
        toolChoice: openAITools.length > 0 ? 'auto' : undefined,
        abortSignal: options?.abortSignal,
        sessionId: options?.sessionId,
        workspaceId: options?.workspaceId
      };

      // Add tool event callback for live UI updates (delegates to ToolCallService)
      llmOptions.onToolEvent = (event: 'started' | 'completed', data: any) => {
        this.dependencies.toolCallService.fireToolEvent(messageId, event, data);
      };

      // Add usage callback for async cost calculation (e.g., OpenRouter streaming)
      llmOptions.onUsageAvailable = this.dependencies.costTrackingService.createUsageCallback(conversationId, messageId);

      // Stream the response from LLM service with MCP tools
      let toolCalls: any[] | undefined = undefined;
      let toolCallsSaved = false; // Track if we've saved the tool call message
      this.dependencies.toolCallService.resetDetectedTools(); // Reset tool detection state for new message

      // Track usage and cost for conversation tracking
      let finalUsage: any = undefined;
      let finalCost: any = undefined;

      for await (const chunk of this.dependencies.llmService.generateResponseStream(messages, llmOptions)) {
        // Check if aborted FIRST before processing chunk
        if (options?.abortSignal?.aborted) {
          throw new DOMException('Generation aborted by user', 'AbortError');
        }

        accumulatedContent += chunk.chunk;

        // Extract usage for cost calculation
        if (chunk.usage) {
          finalUsage = chunk.usage;
        }

        // Extract tool calls when available and handle progressive display
        if (chunk.toolCalls) {
          toolCalls = chunk.toolCalls;

          // Save assistant message with tool calls immediately when detected (before pingpong)
          // This happens ONCE when tool calls are first complete
          if (chunk.toolCallsReady && !toolCallsSaved) {
            await this.dependencies.conversationService.addMessage({
              conversationId,
              role: 'assistant',
              content: null, // OpenAI format: content is null when making tool calls
              toolCalls: toolCalls
            });
            toolCallsSaved = true;
          }

          // Handle progressive tool call detection (fires 'detected' and 'updated' events)
          if (toolCalls) {
            this.dependencies.toolCallService.handleToolCallDetection(
              messageId,
              toolCalls,
              chunk.toolCallsReady || false,
              conversationId
            );
          }
        }

        // Save to database BEFORE yielding final chunk to ensure persistence
        if (chunk.complete) {
          // Calculate cost from final usage using CostTrackingService
          if (finalUsage) {
            const usageData = this.dependencies.costTrackingService.extractUsage(finalUsage);
            if (usageData) {
              finalCost = await this.dependencies.costTrackingService.trackMessageUsage(
                conversationId,
                messageId,
                provider,
                llmOptions.model,
                usageData
              );
            }
          }

          // Update the placeholder message with final content
          const conv = await this.dependencies.conversationService.getConversation(conversationId);
          if (conv) {
            const msg = conv.messages.find((m: any) => m.id === messageId);
            if (msg) {
              // Update existing placeholder message
              msg.content = accumulatedContent;

              // Only update cost/usage if we have values (don't overwrite with undefined)
              // This prevents overwriting async updates from OpenRouter's generation API
              if (finalCost) {
                msg.cost = finalCost;
              }
              if (finalUsage) {
                msg.usage = finalUsage;
              }

              msg.provider = provider;
              msg.model = llmOptions.model;

              // Save updated conversation
              await this.dependencies.conversationService.updateConversation(conversationId, {
                messages: conv.messages,
                metadata: conv.metadata
              });
            }
          }

          // Handle tool calls - if present, add separate message for pingpong response
          if (toolCalls && toolCalls.length > 0) {
            // Had tool calls - the placeholder is the tool call message, add pingpong response separately
            await this.dependencies.conversationService.addMessage({
              conversationId,
              role: 'assistant',
              content: accumulatedContent, // Pingpong response text
              cost: finalCost,
              usage: finalUsage,
              provider: provider,
              model: llmOptions.model
              // No toolCalls - this is the response AFTER seeing tool results
            });
          }
        }

        yield {
          chunk: chunk.chunk,
          complete: chunk.complete,
          messageId,
          toolCalls: toolCalls
        };

        if (chunk.complete) {
          break;
        }
      }

    } catch (error) {
      console.error('Error in generateResponse:', error);
      throw error;
    }
  }

  /**
   * Build message history for LLM context using provider-specific formatting
   *
   * This method uses ConversationContextBuilder to properly reconstruct
   * conversation history with tool calls in the correct format for each provider.
   */
  private buildLLMMessages(conversation: ConversationData, provider?: string, systemPrompt?: string): any[] {
    const currentProvider = provider || this.getCurrentProvider();

    return ConversationContextBuilder.buildContextForProvider(
      conversation,
      currentProvider,
      systemPrompt
    );
  }

  /**
   * Get current provider for context building
   */
  private getCurrentProvider(): string {
    return this.currentProvider || this.dependencies.llmService.getDefaultModel().provider;
  }

  /**
   * Set current provider (for context building)
   */
  setProvider(provider: string): void {
    this.currentProvider = provider;
  }
}
