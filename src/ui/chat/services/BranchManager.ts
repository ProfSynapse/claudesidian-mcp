/**
 * BranchManager - Handles message-level alternative operations
 * 
 * Manages creating and switching between alternative responses for individual messages
 * instead of conversation-level branching.
 */

// import { ConversationRepository } from '../../../database/services/chat/ConversationRepository';
type ConversationRepository = any;
import { ConversationData, ConversationMessage, MessageAlternativeBranch } from '../../../types/chat/ChatTypes';

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
      // Find the message in the conversation
      const messageIndex = conversation.messages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) {
        console.error('[BranchManager] Message not found:', messageId);
        return null;
      }

      const message = conversation.messages[messageIndex];

      const legacyIndex = this.upsertLegacyAlternative(message, alternativeResponse);
      const branchIndex = this.upsertBranchFromAlternative(message, alternativeResponse, messageId);

      // Set the new alternative as active
      message.activeAlternativeIndex = branchIndex + 1; // +1 because 0 is the original message
      message.activeAlternativeId = alternativeResponse.id;

      // Save the updated conversation to repository
      await this.conversationRepo.updateConversation(conversation.id, { messages: conversation.messages });

      this.events.onMessageAlternativeCreated(messageId, legacyIndex + 1);
      return legacyIndex + 1;

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
      if (alternativeIndex === 0) {
        message.activeAlternativeId = undefined;
      } else {
        const branch = this.getBranchByLegacyIndex(message, alternativeIndex);
        message.activeAlternativeId = branch?.id;
      }

      // Save the updated conversation to repository
      await this.conversationRepo.updateConversation(conversation.id, { messages: conversation.messages });

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
    const activeBranch = this.getActiveBranch(message);
    if (activeBranch) {
      return activeBranch.content || '';
    }
    // If no active branch, return original content
    return message.content;
  }

  /**
   * Get the currently active message tool calls
   */
  getActiveMessageToolCalls(message: ConversationMessage): any[] | undefined {
    const activeBranch = this.getActiveBranch(message);
    if (activeBranch) {
      return activeBranch.toolCalls;
    }
    // If no active branch, return original tool calls
    return message.toolCalls;
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
    if (message.alternativeBranches && message.alternativeBranches.length > 0) {
      return message.alternativeBranches.length + 1;
    }
    // No alternatives - just the original message
    return 1;
  }

  /**
   * Check if a message has alternatives
   */
  hasMessageAlternatives(message: ConversationMessage): boolean {
    return !!(message.alternativeBranches && message.alternativeBranches.length > 0);
  }

  /**
   * Get all alternatives for a message (including original as index 0)
   */
  getAllMessageAlternatives(message: ConversationMessage): ConversationMessage[] {
    const alternatives: ConversationMessage[] = [message];
    if (message.alternativeBranches && message.alternativeBranches.length > 0) {
      for (const branch of message.alternativeBranches) {
        alternatives.push(this.convertBranchToMessage(branch, message));
      }
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

  /**
   * DEPRECATED: Legacy helper - no longer used
   * Kept for backwards compatibility during migration period
   */
  private upsertLegacyAlternative(message: ConversationMessage, alternative: ConversationMessage): number {
    console.warn('[BranchManager] DEPRECATED: upsertLegacyAlternative called - should not be used');
    return 0;
  }

  /**
   * Sync alternativeResponse into branch data structure
   */
  private upsertBranchFromAlternative(
    message: ConversationMessage,
    alternative: ConversationMessage,
    parentMessageId: string
  ): number {
    if (!message.alternativeBranches) {
      message.alternativeBranches = [];
    }

    const branch: MessageAlternativeBranch = {
      id: alternative.id,
      parentMessageId,
      status: alternative.state === 'aborted' ? 'aborted' : 'complete',
      content: alternative.content,
      toolCalls: alternative.toolCalls,
      createdAt: alternative.timestamp || Date.now(),
      updatedAt: alternative.timestamp || Date.now(),
      metadata: alternative.metadata
    };

    const index = message.alternativeBranches.findIndex(b => b.id === branch.id);
    if (index >= 0) {
      message.alternativeBranches[index] = branch;
      return index;
    }
    message.alternativeBranches.push(branch);
    return message.alternativeBranches.length - 1;
  }

  private getBranchByLegacyIndex(message: ConversationMessage, legacyIndex: number): MessageAlternativeBranch | undefined {
    if (legacyIndex <= 0) return undefined;
    const targetIndex = legacyIndex - 1;
    if (message.alternativeBranches && message.alternativeBranches[targetIndex]) {
      return message.alternativeBranches[targetIndex];
    }
    // Legacy alternatives no longer supported
    return undefined;
  }

  private getActiveBranch(message: ConversationMessage): MessageAlternativeBranch | null {
    if (!message.activeAlternativeId || !message.alternativeBranches) {
      return null;
    }
    return message.alternativeBranches.find(branch => branch.id === message.activeAlternativeId) || null;
  }

  private convertBranchToMessage(branch: MessageAlternativeBranch, parent: ConversationMessage): ConversationMessage {
    return {
      id: branch.id,
      role: 'assistant',
      content: branch.content || '',
      timestamp: branch.updatedAt || branch.createdAt,
      conversationId: parent.conversationId,
      state: branch.status === 'complete' ? 'complete' : branch.status,
      toolCalls: branch.toolCalls,
      metadata: branch.metadata
    };
  }
}
