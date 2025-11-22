/**
 * BranchStateHelper - Pure utility functions for extracting branch state
 * Location: /src/ui/chat/components/utils/BranchStateHelper.ts
 *
 * Provides static methods to query message branch state without side effects.
 * Part of MessageBubble refactoring following Single Responsibility Principle.
 */

import { ConversationMessage, MessageAlternativeBranch } from '../../../../types/chat/ChatTypes';

export class BranchStateHelper {
  /**
   * Get the currently active branch from a message
   * Returns null if no branch is active
   */
  static getActiveBranch(message: ConversationMessage): MessageAlternativeBranch | null {
    if (!message.activeAlternativeId || !message.alternativeBranches) {
      return null;
    }
    return message.alternativeBranches.find(branch => branch.id === message.activeAlternativeId) || null;
  }

  /**
   * Get the content from the active branch or fallback to message content
   * Prioritizes branch content (even if empty) to prevent parent content bleed-through
   */
  static getActiveContent(message: ConversationMessage): string {
    // If we have an active branch, ALWAYS use branch content (even if empty string)
    // This prevents parent's content from showing during branch streaming
    if (message.activeAlternativeId && message.alternativeBranches) {
      const activeBranch = message.alternativeBranches.find(
        branch => branch.id === message.activeAlternativeId
      );
      if (activeBranch) {
        // Return branch content, with null coalescing to empty string
        return activeBranch.content ?? '';
      }
    }

    // Fallback to parent message content
    return message.content;
  }

  /**
   * Get tool calls from the active branch or fallback to message tool calls
   * Prioritizes branch toolCalls (even if empty) to prevent parent tools bleed-through
   */
  static getActiveToolCalls(message: ConversationMessage): any[] | undefined {
    // If we have an active branch, ALWAYS use branch data (even if empty)
    // This prevents parent's tool calls from bleeding through during branch streaming
    if (message.activeAlternativeId && message.alternativeBranches) {
      const activeBranch = message.alternativeBranches.find(
        branch => branch.id === message.activeAlternativeId
      );
      if (activeBranch) {
        // Return branch toolCalls if it exists (even empty array)
        return activeBranch.toolCalls ?? [];
      }
    }

    // Fallback to parent message tool calls
    return message.toolCalls;
  }
}
