/**
 * MessageBranchNavigatorManager - Manages branch navigator lifecycle
 * Location: /src/ui/chat/components/managers/MessageBranchNavigatorManager.ts
 *
 * Single responsibility: Create, update, and destroy the branch navigator component.
 * Part of MessageBubble refactoring following Single Responsibility Principle.
 */

import { ConversationMessage } from '../../../../types/chat/ChatTypes';
import { MessageBranchNavigator, MessageBranchNavigatorEvents } from '../MessageBranchNavigator';
import { BranchStateHelper } from '../utils/BranchStateHelper';

export class MessageBranchNavigatorManager {
  private messageBranchNavigator: MessageBranchNavigator | null = null;
  private navigatorContainer: HTMLElement | null = null;

  constructor(
    private onAlternativeChanged?: (messageId: string, alternativeIndex: number) => void
  ) {}

  /**
   * Sync navigator state with message state
   * Call this whenever message state changes
   * @param message Current message
   * @param actionContainer Action buttons container (where navigator will be prepended)
   */
  sync(message: ConversationMessage, actionContainer: HTMLElement | null): void {
    const shouldShow = this.shouldShowNavigator(message);
    const hasNavigator = !!this.messageBranchNavigator;

    if (shouldShow && !this.messageBranchNavigator) {
      this.createNavigator(message, actionContainer);
    } else if (!shouldShow && this.messageBranchNavigator) {
      this.destroyNavigator();
    } else if (shouldShow && this.messageBranchNavigator) {
      this.messageBranchNavigator.updateMessage(message);
    }
  }

  /**
   * Determine if navigator should be shown
   * @param message Current message
   * @returns true if navigator should be visible
   */
  private shouldShowNavigator(message: ConversationMessage): boolean {
    // Only assistant messages can have alternatives
    if (message.role !== 'assistant') {
      return false;
    }

    // Must have multiple alternatives to show navigator (2+ branches)
    const branchCount = message.alternativeBranches?.length ?? 0;
    const legacyAltCount = message.alternatives?.length ?? 0;
    const hasMultipleBranches = branchCount > 1 || legacyAltCount > 1;

    // Always show navigator when there are multiple branches, even during streaming
    // This allows users to switch between completed and streaming branches during retry
    return hasMultipleBranches;
  }

  /**
   * Create the navigator component
   * @param message Current message
   * @param actionContainer Action buttons container
   */
  private createNavigator(message: ConversationMessage, actionContainer: HTMLElement | null): void {
    if (!actionContainer) {
      return;
    }

    const navigatorEvents: MessageBranchNavigatorEvents = {
      onAlternativeChanged: (messageId, alternativeIndex) => {
        if (this.onAlternativeChanged) {
          this.onAlternativeChanged(messageId, alternativeIndex);
        }
      },
      onError: (errorMessage) => console.error('[MessageBranchNavigatorManager] Navigation error:', errorMessage)
    };

    // Create or reuse navigator container
    if (!this.navigatorContainer) {
      this.navigatorContainer = actionContainer.createDiv('message-branch-navigator-container');
      actionContainer.prepend(this.navigatorContainer);
    }

    this.messageBranchNavigator = new MessageBranchNavigator(this.navigatorContainer, navigatorEvents);
    this.messageBranchNavigator.updateMessage(message);
  }

  /**
   * Destroy the navigator component
   */
  private destroyNavigator(): void {
    if (this.messageBranchNavigator) {
      this.messageBranchNavigator.destroy();
      this.messageBranchNavigator = null;
    }

    if (this.navigatorContainer) {
      this.navigatorContainer.remove();
      this.navigatorContainer = null;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.destroyNavigator();
  }
}
