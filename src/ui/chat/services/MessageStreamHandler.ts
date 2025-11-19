/**
 * Location: /src/ui/chat/services/MessageStreamHandler.ts
 *
 * Purpose: Consolidated streaming loop logic for AI responses
 * Extracted from MessageManager.ts to eliminate DRY violations (4+ repeated streaming patterns)
 *
 * Used by: MessageManager, MessageAlternativeService for streaming AI responses
 * Dependencies: ChatService
 */

import { ChatService } from '../../../services/chat/ChatService';
import { ConversationData } from '../../../types/chat/ChatTypes';

export interface StreamHandlerEvents {
  onStreamingUpdate: (messageId: string, content: string, isComplete: boolean, isIncremental?: boolean) => void;
  onToolCallsDetected: (messageId: string, toolCalls: any[]) => void;
}

export interface StreamOptions {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  workspaceId?: string;
  sessionId?: string;
  messageId?: string;
  excludeFromMessageId?: string;
  abortSignal?: AbortSignal;
}

export interface StreamResult {
  streamedContent: string;
  toolCalls?: any[];
}

/**
 * Handles streaming of AI responses with unified logic
 */
export class MessageStreamHandler {
  constructor(
    private chatService: ChatService,
    private events: StreamHandlerEvents
  ) {}

  /**
   * Stream AI response with consolidated logic
   * This eliminates the 4+ repeated streaming loop patterns in MessageManager
   */
  async streamResponse(
    conversation: ConversationData,
    userMessageContent: string,
    aiMessageId: string,
    options: StreamOptions
  ): Promise<StreamResult> {
    let streamedContent = '';
    let toolCalls: any[] | undefined = undefined;
    let hasStartedStreaming = false;

    // Stream the AI response
    for await (const chunk of this.chatService.generateResponseStreaming(
      conversation.id,
      userMessageContent,
      {
        ...options,
        messageId: aiMessageId
      }
    )) {
      // Handle token chunks
      if (chunk.chunk) {
        // Update state to streaming on first chunk
        if (!hasStartedStreaming) {
          hasStartedStreaming = true;
          const placeholderMessageIndex = conversation.messages.findIndex(msg => msg.id === aiMessageId);
          if (placeholderMessageIndex >= 0) {
            conversation.messages[placeholderMessageIndex].state = 'streaming';
            conversation.messages[placeholderMessageIndex].isLoading = false;
          }
        }

        streamedContent += chunk.chunk;

        // Send only the new chunk to UI for incremental updates
        this.events.onStreamingUpdate(aiMessageId, chunk.chunk, false, true);
      }

      // Extract tool calls when available
      if (chunk.toolCalls) {
        toolCalls = chunk.toolCalls;

        // Emit tool calls event for final chunk
        if (chunk.complete) {
          this.events.onToolCallsDetected(aiMessageId, toolCalls);
        }
      }

      // Handle completion
      if (chunk.complete) {
        // Check if this is TRULY the final complete
        const hasToolCalls = toolCalls && toolCalls.length > 0;
        const toolCallsHaveResults = hasToolCalls && toolCalls!.some((tc: any) =>
          tc.result !== undefined || tc.success !== undefined
        );
        const isFinalComplete = !hasToolCalls || toolCallsHaveResults;

        if (isFinalComplete) {
          // Update conversation with final content
          const placeholderMessageIndex = conversation.messages.findIndex(msg => msg.id === aiMessageId);
          if (placeholderMessageIndex >= 0) {
            conversation.messages[placeholderMessageIndex] = {
              ...conversation.messages[placeholderMessageIndex],
              content: streamedContent,
              state: 'complete',
              toolCalls: toolCalls
            };
          }

          // Send final complete content
          this.events.onStreamingUpdate(aiMessageId, streamedContent, true, false);
          break;
        } else {
          // Intermediate complete - waiting for tool execution results
        }
      }
    }

    return { streamedContent, toolCalls };
  }

  /**
   * Stream response and save to storage
   * Convenience method that combines streaming and saving
   */
  async streamAndSave(
    conversation: ConversationData,
    userMessageContent: string,
    aiMessageId: string,
    options: StreamOptions
  ): Promise<StreamResult> {
    const result = await this.streamResponse(conversation, userMessageContent, aiMessageId, options);

    // Save conversation to storage
    await this.chatService.updateConversation(conversation);

    return result;
  }
}
