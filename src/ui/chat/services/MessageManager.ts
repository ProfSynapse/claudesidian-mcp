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
  onGenerationAborted: (messageId: string, partialContent: string) => void;
}

export class MessageManager {
  private isLoading = false;
  private currentAbortController: AbortController | null = null;
  private currentStreamingMessageId: string | null = null;

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
      workspaceId?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    // Declare aiMessageId in function scope so catch block can access it
    let aiMessageId: string | null = null;

    try {
      console.log('[MessageManager] ========== SENDING MESSAGE ==========');
      console.log('[MessageManager] Message:', message);
      console.log('[MessageManager] Options:', options);
      console.log('[MessageManager] ==========================================');

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
      aiMessageId = `msg_${Date.now()}_ai`;
      const placeholderAiMessage: ConversationMessage = {
        id: aiMessageId,
        role: 'assistant' as const,
        content: '',
        timestamp: Date.now(),
        conversationId: conversation.id,
        isLoading: true
      };
      
      // Add placeholder AI message and create bubble for streaming
      conversation.messages.push(placeholderAiMessage);
      this.events.onAIMessageStarted(placeholderAiMessage);

      // 3. Stream AI response
      try {
        // Create abort controller for this request
        this.currentAbortController = new AbortController();
        this.currentStreamingMessageId = aiMessageId;

        // First add the user message to repository
        const userMessageResult = await this.chatService.addMessage({
          conversationId: conversation.id,
          role: 'user',
          content: message
        });

        // Update the temporary user message with the real ID from repository
        if (userMessageResult.success && userMessageResult.messageId) {
          const tempMessageIndex = conversation.messages.findIndex(msg => msg.id === userMessage.id);
          if (tempMessageIndex >= 0) {
            const oldId = conversation.messages[tempMessageIndex].id;
            conversation.messages[tempMessageIndex].id = userMessageResult.messageId;

            // Also update the original userMessage object that UI components reference
            userMessage.id = userMessageResult.messageId;

            // Notify UI about message ID update so MessageBubble can update its reference
            this.events.onMessageIdUpdated(oldId, userMessageResult.messageId, userMessage);
          }
        }

        let streamedContent = '';
        let toolCalls: any[] | undefined = undefined;

        // Stream the AI response (conversation will be loaded from storage inside the method)
        for await (const chunk of this.chatService.generateResponseStreaming(
          conversation.id,
          message,
          {
            provider: options?.provider,
            model: options?.model,
            systemPrompt: options?.systemPrompt,
            workspaceId: options?.workspaceId, // ✅ Pass workspace ID for tool context
            sessionId: options?.sessionId, // ✅ CRITICAL: Pass session ID for tool context
            messageId: aiMessageId, // Pass the placeholder messageId for UI consistency
            abortSignal: this.currentAbortController.signal
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
            // Check if this is TRULY the final complete (tool calls have results, or no tool calls)
            const hasToolCalls = toolCalls && toolCalls.length > 0;
            const toolCallsHaveResults = hasToolCalls && toolCalls!.some((tc: any) =>
              tc.result !== undefined || tc.success !== undefined
            );
            const isFinalComplete = !hasToolCalls || toolCallsHaveResults;

            if (isFinalComplete) {
              // This is the FINAL complete - either no tools or tools with results
              // Update conversation with final accumulated content AND tool calls with results
              const placeholderMessageIndex = conversation.messages.findIndex(msg => msg.id === aiMessageId);
              if (placeholderMessageIndex >= 0) {
                conversation.messages[placeholderMessageIndex] = {
                  ...conversation.messages[placeholderMessageIndex],
                  content: streamedContent,
                  toolCalls: toolCalls  // Include tool calls with execution results
                };
              }

              // CRITICAL: Save conversation to storage BEFORE reloading
              // This ensures tool calls with results are persisted
              await this.chatService.updateConversation(conversation);

              // Send final complete content for any final processing
              this.events.onStreamingUpdate(aiMessageId, streamedContent, true, false); // isComplete = true, isIncremental = false
              // Streaming complete - conversation updated without re-render
              break;
            } else {
              // This is an intermediate complete (tools detected but not yet executed)
              // Continue listening for the final complete with tool results
              console.log('[MessageManager] Intermediate complete - waiting for tool execution results');
            }
          }
        }

        // After streaming completes, reload conversation from storage to sync with saved messages
        const freshConversation = await this.chatService.getConversation(conversation.id);
        if (freshConversation) {
          // Update the conversation object with fresh data
          Object.assign(conversation, freshConversation);
        }

        // Notify that conversation has been updated
        this.events.onConversationUpdated(conversation);

      } catch (sendError) {
        this.events.onError('Failed to send message');
        this.removeLoadingMessage(conversation, aiMessageId);
        throw sendError;
      }
    } catch (error) {
      // Check if this was an abort (user clicked stop)
      if (error instanceof Error && error.name === 'AbortError') {
        if (aiMessageId) {
          // Save the partial AI message to conversation history
          const aiMessageIndex = conversation.messages.findIndex(msg => msg.id === aiMessageId);
          if (aiMessageIndex >= 0) {
            const partialContent = conversation.messages[aiMessageIndex].content;

            // Mark as not loading anymore
            conversation.messages[aiMessageIndex].isLoading = false;

            // Save conversation with partial message
            await this.chatService.updateConversation(conversation);

            // Finalize streaming with partial content (stops animation, renders final content)
            this.events.onStreamingUpdate(aiMessageId, partialContent, true, false);

            // Update UI to show final partial message
            this.events.onConversationUpdated(conversation);
          }
        }
      } else {
        this.events.onError('Failed to send message');
      }
    } finally {
      this.currentAbortController = null;
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
      workspaceId?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    const message = conversation.messages.find(msg => msg.id === messageId);
    if (!message) return;

    try {
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
      workspaceId?: string;
      sessionId?: string;
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
      workspaceId?: string;
      sessionId?: string;
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

      // Generate new AI response with streaming (conversation loaded from storage inside the method)
      let streamedContent = '';
      let toolCalls: any[] | undefined = undefined;

      for await (const chunk of this.chatService.generateResponseStreaming(
        conversation.id,
        userMessage.content,
        {
          provider: options?.provider,
          model: options?.model,
          systemPrompt: options?.systemPrompt,
          workspaceId: options?.workspaceId, // ✅ Pass workspace ID for tool context
          sessionId: options?.sessionId // ✅ Pass session ID for tool context
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

    } catch (error) {
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
      workspaceId?: string;
      sessionId?: string;
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
   * Cancel current generation (abort streaming) - immediate kill switch
   */
  cancelCurrentGeneration(): void {
    if (this.currentAbortController && this.currentStreamingMessageId) {
      const messageId = this.currentStreamingMessageId;

      // Immediately abort the stream
      this.currentAbortController.abort();
      this.currentAbortController = null;
      this.currentStreamingMessageId = null;

      // Immediately reset loading state so UI updates instantly
      this.setLoading(false);

      // Fire immediate abort event to stop UI animations NOW
      this.events.onGenerationAborted(messageId, '');
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