/**
 * StreamingController - Handles all streaming-related UI updates and animations
 * Now with streaming-markdown integration for progressive markdown rendering
 */

import { MarkdownRenderer } from '../utils/MarkdownRenderer';
import { App, Component } from 'obsidian';

export interface StreamingControllerEvents {
  onAnimationStarted: (messageId: string) => void;
  onAnimationStopped: (messageId: string) => void;
}

export class StreamingController {
  private activeAnimations = new Map<string, any>(); // messageId -> intervalId
  private streamingStates = new Map<string, any>(); // messageId -> streaming-markdown state

  constructor(
    private containerEl: HTMLElement,
    private app: App,
    private component: Component,
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
   * Start streaming for a message (initialize streaming-markdown parser)
   */
  startStreaming(messageId: string): void {
    const messageElement = this.containerEl.querySelector(`[data-message-id="${messageId}"]`);
    
    if (messageElement) {
      const contentElement = messageElement.querySelector('.message-bubble .message-content');
      
      if (contentElement) {
        // Stop loading animation
        this.stopLoadingAnimation(contentElement);
        
        // Initialize streaming-markdown parser for this message
        const streamingState = MarkdownRenderer.initializeStreamingParser(contentElement as HTMLElement);
        this.streamingStates.set(messageId, streamingState);
        
      } else {
        console.warn(`[StreamingController] Content element not found for message ${messageId}`);
      }
    } else {
      console.warn(`[StreamingController] Message element not found for messageId: ${messageId}`);
    }
  }

  /**
   * Update streaming message with new chunk (progressive rendering)
   */
  updateStreamingChunk(messageId: string, chunk: string): void {
    const streamingState = this.streamingStates.get(messageId);
    
    if (streamingState) {
      
      MarkdownRenderer.writeStreamingChunk(streamingState, chunk);
    } else {
      console.warn(`[StreamingController] No streaming state found for message ${messageId}`);
      // Initialize streaming if we missed the start
      this.startStreaming(messageId);
      // Try again
      const newStreamingState = this.streamingStates.get(messageId);
      if (newStreamingState) {
        MarkdownRenderer.writeStreamingChunk(newStreamingState, chunk);
      }
    }
  }

  /**
   * Finalize streaming for a message (switch to final Obsidian rendering if needed)
   */
  finalizeStreaming(messageId: string, finalContent: string): void {
    const streamingState = this.streamingStates.get(messageId);
    const messageElement = this.containerEl.querySelector(`[data-message-id="${messageId}"]`);
    
    if (streamingState && messageElement) {
      const contentElement = messageElement.querySelector('.message-bubble .message-content');
      
      if (contentElement) {
        
        MarkdownRenderer.finalizeStreamingContent(
          streamingState,
          finalContent,
          contentElement as HTMLElement,
          this.app,
          this.component
        ).then(() => {
          // Clean up streaming state
          this.streamingStates.delete(messageId);
        }).catch(error => {
          console.error('[StreamingController] Error finalizing streaming:', error);
          // Clean up anyway
          this.streamingStates.delete(messageId);
        });
      }
    } else {
      console.warn(`[StreamingController] Cannot finalize - no streaming state or element for ${messageId}`);
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
    // Clean up streaming states
    this.streamingStates.clear();
  }
}