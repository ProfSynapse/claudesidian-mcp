/**
 * StreamingController - Handles all streaming-related UI updates and animations
 */

export interface StreamingControllerEvents {
  onAnimationStarted: (messageId: string) => void;
  onAnimationStopped: (messageId: string) => void;
}

export class StreamingController {
  private activeAnimations = new Map<string, any>(); // messageId -> intervalId

  constructor(
    private containerEl: HTMLElement,
    private events?: StreamingControllerEvents
  ) {}

  /**
   * Show loading animation for AI response
   */
  showAILoadingState(messageId: string): void {
    // Find the message element and add loading animation
    const messageElement = this.containerEl.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      const contentElement = messageElement.querySelector('.message-bubble .message-content');
      if (contentElement) {
        contentElement.innerHTML = '<span class="ai-loading">Thinking<span class="dots">...</span></span>';
        this.startLoadingAnimation(contentElement);
      }
    }
  }

  /**
   * Update streaming message content in real-time
   */
  updateStreamingMessage(messageId: string, content: string, isStreaming: boolean): void {
    const messageElement = this.containerEl.querySelector(`[data-message-id="${messageId}"]`);
    
    if (messageElement) {
      const contentElement = messageElement.querySelector('.message-bubble .message-content');
      
      if (contentElement) {
        // Stop loading animation
        this.stopLoadingAnimation(contentElement);
        
        // Update content with streaming text
        if (isStreaming) {
          contentElement.innerHTML = `<div class="streaming-content">${this.escapeHtml(content)}<span class="streaming-cursor">|</span></div>`;
        } else {
          contentElement.innerHTML = `<div class="final-content">${this.escapeHtml(content)}</div>`;
          console.log(`[StreamingController] Set final content`);
        }
      } else {
        console.warn(`[StreamingController] Content element not found for message ${messageId}`);
      }
    } else {
      console.warn(`[StreamingController] Message element not found for messageId: ${messageId}`);
      // Log all message elements to debug
      const allMessages = this.containerEl.querySelectorAll('[data-message-id]');
      console.log(`[StreamingController] Found ${allMessages.length} message elements:`, 
        Array.from(allMessages).map(el => el.getAttribute('data-message-id')));
    }
  }

  /**
   * Start loading animation (animated dots)
   */
  startLoadingAnimation(element: Element): void {
    const dotsElement = element.querySelector('.dots');
    if (dotsElement) {
      let dotCount = 0;
      const interval = setInterval(() => {
        dotCount = (dotCount + 1) % 4;
        dotsElement.textContent = '.'.repeat(dotCount);
      }, 500);
      
      // Store interval ID for cleanup
      const messageId = this.getMessageIdFromElement(element);
      if (messageId) {
        this.activeAnimations.set(messageId, interval);
        this.events?.onAnimationStarted(messageId);
      }
      
      // Also store on element for backward compatibility
      (element as any)._loadingInterval = interval as any;
    }
  }

  /**
   * Stop loading animation
   */
  stopLoadingAnimation(element: Element): void {
    // Clean up from element storage (backward compatibility)
    const elementInterval = (element as any)._loadingInterval;
    if (elementInterval) {
      clearInterval(elementInterval);
      delete (element as any)._loadingInterval;
    }

    // Clean up from our tracking
    const messageId = this.getMessageIdFromElement(element);
    if (messageId) {
      const interval = this.activeAnimations.get(messageId);
      if (interval) {
        clearInterval(interval);
        this.activeAnimations.delete(messageId);
        this.events?.onAnimationStopped(messageId);
      }
    }
  }

  /**
   * Stop all active animations
   */
  stopAllAnimations(): void {
    this.activeAnimations.forEach((interval, messageId) => {
      clearInterval(interval);
      this.events?.onAnimationStopped(messageId);
    });
    this.activeAnimations.clear();
  }

  /**
   * Remove loading message from UI
   */
  removeLoadingMessage(messageId: string): void {
    console.log(`[StreamingController] Removing loading message: ${messageId}`);
    
    const messageElement = this.containerEl.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      // Stop any active animation for this message
      const contentElement = messageElement.querySelector('.message-bubble .message-content');
      if (contentElement) {
        this.stopLoadingAnimation(contentElement);
      }
      
      // Remove the message element
      messageElement.remove();
    }

    // Clean up from our tracking
    const interval = this.activeAnimations.get(messageId);
    if (interval) {
      clearInterval(interval);
      this.activeAnimations.delete(messageId);
    }
  }

  /**
   * Get message ID from an element by traversing up the DOM
   */
  private getMessageIdFromElement(element: Element): string | null {
    let current = element as Element | null;
    while (current) {
      const messageId = current.getAttribute('data-message-id');
      if (messageId) {
        return messageId;
      }
      current = current.parentElement;
    }
    return null;
  }

  /**
   * Escape HTML for safe display
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get active animation count (for debugging/monitoring)
   */
  getActiveAnimationCount(): number {
    return this.activeAnimations.size;
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    this.stopAllAnimations();
  }
}