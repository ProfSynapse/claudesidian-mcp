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
        branchId: conversation.activeBranchId || conversation.mainBranchId || 'main'
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
        isLoading: true,
        branchId: conversation.activeBranchId || conversation.mainBranchId || 'main'
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
                tool_calls: toolCalls,
                isLoading: false
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
   * Handle retry message action with branching
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
      // Create new branch from the retry point
      const branchId = await this.branchManager.createBranchFromMessage(conversation, messageId);
      if (!branchId) {
        this.events.onError('Failed to create branch for retry');
        return;
      }

      // Switch to the new branch
      const switchSuccess = await this.branchManager.switchToBranch(conversation, branchId);
      if (!switchSuccess) {
        this.events.onError('Failed to switch to new branch');
        return;
      }

      // For user messages, resend the content in the new branch
      if (message.role === 'user') {
        await this.sendMessageToBranch(conversation, branchId, message.content, options);
      }
      // For AI messages, find the previous user message and regenerate
      else if (message.role === 'assistant') {
        const messageIndex = conversation.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex > 0) {
          const previousUserMessage = conversation.messages[messageIndex - 1];
          if (previousUserMessage.role === 'user') {
            await this.sendMessageToBranch(conversation, branchId, previousUserMessage.content, options);
          }
        }
      }

      // Notify that conversation structure changed due to branching
      this.events.onConversationUpdated(conversation);
      
    } catch (error) {
      console.error('[MessageManager] Failed to handle retry with branching:', error);
      this.events.onError('Failed to retry message');
    }
  }

  /**
   * Send message to a specific branch
   */
  private async sendMessageToBranch(
    conversation: ConversationData,
    branchId: string,
    content: string,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
    }
  ): Promise<void> {
    try {
      this.setLoading(true);

      // For retry, don't duplicate user message - just generate new AI response
      // Use branch-filtered messages for context
      const branchMessages = this.branchManager.getBranchMessages(conversation, branchId);
      
      console.log('[MessageManager] sendMessageToBranch - generating response for existing user message:', {
        branchId,
        content,
        branchMessageCount: branchMessages.length
      });

      // Create AI response placeholder for the branch
      const aiMessageId = `msg_${Date.now() + 1}_${Math.random().toString(36).substring(2, 10)}`;
      const aiMessage: ConversationMessage = {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isLoading: true,
        branchId: branchId
      };

      conversation.messages.push(aiMessage);
      this.events.onAIMessageStarted(aiMessage);

      // Send message with branch context using streaming
      const chatResponse = this.chatService.generateResponseStreaming(conversation.id, content, conversation, options);

      // Handle streaming response
      let streamedContent = '';
      let toolCalls: any[] = [];

      for await (const chunk of chatResponse) {
        if (chunk.chunk) {
          streamedContent += chunk.chunk;
          this.events.onStreamingUpdate(aiMessageId, streamedContent, false, true);
        }

        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          toolCalls.push(...chunk.toolCalls);
          this.events.onToolCallsDetected(aiMessageId, toolCalls);
        }

        if (chunk.complete) {
          // Update the message in the conversation
          const messageIndex = conversation.messages.findIndex(msg => msg.id === aiMessageId);
          if (messageIndex >= 0) {
            conversation.messages[messageIndex] = {
              ...conversation.messages[messageIndex],
              content: streamedContent,
              tool_calls: toolCalls,
              isLoading: false
            };
          }

          // Save the final message to repository with branch association
          try {
            await this.chatService.getConversationRepository().addMessageToBranch(
              conversation.id,
              branchId,
              {
                role: 'assistant',
                content: streamedContent,
                toolCalls: toolCalls
              }
            );
            console.log('[MessageManager] Successfully saved branch message:', { aiMessageId, branchId });
          } catch (error) {
            console.error('[MessageManager] Failed to save branch message:', error);
          }

          this.events.onStreamingUpdate(aiMessageId, streamedContent, true, false);
          break;
        }
      }

    } catch (error) {
      console.error('[MessageManager] Failed to send message to branch:', error);
      this.events.onError('Failed to send message');
    } finally {
      this.setLoading(false);
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
      timestamp: Date.now(),
      branchId: conversation.activeBranchId || conversation.mainBranchId || 'main'
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