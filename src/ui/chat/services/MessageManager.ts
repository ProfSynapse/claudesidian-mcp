/**
 * MessageManager - Handles all message operations including sending, editing, retry, and streaming
 */

import { ChatService } from '../../../services/chat/ChatService';
import { ConversationData, ConversationMessage } from '../../../types/chat/ChatTypes';
import { BranchManager } from './BranchManager';

export interface MessageManagerEvents {
  onMessageAdded: (message: ConversationMessage) => void;
  onAIMessageStarted: (message: ConversationMessage) => void;
  onStreamingUpdate: (messageId: string, content: string, isComplete: boolean, isIncremental?: boolean) => void;
  onConversationUpdated: (conversation: ConversationData) => void;
  onLoadingStateChanged: (isLoading: boolean) => void;
  onError: (message: string) => void;
  onToolCallsDetected: (messageId: string, toolCalls: any[]) => void;
  onToolExecutionStarted: (messageId: string, toolCall: { id: string; name: string; parameters?: any }) => void;
  onToolExecutionCompleted: (messageId: string, toolId: string, result: any, success: boolean, error?: string) => void;
  onMessageIdUpdated: (oldId: string, newId: string, updatedMessage: ConversationMessage) => void;
}

export class MessageManager {
  private isLoading = false;

  constructor(
    private chatService: ChatService,
    private branchManager: BranchManager,
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
        timestamp: Date.now(),
        conversationId: conversation.id
      };
      
      // Add user message to conversation and display immediately (progressive updates only)
      conversation.messages.push(userMessage);
      this.events.onMessageAdded(userMessage);
      
      // 2. Create placeholder AI message with loading animation
      const aiMessageId = `msg_${Date.now()}_ai`;
      const placeholderAiMessage: ConversationMessage = {
        id: aiMessageId,
        role: 'assistant' as const,
        content: '',
        timestamp: Date.now(),
        conversationId: conversation.id
      };
      
      // Add placeholder AI message and create bubble for streaming
      conversation.messages.push(placeholderAiMessage);
      this.events.onAIMessageStarted(placeholderAiMessage);

