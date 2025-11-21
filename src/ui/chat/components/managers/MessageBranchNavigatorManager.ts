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
import { DiagnosticLogger } from '../utils/DiagnosticLogger';

export class MessageBranchNavigatorManager {
  private messageBranchNavigator: MessageBranchNavigator | null = null;
  private navigatorContainer: HTMLElement | null = null;
  private diagnosticLogger: DiagnosticLogger = new DiagnosticLogger();

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

    // Only log when state changes (reduce spam)
    const stateChanged = this.diagnosticLogger.logNavigatorStateChange(
      { shouldShow, hasNavigator },
      message.id
    );

    if (shouldShow && !this.messageBranchNavigator) {
      this.createNavigator(message, actionContainer);
    } else if (!shouldShow && this.messageBranchNavigator) {
      this.destroyNavigator();
    } else if (shouldShow && this.messageBranchNavigator) {
      // Update existing navigator (no log - happens frequently)
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

    // Must have alternatives to show navigator
    const hasAlternatives = (message.alternativeBranches?.length ?? 0) > 0 ||
      (message.alternatives?.length ?? 0) > 0;
    if (!hasAlternatives) {
      return false;
    }

    // Don't show during streaming - only check the ACTIVE branch/message, not all branches
    const activeBranch = BranchStateHelper.getActiveBranch(message);

    // Check streaming status - be defensive about undefined values
    // isLoading is runtime-only (not persisted), so it may be undefined after reload
    const isLoading = message.isLoading === true;  // Explicitly check for true
    const branchStreaming = activeBranch?.status === 'streaming';
    const messageStreaming = message.state === 'streaming';
    const isStreaming = isLoading || branchStreaming || messageStreaming;

    return !isStreaming;
  }

  /**
   * Create the navigator component
   * @param message Current message
   * @param actionContainer Action buttons container
   */
  private createNavigator(message: ConversationMessage, actionContainer: HTMLElement | null): void {
    if (!actionContainer) {
      this.diagnosticLogger.logNavigatorEvent('Cannot create navigator - actionContainer is null', {
        messageId: message.id
      });
      return;
    }

    this.diagnosticLogger.logNavigatorEvent('Creating navigator', {
      messageId: message.id,
      hasExistingContainer: !!this.navigatorContainer
    });

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

    // Check DOM attachment after a tick (element may not be in DOM yet during initial render)
    setTimeout(() => {
      this.diagnosticLogger.logNavigatorEvent('Navigator created successfully', {
        messageId: message.id,
        navigatorExists: !!this.messageBranchNavigator,
        containerInDOM: document.body.contains(this.navigatorContainer),
        containerClasses: this.navigatorContainer?.className,
        branchCount: message.alternativeBranches?.length ?? 0,
        activeBranchId: message.activeAlternativeId
      });
    }, 0);
  }

  /**
   * Destroy the navigator component
   */
  private destroyNavigator(): void {
    this.diagnosticLogger.logNavigatorEvent('Destroying navigator', {});

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
    this.diagnosticLogger.reset();
  }
}
