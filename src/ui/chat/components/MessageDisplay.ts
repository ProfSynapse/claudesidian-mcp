/**
 * MessageDisplay - Main chat message display area
 *
 * Shows conversation messages with user/AI bubbles and tool execution displays
 */

import { ConversationData, ConversationMessage } from '../../../types/chat/ChatTypes';
import { MessageBubble } from './MessageBubble';
import { BranchManager } from '../services/BranchManager';
import { App, setIcon } from 'obsidian';
import { eventBus } from '../../../events/EventBus';
import { ChatEventNames } from '../../../events/ChatEvents';

export class MessageDisplay {
  private conversation: ConversationData | null = null;
  private messageBubbles: MessageBubble[] = [];

  constructor(
    private container: HTMLElement,
    private app: App,
    private branchManager: BranchManager,
    private onRetryMessage?: (messageId: string) => void,
    private onEditMessage?: (messageId: string, newContent: string) => void,
    private onToolEvent?: (messageId: string, event: 'detected' | 'updated' | 'started' | 'completed', data: any) => void,
    private onMessageAlternativeChanged?: (messageId: string, alternativeIndex: number) => void
  ) {
    this.render();
  }

  /**
   * Set conversation to display
   */
  setConversation(conversation: ConversationData): void {
    // Always re-render from the stored conversation data (single source of truth)
    // ProgressiveToolAccordions show both streaming AND final state
    // Tool bubbles are created from toolCalls in the conversation JSON
    this.conversation = conversation;
    this.render();
    this.scrollToBottom();
  }

  /**
   * Add a user message immediately (for optimistic updates)
   */
  addUserMessage(content: string): void {
    const message: ConversationMessage = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      conversationId: this.conversation?.id || 'unknown'
    };

