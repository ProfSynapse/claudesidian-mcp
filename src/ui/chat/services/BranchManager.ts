/**
 * BranchManager - Handles conversation branching operations
 * 
 * Coordinates branch creation, switching, and management
 * between the UI and the ConversationRepository.
 */

import { ConversationRepository } from '../../../database/services/chat/ConversationRepository';
import { ConversationData, ConversationMessage } from '../../../types/chat/ChatTypes';

export interface BranchManagerEvents {
  onBranchCreated: (conversationId: string, branchId: string) => void;
  onBranchSwitched: (conversationId: string, branchId: string) => void;
  onError: (message: string) => void;
}

export interface BranchInfo {
  id: string;
  createdFrom: string;
  lastMessageId: string;
  isActive: boolean;
  messageCount: number;
}

export class BranchManager {
  constructor(
    private conversationRepo: ConversationRepository,
    private events: BranchManagerEvents
  ) {}

  /**
   * Create a new branch from a specific message
   */
  async createBranchFromMessage(
    conversation: ConversationData,
    fromMessageId: string
  ): Promise<string | null> {
    try {
      console.log('[BranchManager] Creating branch from message:', {
        conversationId: conversation.id,
        fromMessageId,
        currentActiveBranch: conversation.activeBranchId
      });

      const branchId = await this.conversationRepo.createBranch(conversation.id, fromMessageId);
      
      // Reload conversation from repository to get updated branch data
      const updatedConversation = await this.conversationRepo.getConversation(conversation.id);
      if (updatedConversation) {
        // Update the local conversation object with fresh data
        conversation.branches = updatedConversation.branches;
        conversation.mainBranchId = updatedConversation.mainBranchId;
        conversation.activeBranchId = updatedConversation.activeBranchId;
      }

      console.log('[BranchManager] Branch created, updated conversation:', {
        branchId,
        branchCount: Object.keys(conversation.branches || {}).length,
        activeBranchId: conversation.activeBranchId
      });

      this.events.onBranchCreated(conversation.id, branchId);
      return branchId;
    } catch (error) {
      console.error('[BranchManager] Failed to create branch:', error);
      this.events.onError('Failed to create branch');
      return null;
    }
  }

  /**
   * Switch to a different branch
   */
  async switchToBranch(conversation: ConversationData, branchId: string): Promise<boolean> {
    try {
      if (!conversation.branches?.[branchId]) {
        this.events.onError('Branch not found');
        return false;
      }

      console.log('[BranchManager] Switching to branch:', {
        conversationId: conversation.id,
        fromBranch: conversation.activeBranchId,
        toBranch: branchId
      });

      await this.conversationRepo.switchToBranch(conversation.id, branchId);

      // Reload conversation from repository to get updated branch data
      const updatedConversation = await this.conversationRepo.getConversation(conversation.id);
      if (updatedConversation) {
        // Update the local conversation object with fresh data
        conversation.branches = updatedConversation.branches;
        conversation.activeBranchId = updatedConversation.activeBranchId;
      }

      console.log('[BranchManager] Branch switched, updated conversation:', {
        branchId,
        activeBranchId: conversation.activeBranchId,
        branchCount: Object.keys(conversation.branches || {}).length
      });

      this.events.onBranchSwitched(conversation.id, branchId);
      return true;
    } catch (error) {
      console.error('[BranchManager] Failed to switch branch:', error);
      this.events.onError('Failed to switch branch');
      return false;
    }
  }

  /**
   * Get all branches for a conversation with metadata
   */
  getBranchesInfo(conversation: ConversationData): BranchInfo[] {
    if (!conversation.branches) {
      return [];
    }

    return Object.entries(conversation.branches).map(([branchId, branch]) => ({
      id: branchId,
      createdFrom: branch.createdFrom,
      lastMessageId: branch.lastMessageId,
      isActive: branch.isActive,
      messageCount: this.getBranchMessageCount(conversation, branchId)
    }));
  }

  /**
   * Get the currently active branch
   */
  getActiveBranch(conversation: ConversationData): BranchInfo | null {
    const branches = this.getBranchesInfo(conversation);
    return branches.find(branch => branch.isActive) || null;
  }

  /**
   * Get messages for the currently active branch
   */
  getActiveBranchMessages(conversation: ConversationData): ConversationMessage[] {
    const activeBranchId = conversation.activeBranchId || conversation.mainBranchId || 'main';
    return this.getBranchMessages(conversation, activeBranchId);
  }

