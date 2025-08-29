/**
 * MessageManager - Handles all message operations including sending, editing, retry, and streaming
 */

import { ChatService } from '../../../services/chat/ChatService';
import { ConversationData, ConversationMessage } from '../../../types/chat/ChatTypes';

export interface MessageManagerEvents {
  onMessageAdded: (message: ConversationMessage) => void;
  onStreamingUpdate: (messageId: string, content: string, isComplete: boolean) => void;
  onConversationUpdated: (conversation: ConversationData) => void;
  onLoadingStateChanged: (isLoading: boolean) => void;
  onError: (message: string) => void;
  onToolCallsDetected: (messageId: string, toolCalls: any[]) => void;
  onToolExecutionStarted: (messageId: string, toolCall: { id: string; name: string; parameters?: any }) => void;
  onToolExecutionCompleted: (messageId: string, toolId: string, result: any, success: boolean, error?: string) => void;
}

export class MessageManager {
  private isLoading = false;

  constructor(
    private chatService: ChatService,
    private events: MessageManagerEvents
  ) {}

  /**
   * Get current loading state
   */
  getIsLoading(): boolean {
    return this.isLoading;
  }

  /**
   * Send a message in a conversation
   */
  async sendMessage(
    conversation: ConversationData,
    message: string,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
    }
  ): Promise<void> {
    try {
      this.setLoading(true);

      // 1. Add user message immediately and show it
      const userMessage: ConversationMessage = {
        id: `msg_${Date.now()}_user`,
        role: 'user' as const,
        content: message,
        timestamp: Date.now()
      };
      
      // Add user message to conversation and notify
      conversation.messages.push(userMessage);
      this.events.onConversationUpdated(conversation);
      
      // 2. Create placeholder AI message with loading animation
      const aiMessageId = `msg_${Date.now()}_ai`;
      const placeholderAiMessage: ConversationMessage = {
        id: aiMessageId,
        role: 'assistant' as const,
        content: '',
        timestamp: Date.now(),
        isLoading: true
      };
      
      // Add placeholder AI message
      conversation.messages.push(placeholderAiMessage);
      this.events.onConversationUpdated(conversation);

      // 3. Stream AI response
      try {
        // First add the user message to repository
        await this.chatService.addMessage({
          conversationId: conversation.id,
          role: 'user',
          content: message
        });

        let streamedContent = '';
        let toolCalls: any[] | undefined = undefined;

        // Stream the AI response
        for await (const chunk of this.chatService.generateResponseStreaming(
          conversation.id,
          message,
          conversation,
          {
            provider: options?.provider,
            model: options?.model,
            systemPrompt: options?.systemPrompt,
            messageId: aiMessageId // Pass the placeholder messageId for UI consistency
          }
        )) {
          
          // For token chunks, add to accumulated content
          if (chunk.chunk) {
            streamedContent += chunk.chunk;
          }

          // Extract tool calls when available
          if (chunk.toolCalls) {
            toolCalls = chunk.toolCalls;
            console.log('[MessageManager] Tool calls received in message:', {
              messageId: aiMessageId,
              toolCallCount: toolCalls.length,
              toolNames: toolCalls.map(tc => tc.name || tc.function?.name).filter(Boolean)
            });
            
          }

          // Update the placeholder message in conversation data
          const placeholderMessageIndex = conversation.messages.findIndex(msg => msg.id === aiMessageId);
          if (placeholderMessageIndex >= 0) {
            conversation.messages[placeholderMessageIndex] = {
              ...conversation.messages[placeholderMessageIndex],
              content: streamedContent,
              tool_calls: toolCalls, // Include tool calls in the message
              isLoading: !chunk.complete
            };
          }

          // Emit event when tool calls are detected for live UI updates (AFTER message is updated)
          if (toolCalls) {
            console.log('[MessageManager DEBUG] About to emit onToolCallsDetected event:', {
              messageId: aiMessageId,
              hasEventHandler: !!this.events.onToolCallsDetected,
              toolCallsData: toolCalls,
              messageUpdated: placeholderMessageIndex >= 0
            });
            this.events.onToolCallsDetected(aiMessageId, toolCalls);
            console.log('[MessageManager DEBUG] onToolCallsDetected event emitted');
          }

          // Notify about streaming update
          this.events.onStreamingUpdate(aiMessageId, streamedContent, !chunk.complete);

          if (chunk.complete) {
            // Save the final AI message to database (ChatService already handles tool calls)
            // No need to save again here as ChatService saves it in generateResponseStreaming
            
            // Final conversation update
            this.events.onConversationUpdated(conversation);
            break;
          }
        }

      } catch (sendError) {
        console.error('[MessageManager] Error during streaming:', sendError);
        this.events.onError('Failed to send message');
        this.removeLoadingMessage(conversation, aiMessageId);
        throw sendError;
      }
    } catch (error) {
      console.error('[MessageManager] Failed to send message:', error);
      this.events.onError('Failed to send message');
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Handle retry message action
   */
  async handleRetryMessage(
    conversation: ConversationData,
    messageId: string,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
    }
  ): Promise<void> {
    const message = conversation.messages.find(msg => msg.id === messageId);
    if (!message) return;
    
    // For user messages, just resend the content
    if (message.role === 'user') {
      await this.sendMessage(conversation, message.content, options);
    }
    // For AI messages, get the previous user message and regenerate
    else if (message.role === 'assistant') {
      const messageIndex = conversation.messages.findIndex(msg => msg.id === messageId);
      if (messageIndex > 0) {
        const previousUserMessage = conversation.messages[messageIndex - 1];
        if (previousUserMessage.role === 'user') {
          // Remove the AI response and regenerate
          conversation.messages = conversation.messages.slice(0, messageIndex);
          await this.chatService.updateConversation(conversation);
          await this.sendMessage(conversation, previousUserMessage.content, options);
        }
      }
    }
  }

  /**
   * Handle edit message action
   */
  async handleEditMessage(
    conversation: ConversationData,
    messageId: string,
    newContent: string,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
    }
  ): Promise<void> {
    const messageIndex = conversation.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;
    
    // Update the message content
    conversation.messages[messageIndex].content = newContent;
    
    // If this was a user message followed by AI responses, remove subsequent AI messages
    if (conversation.messages[messageIndex].role === 'user') {
      // Remove all messages after this one (they're now invalid)
      conversation.messages = conversation.messages.slice(0, messageIndex + 1);
    }
    
    // Update the conversation in storage
    await this.chatService.updateConversation(conversation);
    
    // Notify about conversation update
    this.events.onConversationUpdated(conversation);
    
    // If this was a user message, automatically regenerate the response
    if (conversation.messages[messageIndex].role === 'user') {
      await this.sendMessage(conversation, newContent, options);
    }
  }

  /**
   * Add a user message for optimistic updates
   */
  addUserMessage(conversation: ConversationData, content: string): void {
    const message: ConversationMessage = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now()
    };
    
    conversation.messages.push(message);
    this.events.onMessageAdded(message);
  }

  /**
   * Remove loading message from conversation
   */
  private removeLoadingMessage(conversation: ConversationData, messageId: string): void {
    console.log(`[MessageManager] Removing loading message: ${messageId}`);
    
    const messageIndex = conversation.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex >= 0) {
      conversation.messages.splice(messageIndex, 1);
      this.events.onConversationUpdated(conversation);
    }
  }

  /**
   * Set loading state and notify
   */
  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.events.onLoadingStateChanged(loading);
  }
}