    const bubble = this.createMessageBubble(message);
    const messagesContainer = this.container.querySelector('.messages-container');
    if (messagesContainer) {
      messagesContainer.appendChild(bubble);
    }
    this.scrollToBottom();
  }

  /**
   * Add a message immediately using the actual message object (prevents duplicate message creation)
   */
  addMessage(message: ConversationMessage): void {
    const bubble = this.createMessageBubble(message);
    this.container.querySelector('.messages-container')?.appendChild(bubble);
    this.scrollToBottom();
  }

  /**
   * Add an AI message immediately (for streaming setup)
   */
  addAIMessage(message: ConversationMessage): void {
    const bubble = this.createMessageBubble(message);
    this.container.querySelector('.messages-container')?.appendChild(bubble);
    this.scrollToBottom();
  }

  /**
   * Update a specific message content for final display (streaming handled by StreamingController)
   */
  updateMessageContent(messageId: string, content: string): void {
    // Find the MessageBubble instance for this message ID
    const messageBubble = this.messageBubbles.find(bubble => {
      const element = bubble.getElement();
      return element?.getAttribute('data-message-id') === messageId;
    });

    if (messageBubble) {
      // Use the MessageBubble's updateContent method for final content only
      messageBubble.updateContent(content);
    }
  }

  /**
   * Update branch content for a specific message without re-rendering entire view
   */
  updateBranchContent(baseMessageId: string, branchId: string): void {
    if (!this.conversation) {
      return;
    }
    console.debug('[MessageDisplay] updateBranchContent', { baseMessageId, branchId });

    const message = this.conversation.messages.find(msg => msg.id === baseMessageId);
    if (!message) {
      console.warn('[MessageDisplay] Branch update skipped - base message not found:', { baseMessageId, branchId });
      return;
    }

    if (message.activeAlternativeId !== branchId) {
      message.activeAlternativeId = branchId;
      this.syncActiveAlternativeIndex(message, branchId);
    }

    const bubble = this.findMessageBubble(baseMessageId);
    if (bubble) {
      bubble.updateWithNewMessage(message);
    } else {
      console.warn('[MessageDisplay] Branch update skipped - bubble not found:', { baseMessageId, branchId });
    }
  }

  /**
   * Update a specific message with new data (including tool calls) without full re-render
   */
  updateMessage(messageId: string, updatedMessage: ConversationMessage): void {
    // Update message with new data

    if (!this.conversation) {
      return;
    }

    // Find and update the message in conversation data
    const messageIndex = this.conversation.messages.findIndex(msg => msg.id === messageId);
    // Update conversation data
    
    if (messageIndex !== -1) {
      this.conversation.messages[messageIndex] = updatedMessage;
      // Message updated in conversation
    }

    // Find the MessageBubble instance
    const messageBubble = this.messageBubbles.find(bubble => {
      const element = bubble.getElement();
      return element?.getAttribute('data-message-id') === messageId;
    });

    // Find message bubble for update

    if (messageBubble) {
      // Tell the MessageBubble to re-render with updated message data
      // Update message bubble
      messageBubble.updateWithNewMessage(updatedMessage);
      // Message bubble updated
    }
  }

  // handleBranchFinalized removed - now handled via event bus in MessageBubble
  // MessageBubble subscribes directly to branch.finalized events

  /**
   * Escape HTML for safe display
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }


  /**
   * Show welcome state
   */
  showWelcome(): void {
    this.container.empty();
    this.container.addClass('message-display');

    const welcome = this.container.createDiv('chat-welcome');
    const welcomeContent = welcome.createDiv('chat-welcome-content');

    const welcomeIcon = welcomeContent.createDiv('chat-welcome-icon');
    setIcon(welcomeIcon, 'message-circle');

    welcomeContent.createEl('h2', { text: 'Welcome to AI Chat' });
    welcomeContent.createEl('p', { text: 'Start a conversation with your AI assistant. You can:' });

    const list = welcomeContent.createEl('ul');
    list.createEl('li', { text: 'Ask questions about your notes' });
    list.createEl('li', { text: 'Create and edit content' });
    list.createEl('li', { text: 'Search and organize your vault' });
    list.createEl('li', { text: 'Get help with any task' });

    const startButton = welcomeContent.createEl('button', {
      cls: 'chat-welcome-button mod-cta',
      text: 'Start New Conversation'
    });
  }

  /**
   * Render the message display
   */
  private render(): void {
    // Full render - clears existing progressive accordions
    this.container.empty();
    this.container.addClass('message-display');

    if (!this.conversation) {
      this.showWelcome();
      return;
    }

    // Create scrollable messages container
    const messagesContainer = this.container.createDiv('messages-container');

    // Clear previous message bubbles
    this.messageBubbles = [];

    // Render all messages (no branch filtering needed for message-level alternatives)
    this.conversation.messages.forEach((message, index) => {
      const messageEl = this.createMessageBubble(message);
      messagesContainer.appendChild(messageEl);
    });

    this.scrollToBottom();
  }

  /**
   * Create a message bubble element
   */
  private createMessageBubble(message: ConversationMessage): HTMLElement {
    if (message.alternativeBranches?.length) {
      console.debug('[MessageDisplay] Creating bubble with branches', {
        messageId: message.id,
        branchCount: message.alternativeBranches.length,
        activeAlternativeId: message.activeAlternativeId
      });
    }
    const bubble = new MessageBubble(
      message,
      this.app,
      (messageId: string) => this.onCopyMessage(messageId),
      (messageId: string) => this.handleRetryMessage(messageId),
      (messageId: string, newContent: string) => this.handleEditMessage(messageId, newContent),
      this.onToolEvent,
      this.onMessageAlternativeChanged ? (messageId: string, alternativeIndex: number) => this.handleMessageAlternativeChanged(messageId, alternativeIndex) : undefined
    );

    this.messageBubbles.push(bubble);
    
    const bubbleEl = bubble.createElement();

    // Tool accordion is now rendered inside MessageBubble's content area

    return bubbleEl;
  }

  /**
   * Handle copy message action
   */
  private onCopyMessage(messageId: string): void {
    const message = this.findMessage(messageId);
    if (message) {
      navigator.clipboard.writeText(message.content).then(() => {
        // MIGRATION: Emit via event bus
        eventBus.emit(ChatEventNames.MESSAGE_COPIED, {
          messageId
        });
        // Message copied to clipboard
      }).catch(err => {
        // Failed to copy message
      });
    }
  }

  /**
   * Handle retry message action
   */
  private handleRetryMessage(messageId: string): void {
    // MIGRATION: Emit via event bus
    const message = this.findMessage(messageId);
    if (message) {
      const userMessageId = message.role === 'user' ? messageId : '';
      eventBus.emit(ChatEventNames.RETRY_REQUESTED, {
        messageId,
        userMessageId
      });
    }

    if (this.onRetryMessage) {
      this.onRetryMessage(messageId);
    }
  }

  /**
   * Handle edit message action
   */
  private handleEditMessage(messageId: string, newContent: string): void {
    if (this.onEditMessage) {
      this.onEditMessage(messageId, newContent);
    }
  }

  /**
   * Handle message alternative changed action
   */
  private handleMessageAlternativeChanged(messageId: string, alternativeIndex: number): void {
    if (this.onMessageAlternativeChanged) {
      this.onMessageAlternativeChanged(messageId, alternativeIndex);
    }
  }

  /**
   * Find message by ID
   */
  private findMessage(messageId: string): ConversationMessage | undefined {
    return this.conversation?.messages.find(msg => msg.id === messageId);
  }

  /**
   * Find MessageBubble by messageId for tool events
   */
  findMessageBubble(messageId: string): MessageBubble | undefined {
    if (!this.conversation) return undefined;

    const directIndex = this.conversation.messages.findIndex(msg => msg.id === messageId);
    if (directIndex !== -1) {
      console.debug('[MessageDisplay] findMessageBubble direct match', { messageId });
      return this.messageBubbles[directIndex];
    }

    const contextualIndex = this.findMessageIndexByAlternativeId(messageId);
    if (contextualIndex === -1) {
      console.warn('[MessageDisplay] findMessageBubble no match found', { messageId });
      return undefined;
    }

    const message = this.conversation.messages[contextualIndex];
    if (this.applyAlternativeContext(message, messageId)) {
      const bubble = this.messageBubbles[contextualIndex];
      bubble?.updateWithNewMessage(message);
      console.debug('[MessageDisplay] findMessageBubble resolved via alternative', {
        messageId,
        baseMessageId: message.id,
        activeAlternativeId: message.activeAlternativeId,
        activeAlternativeIndex: message.activeAlternativeIndex
      });
      return bubble;
    }

    console.debug('[MessageDisplay] findMessageBubble fallback to base bubble', {
      messageId,
      baseMessageId: message.id
    });
    return this.messageBubbles[contextualIndex];
  }

  /**
   * Update MessageBubble with new message ID (for handling temporary -> real ID updates)
   */
  updateMessageId(oldId: string, newId: string, updatedMessage: ConversationMessage): void {
    // Find the MessageBubble that was created with the old (temporary) ID
    const messageBubble = this.messageBubbles.find(bubble => {
      const element = bubble.getElement();
      return element?.getAttribute('data-message-id') === oldId;
    });

    if (messageBubble) {
      // Update the MessageBubble's message reference and DOM attribute
      messageBubble.updateWithNewMessage(updatedMessage);

      // Update the DOM attribute to reflect the new ID
      const element = messageBubble.getElement();
      if (element) {
        element.setAttribute('data-message-id', newId);
      }
    }
  }

  /**
   * Check if any message bubbles have progressive tool accordions
   */
  hasProgressiveToolAccordions(): boolean {
    return this.messageBubbles.some(bubble => 
      bubble.getProgressiveToolAccordions().size > 0
    );
  }

  /**
   * Scroll to bottom of messages
   */
  private scrollToBottom(): void {
    const messagesContainer = this.container.querySelector('.messages-container');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.messageBubbles.forEach(bubble => bubble.cleanup());
    this.messageBubbles = [];
  }

  private syncActiveAlternativeIndex(message: ConversationMessage, branchId: string): void {
    if (message.alternativeBranches) {
      const branchIndex = message.alternativeBranches.findIndex(branch => branch.id === branchId);
      if (branchIndex >= 0) {
        message.activeAlternativeIndex = branchIndex + 1;
        return;
      }
    }
    // No legacy alternative support
  }

  private findMessageIndexByAlternativeId(targetId: string): number {
    if (!this.conversation) {
      return -1;
    }

    return this.conversation.messages.findIndex(msg => {
      return msg.alternativeBranches?.some(branch => branch.id === targetId);
    });
  }

  private applyAlternativeContext(message: ConversationMessage, targetId: string): boolean {
    if (message.alternativeBranches?.some(branch => branch.id === targetId)) {
      message.activeAlternativeId = targetId;
      this.syncActiveAlternativeIndex(message, targetId);
      return true;
    }

    // No legacy alternative support
    return false;
  }
}
