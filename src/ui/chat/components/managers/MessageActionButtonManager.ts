/**
 * MessageActionButtonManager - Manages message action buttons (copy, retry, edit)
 * Location: /src/ui/chat/components/managers/MessageActionButtonManager.ts
 *
 * Single responsibility: Create and manage action buttons for messages.
 * Part of MessageBubble refactoring following Single Responsibility Principle.
 */

import { ConversationMessage, MessageAlternativeBranch } from '../../../../types/chat/ChatTypes';
import { setIcon } from 'obsidian';
import { MessageEditController } from '../../controllers/MessageEditController';
import { BranchStateHelper } from '../utils/BranchStateHelper';

export class MessageActionButtonManager {
  private actionContainer: HTMLElement | null = null;

  constructor(
    private message: ConversationMessage,
    private onCopy: (messageId: string) => void,
    private onRetry: (messageId: string) => void,
    private onEdit?: (messageId: string, newContent: string) => void
  ) {}

  /**
   * Create action buttons based on message role
   * @param container Actions container element
   * @param element Message element (for edit controller)
   */
  createButtons(container: HTMLElement, element: HTMLElement | null): void {
    this.actionContainer = container;

    if (this.message.role === 'user') {
      this.createUserActionButtons(container, element);
    } else if (this.message.role === 'tool') {
      this.createToolActionButtons(container);
    } else {
      this.createAssistantActionButtons(container);
    }
  }

  /**
   * Create action buttons for user messages (edit + retry)
   */
  private createUserActionButtons(container: HTMLElement, element: HTMLElement | null): void {
    // Edit button
    if (this.onEdit) {
      const editBtn = container.createEl('button', {
        cls: 'message-action-btn',
        attr: { title: 'Edit message' }
      });
      setIcon(editBtn, 'edit');
      editBtn.addEventListener('click', () => {
        if (element) {
          MessageEditController.handleEdit(this.message, element, this.onEdit!);
        }
      });
    }

    // Retry button
    const retryBtn = container.createEl('button', {
      cls: 'message-action-btn',
      attr: { title: 'Retry message' }
    });
    setIcon(retryBtn, 'rotate-ccw');
    retryBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onRetry(this.message.id);
    });
  }

  /**
   * Create action buttons for tool messages (copy only)
   */
  private createToolActionButtons(container: HTMLElement): void {
    const copyBtn = container.createEl('button', {
      cls: 'message-action-btn',
      attr: { title: 'Copy tool execution details' }
    });
    setIcon(copyBtn, 'copy');
    copyBtn.addEventListener('click', () => {
      this.showCopyFeedback(copyBtn);
      this.onCopy(this.message.id);
    });
  }

  /**
   * Create action buttons for assistant messages (copy when not streaming)
   * Note: Navigator is managed separately by MessageBranchNavigatorManager
   */
  private createAssistantActionButtons(container: HTMLElement): void {
    // Only show copy button when message is complete (not streaming)
    // Only check if the ACTIVE branch is streaming, not all branches
    const activeBranch = BranchStateHelper.getActiveBranch(this.message);
    const isStreaming = this.message.isLoading ||
      (activeBranch ? activeBranch.status === 'streaming' : this.message.state === 'streaming');

    if (!isStreaming) {
      const copyBtn = container.createEl('button', {
        cls: 'message-action-btn',
        attr: { title: 'Copy message' }
      });
      setIcon(copyBtn, 'copy');
      copyBtn.addEventListener('click', () => {
        this.showCopyFeedback(copyBtn);
        this.onCopy(this.message.id);
      });
    }
  }

  /**
   * Show visual feedback when copy button is clicked
   */
  private showCopyFeedback(button: HTMLElement): void {
    const originalIcon = button.innerHTML;
    const originalTitle = button.getAttribute('title') || '';

    setIcon(button, 'check');
    button.setAttribute('title', 'Copied!');
    button.classList.add('copy-success');

    setTimeout(() => {
      button.innerHTML = originalIcon;
      button.setAttribute('title', originalTitle);
      button.classList.remove('copy-success');
    }, 1500);
  }

  /**
   * Update internal message reference (for dynamic button updates)
   */
  updateMessage(message: ConversationMessage): void {
    this.message = message;
  }

  /**
   * Get the action container element
   */
  getContainer(): HTMLElement | null {
    return this.actionContainer;
  }
}
