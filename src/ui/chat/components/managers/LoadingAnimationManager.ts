/**
 * LoadingAnimationManager - Manages thinking/loading animations in message headers
 * Location: /src/ui/chat/components/managers/LoadingAnimationManager.ts
 *
 * Single responsibility: Control the "Thinking..." animation in assistant message headers.
 * Part of MessageBubble refactoring following Single Responsibility Principle.
 */

import { ConversationMessage, MessageAlternativeBranch } from '../../../../types/chat/ChatTypes';

export class LoadingAnimationManager {
  private loadingInterval: any = null;
  private headerLoadingElement: HTMLElement | null = null;

  /**
   * Show thinking animation in message header
   * @param message The current message
   * @param branch The active branch (if any)
   * @param textBubbleElement The text bubble element (preferred location)
   * @param element The main element (fallback location)
   */
  showThinking(
    message: ConversationMessage,
    branch: MessageAlternativeBranch | null,
    textBubbleElement: HTMLElement | null,
    element: HTMLElement | null
  ): void {
    if (!element || message.role !== 'assistant') return;

    const shouldShow = message.isLoading || (branch !== null && branch.status === 'streaming');

    // Only target the text bubble header (bot icon), NOT the tool bubble header (wrench icon)
    // This prevents thinking from appearing in the tool bubble during retry
    const targetHeader =
      textBubbleElement?.querySelector('.message-header') ||
      element.querySelector('.message-assistant .message-header');

    if (!targetHeader) return;

    // Remove existing thinking element
    const existing = targetHeader.querySelector('.ai-loading-header');
    if (existing) {
      existing.remove();
    }

    if (!shouldShow) {
      // Stop animation when thinking should not show
      this.stopAnimation();
      return;
    }

    // Create new thinking element
    this.headerLoadingElement = targetHeader.createEl('span', { cls: 'ai-loading-header' });
    this.headerLoadingElement.innerHTML = 'Thinking<span class="dots">...</span>';
    this.startAnimation(this.headerLoadingElement);
  }

  /**
   * Hide thinking animation and clean up
   */
  hideThinking(): void {
    this.stopAnimation();

    if (this.headerLoadingElement && this.headerLoadingElement.isConnected) {
      this.headerLoadingElement.remove();
      this.headerLoadingElement = null;
    }
  }

  /**
   * Start the dots animation interval
   * @param container Element containing the .dots span
   */
  private startAnimation(container: HTMLElement): void {
    const dotsElement = container.querySelector('.dots');
    if (dotsElement) {
      let dotCount = 0;
      this.loadingInterval = setInterval(() => {
        dotCount = (dotCount + 1) % 4;
        dotsElement.textContent = '.'.repeat(dotCount);
      }, 500);
    }
  }

  /**
   * Stop the animation interval
   */
  private stopAnimation(): void {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopAnimation();
    this.headerLoadingElement = null;
  }
}