      // 3. Stream AI response
      try {
        // First add the user message to repository
        const userMessageResult = await this.chatService.addMessage({
          conversationId: conversation.id,
          role: 'user',
          content: message
        });
        
        // Update the temporary user message with the real ID from repository
        console.log('[MessageManager] addMessage result:', userMessageResult);
        if (userMessageResult.success && userMessageResult.messageId) {
          const tempMessageIndex = conversation.messages.findIndex(msg => msg.id === userMessage.id);
          console.log('[MessageManager] Looking for temp message:', {
            tempId: userMessage.id,
            found: tempMessageIndex >= 0,
            conversationMessageCount: conversation.messages.length
          });
          if (tempMessageIndex >= 0) {
            const oldId = conversation.messages[tempMessageIndex].id;
            conversation.messages[tempMessageIndex].id = userMessageResult.messageId;
            
            // Also update the original userMessage object that UI components reference
            userMessage.id = userMessageResult.messageId;
            
            console.log('[MessageManager] Updated temp message ID:', {
              from: oldId,
              to: userMessageResult.messageId,
              messageIndex: tempMessageIndex,
              userMessageIdAlsoUpdated: true
            });
            
            // Notify UI about message ID update so MessageBubble can update its reference
            console.log('[MessageManager] EMITTING onMessageIdUpdated event:', {
              oldId,
              newId: userMessageResult.messageId,
              updatedMessageId: userMessage.id,
              eventExists: !!this.events.onMessageIdUpdated
            });
            this.events.onMessageIdUpdated(oldId, userMessageResult.messageId, userMessage);
          }
        } else {
          console.log('[MessageManager] Failed to get real message ID from repository');
        }

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
          
          // For token chunks, add to accumulated content AND emit incremental update
          if (chunk.chunk) {
            // Real-time chunk received - send to UI immediately
            
            streamedContent += chunk.chunk;
            
            // Send only the new chunk to UI for incremental updates
            this.events.onStreamingUpdate(aiMessageId, chunk.chunk, false, true); // isComplete = false, isIncremental = true
          }

          // Extract tool calls when available
          if (chunk.toolCalls) {
            toolCalls = chunk.toolCalls;
            
            // Only emit tool calls event for final chunk to avoid duplication
            if (chunk.complete) {
                this.events.onToolCallsDetected(aiMessageId, toolCalls);
            }
          }

          if (chunk.complete) {
            // Update conversation with final accumulated content
            const placeholderMessageIndex = conversation.messages.findIndex(msg => msg.id === aiMessageId);
            if (placeholderMessageIndex >= 0) {
              conversation.messages[placeholderMessageIndex] = {
                ...conversation.messages[placeholderMessageIndex],
                content: streamedContent,
                toolCalls: toolCalls
              };
            }
            
            // Send final complete content for any final processing
            this.events.onStreamingUpdate(aiMessageId, streamedContent, true, false); // isComplete = true, isIncremental = false
            // Streaming complete - conversation updated without re-render
            break;
          }
        }

      } catch (sendError) {
        this.events.onError('Failed to send message');
        this.removeLoadingMessage(conversation, aiMessageId);
        throw sendError;
      }
    } catch (error) {
      this.events.onError('Failed to send message');
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Handle retry message action - creates message-level alternatives
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
    
    try {
      console.log('[MessageManager] Handling retry for message:', { messageId, role: message.role });

      // For user messages, regenerate the AI response
      if (message.role === 'user') {
        await this.regenerateAIResponse(conversation, messageId, options);
      }
      // For AI messages, create an alternative response
      else if (message.role === 'assistant') {
        await this.createAlternativeAIResponse(conversation, messageId, options);
      }

      // Notify that conversation was updated
      this.events.onConversationUpdated(conversation);
      
    } catch (error) {
      console.error('[MessageManager] Failed to handle retry:', error);
      this.events.onError('Failed to retry message');
    }
  }

  /**
   * Regenerate AI response for a user message (creates alternative in following AI message)
   */
  private async regenerateAIResponse(
    conversation: ConversationData,
    userMessageId: string,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
    }
  ): Promise<void> {
    const userMessage = conversation.messages.find(msg => msg.id === userMessageId);
    if (!userMessage || userMessage.role !== 'user') return;

    // Find the AI message that follows this user message
    const userMessageIndex = conversation.messages.findIndex(msg => msg.id === userMessageId);
    if (userMessageIndex === -1) return;

    const aiMessageIndex = userMessageIndex + 1;
    const aiMessage = conversation.messages[aiMessageIndex];
    
    if (aiMessage && aiMessage.role === 'assistant') {
      // Create alternative for existing AI message
      await this.createAlternativeAIResponse(conversation, aiMessage.id, options);
    } else {
      // No AI response exists, generate a new one
      await this.sendMessage(conversation, userMessage.content, options);
    }
  }

  /**
   * Create an alternative response for an AI message
   */
  private async createAlternativeAIResponse(
    conversation: ConversationData,
    aiMessageId: string,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
    }
  ): Promise<void> {
    const aiMessage = conversation.messages.find(msg => msg.id === aiMessageId);
    if (!aiMessage || aiMessage.role !== 'assistant') return;

    // Find the user message that prompted this AI response
    const aiMessageIndex = conversation.messages.findIndex(msg => msg.id === aiMessageId);
    if (aiMessageIndex === 0) return; // No previous message

    const userMessage = conversation.messages[aiMessageIndex - 1];
    if (!userMessage || userMessage.role !== 'user') return;

    try {
      this.setLoading(true);

      // Reset the existing AI message to loading state by clearing its content
      this.events.onStreamingUpdate(aiMessageId, '', false, false);

      // Generate new AI response with streaming
      let streamedContent = '';
      let toolCalls: any[] | undefined = undefined;

      for await (const chunk of this.chatService.generateResponseStreaming(
        conversation.id,
        userMessage.content,
        conversation,
        {
          provider: options?.provider,
          model: options?.model,
          systemPrompt: options?.systemPrompt
        }
      )) {
        if (chunk.chunk) {
          streamedContent += chunk.chunk;
          // Stream only the new chunk to the UI in real-time (not accumulated content)
          this.events.onStreamingUpdate(aiMessageId, chunk.chunk, false, true);
        }
        if (chunk.toolCalls) {
          toolCalls = chunk.toolCalls;
        }
        if (chunk.complete) {
          // Final streaming update
          this.events.onStreamingUpdate(aiMessageId, streamedContent, true, false);
          break;
        }
      }

      // Create alternative response
      const alternativeResponse: ConversationMessage = {
        id: `alt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
        role: 'assistant',
        content: streamedContent,
        timestamp: Date.now(),
        conversationId: conversation.id,
        toolCalls: toolCalls
      };

      // Add alternative using BranchManager
      const alternativeIndex = await this.branchManager.createMessageAlternative(
        conversation,
        aiMessageId,
        alternativeResponse
      );

      console.log('[MessageManager] Created alternative response:', { aiMessageId, alternativeIndex });

    } catch (error) {
      console.error('[MessageManager] Failed to create alternative response:', error);
      this.events.onError('Failed to generate alternative response');
    } finally {
      this.setLoading(false);
    }
  }

  // Removed legacy sendMessageToBranch method - using message-level alternatives now


  /**
   * Handle edit message action - ONLY updates content, does NOT regenerate
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
    
    // Update ONLY the message content
    conversation.messages[messageIndex].content = newContent;
    
    // Update the conversation in storage
    await this.chatService.updateConversation(conversation);
    
    // Notify about conversation update so UI can refresh
    this.events.onConversationUpdated(conversation);
    
    // That's it! No auto-regeneration - user must click retry if they want to branch
  }

  /**
   * Add a user message for optimistic updates
   */
  addUserMessage(conversation: ConversationData, content: string): void {
    const message: ConversationMessage = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      conversationId: conversation.id
    };
    
    conversation.messages.push(message);
    this.events.onMessageAdded(message);
  }

  /**
   * Remove loading message from conversation
   */
  private removeLoadingMessage(conversation: ConversationData, messageId: string): void {
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