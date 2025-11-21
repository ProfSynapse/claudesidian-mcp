/**
 * ToolBubbleManager - Manages tool bubble lifecycle and rendering
 * Location: /src/ui/chat/components/managers/ToolBubbleManager.ts
 *
 * Single responsibility: Create, update, and destroy tool bubbles with progressive accordions.
 * Part of MessageBubble refactoring following Single Responsibility Principle.
 */

import { ConversationMessage } from '../../../../types/chat/ChatTypes';
import { ProgressiveToolAccordion } from '../ProgressiveToolAccordion';
import { ToolBubbleFactory } from '../factories/ToolBubbleFactory';
import { ToolEventParser } from '../../utils/ToolEventParser';

export class ToolBubbleManager {
  private toolBubbleElement: HTMLElement | null = null;
  private progressiveToolAccordions: Map<string, ProgressiveToolAccordion> = new Map();

  constructor(private message: ConversationMessage) {}

  /**
   * Render tool bubble with tool calls
   * @param toolCalls Array of tool calls to render
   * @param parentElement Parent message-group element
   */
  render(toolCalls: any[], parentElement: HTMLElement | null): void {
    if (!parentElement || !parentElement.classList.contains('message-group')) {
      return;
    }

    const toolCallMessage = {
      ...this.message,
      toolCalls
    };

    const newToolBubble = ToolBubbleFactory.createToolBubble({
      message: toolCallMessage,
      parseParameterValue: ToolEventParser.parseParameterValue,
      getToolCallArguments: ToolEventParser.getToolCallArguments,
      progressiveToolAccordions: this.progressiveToolAccordions
    });

    if (!newToolBubble) {
      return;
    }

    if (this.toolBubbleElement) {
      this.toolBubbleElement.replaceWith(newToolBubble);
    } else {
      parentElement.insertBefore(newToolBubble, parentElement.firstChild);
    }

    this.toolBubbleElement = newToolBubble;
  }

  /**
   * Reset tool bubble - remove element and cleanup accordions
   */
  reset(): void {
    if (this.toolBubbleElement) {
      this.toolBubbleElement.remove();
      this.toolBubbleElement = null;
    }
    this.cleanupProgressiveAccordions();
  }

  /**
   * Create tool bubble on-demand (during streaming when first tool detected)
   * @param parentElement Parent message-group element
   */
  createOnDemand(parentElement: HTMLElement | null): void {
    if (this.toolBubbleElement) return;

    this.toolBubbleElement = ToolBubbleFactory.createToolBubbleOnDemand(this.message, parentElement);
    if (!this.toolBubbleElement) {
      console.warn('[ToolBubbleManager] Failed to create tool bubble on demand for message', this.message.id);
    }
  }

  /**
   * Get progressive tool accordions for external updates (streaming)
   */
  getProgressiveAccordions(): Map<string, ProgressiveToolAccordion> {
    return this.progressiveToolAccordions;
  }

  /**
   * Update internal message reference
   */
  updateMessage(message: ConversationMessage): void {
    this.message = message;
  }

  /**
   * Clean up all progressive tool accordions
   */
  private cleanupProgressiveAccordions(): void {
    this.progressiveToolAccordions.forEach(accordion => {
      const element = accordion.getElement();
      if (element) {
        element.remove();
      }
      accordion.cleanup();
    });

    this.progressiveToolAccordions.clear();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.reset();
  }
}