  /**
   * Get messages for a specific branch
   */
  getBranchMessages(conversation: ConversationData, branchId: string): ConversationMessage[] {
    if (!conversation.branches?.[branchId]) {
      // Fallback for backward compatibility
      return conversation.messages;
    }

    const branch = conversation.branches[branchId];
    
    // For main branch, return messages that belong to main or have no branchId
    if (branchId === conversation.mainBranchId || branchId === 'main') {
      return conversation.messages.filter(msg => 
        !msg.branchId || msg.branchId === branchId || msg.branchId === 'main'
      );
    }

    // For other branches: messages up to branch point + branch-specific messages only
    const branchPointIndex = conversation.messages.findIndex(msg => msg.id === branch.createdFrom);
    if (branchPointIndex === -1) {
      console.warn('[BranchManager] Branch point message not found:', branch.createdFrom);
      return [];
    }

    // Include all messages up to and including the branch point
    const preBranchMessages = conversation.messages.slice(0, branchPointIndex + 1);
    
    // Include only messages that specifically belong to this branch
    const branchSpecificMessages = conversation.messages.filter(msg => msg.branchId === branchId);
    
    const result = [...preBranchMessages, ...branchSpecificMessages];
    
    console.log('[BranchManager] getBranchMessages result:', {
      branchId,
      branchPointIndex,
      preBranchCount: preBranchMessages.length,
      branchSpecificCount: branchSpecificMessages.length,
      totalCount: result.length,
      messageIds: result.map(m => m.id)
    });
    
    return result;
  }

  /**
   * Check if a conversation has multiple branches
   */
  hasMultipleBranches(conversation: ConversationData): boolean {
    return Object.keys(conversation.branches || {}).length > 1;
  }

  /**
   * Get the next available branch (for navigation)
   */
  getNextBranch(conversation: ConversationData): string | null {
    const branchIds = Object.keys(conversation.branches || {});
    if (branchIds.length <= 1) return null;

    const currentIndex = branchIds.indexOf(conversation.activeBranchId);
    const nextIndex = (currentIndex + 1) % branchIds.length;
    return branchIds[nextIndex];
  }

  /**
   * Get the previous available branch (for navigation)
   */
  getPreviousBranch(conversation: ConversationData): string | null {
    const branchIds = Object.keys(conversation.branches || {});
    if (branchIds.length <= 1) return null;

    const currentIndex = branchIds.indexOf(conversation.activeBranchId);
    const previousIndex = currentIndex <= 0 ? branchIds.length - 1 : currentIndex - 1;
    return branchIds[previousIndex];
  }

  /**
   * Get branch navigation info for UI display
   */
  getBranchNavigationInfo(conversation: ConversationData): { 
    current: number; 
    total: number; 
    hasMultiple: boolean; 
  } {
    this.initializeBranchesIfNeeded(conversation);
    const branchIds = Object.keys(conversation.branches || {});
    const currentIndex = branchIds.indexOf(conversation.activeBranchId);
    
    console.log('[BranchManager] Navigation info:', {
      branchIds,
      activeBranchId: conversation.activeBranchId,
      currentIndex,
      hasMultiple: branchIds.length > 1
    });
    
    return {
      current: Math.max(0, currentIndex) + 1,
      total: branchIds.length,
      hasMultiple: branchIds.length > 1
    };
  }

  /**
   * Initialize branches for backward compatibility
   */
  private initializeBranchesIfNeeded(conversation: ConversationData): void {
    if (!conversation.branches) {
      conversation.branches = {};
    }

    if (!conversation.mainBranchId) {
      conversation.mainBranchId = 'main';
      conversation.branches['main'] = {
        createdFrom: conversation.messages[0]?.id || '',
        lastMessageId: conversation.messages[conversation.messages.length - 1]?.id || '',
        isActive: true
      };
      conversation.activeBranchId = 'main';
    }

    // Ensure all existing messages are assigned to main branch
    conversation.messages.forEach(msg => {
      if (!msg.branchId) {
        msg.branchId = conversation.mainBranchId;
      }
    });
  }

  /**
   * Count messages in a specific branch
   */
  private getBranchMessageCount(conversation: ConversationData, branchId: string): number {
    if (branchId === conversation.mainBranchId) {
      return conversation.messages.filter(msg => 
        !msg.branchId || msg.branchId === branchId
      ).length;
    }

    const branch = conversation.branches?.[branchId];
    if (!branch) return 0;

    const branchPointIndex = conversation.messages.findIndex(msg => msg.id === branch.createdFrom);
    const branchMessages = conversation.messages.filter(msg => msg.branchId === branchId);
    
    return (branchPointIndex + 1) + branchMessages.length;
  }
}