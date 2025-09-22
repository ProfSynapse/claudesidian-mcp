/**
 * BranchManager - Handles message-level alternative operations
 * 
 * Manages creating and switching between alternative responses for individual messages
 * instead of conversation-level branching.
 */

// import { ConversationRepository } from '../../../database/services/chat/ConversationRepository';
type ConversationRepository = any;
import { ConversationData, ConversationMessage } from '../../../types/chat/ChatTypes';

export interface BranchManagerEvents {
  onMessageAlternativeCreated: (messageId: string, alternativeIndex: number) => void;
  onMessageAlternativeSwitched: (messageId: string, alternativeIndex: number) => void;
  onError: (message: string) => void;
}

export class BranchManager {
  constructor(
    private conversationRepo: ConversationRepository,
    private events: BranchManagerEvents
  ) {}

  /**
   * Create an alternative response for a specific message
   */
  async createMessageAlternative(
    conversation: ConversationData,
    messageId: string,
    alternativeResponse: ConversationMessage
  ): Promise<number | null> {
    try {
      console.log('[BranchManager] Creating message alternative:', {
        conversationId: conversation.id,
        messageId,
        alternativeContent: alternativeResponse.content.substring(0, 50) + '...'
      });

      // Find the message in the conversation
      const messageIndex = conversation.messages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) {
        console.error('[BranchManager] Message not found:', messageId);
        return null;
      }

      const message = conversation.messages[messageIndex];
      
      // Initialize alternatives array if it doesn't exist
      if (!message.alternatives) {
        message.alternatives = [];
      }

      // Add the new alternative
      message.alternatives.push(alternativeResponse);
      const alternativeIndex = message.alternatives.length - 1;

      // Set the new alternative as active
      message.activeAlternativeIndex = alternativeIndex + 1; // +1 because 0 is the original message

      // Save the updated conversation to repository
      await this.conversationRepo.updateConversation(conversation.id, { messages: conversation.messages });

      console.log('[BranchManager] Message alternative created successfully:', {
        messageId,
        alternativeIndex: alternativeIndex + 1,
        totalAlternatives: message.alternatives.length + 1 // +1 for original
      });

      this.events.onMessageAlternativeCreated(messageId, alternativeIndex + 1);
      return alternativeIndex + 1;

    } catch (error) {
      console.error('[BranchManager] Failed to create message alternative:', error);
      this.events.onError('Failed to create alternative response');
      return null;
    }
  }

  /**
   * Switch to a specific alternative for a message
   */
  async switchToMessageAlternative(
    conversation: ConversationData,
    messageId: string,
    alternativeIndex: number
  ): Promise<boolean> {
    try {
      console.log('[BranchManager] Switching message alternative:', {
        conversationId: conversation.id,
        messageId,
        alternativeIndex
      });

      // Find the message in the conversation
      const messageIndex = conversation.messages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) {
        console.error('[BranchManager] Message not found:', messageId);
        return false;
      }

      const message = conversation.messages[messageIndex];
      const totalAlternatives = this.getMessageAlternativeCount(message);

      // Validate alternative index
      if (alternativeIndex < 0 || alternativeIndex >= totalAlternatives) {
        console.error('[BranchManager] Invalid alternative index:', { alternativeIndex, totalAlternatives });
        return false;
      }

      // Update the active alternative index
      message.activeAlternativeIndex = alternativeIndex;

      // Save the updated conversation to repository
      await this.conversationRepo.updateConversation(conversation.id, { messages: conversation.messages });

      console.log('[BranchManager] Switched to message alternative:', {
        messageId,
        alternativeIndex,
        totalAlternatives
      });

      // Don't emit event here - ChatView handles this directly to avoid recursion
      return true;

    } catch (error) {
      console.error('[BranchManager] Failed to switch message alternative:', error);
      this.events.onError('Failed to switch to alternative response');
      return false;
    }
  }

  /**
   * Get the currently active message content (original or alternative)
   */
  getActiveMessageContent(message: ConversationMessage): string {
    const activeIndex = message.activeAlternativeIndex || 0;
    
    // Index 0 is the original message
    if (activeIndex === 0) {
      return message.content;
    }

    // Alternative indices are 1-based, so subtract 1 to get array index
    const alternativeArrayIndex = activeIndex - 1;
    if (message.alternatives && alternativeArrayIndex < message.alternatives.length) {
      return message.alternatives[alternativeArrayIndex].content;
    }

    // Fallback to original content if alternative not found
    return message.content;
  }

  /**
   * Get the currently active message tool calls
   */
  getActiveMessageToolCalls(message: ConversationMessage): any[] | undefined {
    const activeIndex = message.activeAlternativeIndex || 0;
    
    // Index 0 is the original message
    if (activeIndex === 0) {
      return message.tool_calls;
    }

    // Alternative indices are 1-based, so subtract 1 to get array index
    const alternativeArrayIndex = activeIndex - 1;
    if (message.alternatives && alternativeArrayIndex < message.alternatives.length) {
      return message.alternatives[alternativeArrayIndex].tool_calls;
    }

    // Fallback to original tool calls if alternative not found
    return message.tool_calls;
  }

  /**
   * Get alternative information for a message
   */
  getMessageAlternativeInfo(message: ConversationMessage): { current: number; total: number; hasAlternatives: boolean } {
    const activeIndex = message.activeAlternativeIndex || 0;
    const totalAlternatives = this.getMessageAlternativeCount(message);
    
    return {
      current: activeIndex + 1, // 1-based for display
      total: totalAlternatives,
      hasAlternatives: totalAlternatives > 1
    };
  }

  /**
   * Get total alternative count for a message (including original)
   */
  private getMessageAlternativeCount(message: ConversationMessage): number {
    const alternativesCount = message.alternatives?.length || 0;
    return alternativesCount + 1; // +1 for the original message
  }

  /**
   * Check if a message has alternatives
   */
  hasMessageAlternatives(message: ConversationMessage): boolean {
    return !!(message.alternatives && message.alternatives.length > 0);
  }

  /**
   * Get all alternatives for a message (including original as index 0)
   */
  getAllMessageAlternatives(message: ConversationMessage): ConversationMessage[] {
    const alternatives: ConversationMessage[] = [message]; // Original message at index 0
    
    if (message.alternatives) {
      alternatives.push(...message.alternatives);
    }
    
    return alternatives;
  }

  /**
   * Get the previous alternative index for navigation
   */
  getPreviousAlternativeIndex(message: ConversationMessage): number | null {
    const currentIndex = message.activeAlternativeIndex || 0;
    return currentIndex > 0 ? currentIndex - 1 : null;
  }

  /**
   * Get the next alternative index for navigation
   */
  getNextAlternativeIndex(message: ConversationMessage): number | null {
    const currentIndex = message.activeAlternativeIndex || 0;
    const totalCount = this.getMessageAlternativeCount(message);
    return currentIndex < totalCount - 1 ? currentIndex + 1 : null;
  }
}