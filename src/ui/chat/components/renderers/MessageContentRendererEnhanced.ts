/**
 * MessageContentRendererEnhanced - Enhanced content rendering with streaming awareness
 * Location: /src/ui/chat/components/renderers/MessageContentRendererEnhanced.ts
 *
 * Single responsibility: Render message content with streaming state awareness.
 * Part of MessageBubble refactoring following Single Responsibility Principle.
 *
 * Wraps MessageContentRenderer with:
 * - Streaming state detection
 * - Skip empty content during streaming
 * - State-change-only diagnostic logging
 */

import { App } from 'obsidian';
import { ConversationMessage } from '../../../../types/chat/ChatTypes';
import { MessageContentRenderer } from './MessageContentRenderer';
import { ReferenceBadgeRenderer } from './ReferenceBadgeRenderer';
import { BranchStateHelper } from '../utils/BranchStateHelper';
import { DiagnosticLogger } from '../utils/DiagnosticLogger';

export class MessageContentRendererEnhanced {
  private diagnosticLogger: DiagnosticLogger = new DiagnosticLogger();

  /**
   * Render message content with streaming awareness
   * @param container Container element to render into
   * @param content Content to render
   * @param message Current message
   * @param app Obsidian app instance
   * @param messageBubble MessageBubble instance (for reference badge rendering)
   * @returns Promise that resolves when rendering is complete
   */
  async renderContent(
    container: HTMLElement,
    content: string,
    message: ConversationMessage,
    app: App,
    messageBubble: any
  ): Promise<void> {
    // Skip rendering if actively streaming with empty content
    // Check both message-level and branch-level streaming status
    const activeBranch = BranchStateHelper.getActiveBranch(message);
    const isActivelyStreaming = message.isLoading ||
      activeBranch?.status === 'streaming' ||
      message.state === 'streaming';

    // Only log when state changes (reduce spam)
    const stateChanged = this.diagnosticLogger.logRenderStateChange(
      { isStreaming: isActivelyStreaming, contentEmpty: !content.trim() },
      message.id,
      content.length,
      {
        isLoading: message.isLoading,
        branchStatus: activeBranch?.status,
        messageState: message.state,
        willSkip: isActivelyStreaming && message.role === 'assistant' && !content.trim()
      }
    );

    if (isActivelyStreaming && message.role === 'assistant' && !content.trim()) {
      // Don't render empty content during streaming - thinking animation shows in header only
      if (stateChanged) {
        this.diagnosticLogger.logRenderEvent('Skipping render - empty content during streaming', {
          messageId: message.id
        });
      }
      return;
    }

    // Delegate to standard MessageContentRenderer
    const referenceMetadata = ReferenceBadgeRenderer.getReferenceMetadata(message.metadata);
    await MessageContentRenderer.renderContent(container, content, app, messageBubble, referenceMetadata);
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.diagnosticLogger.reset();
  }
}
