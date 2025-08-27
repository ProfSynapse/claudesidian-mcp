/**
 * MessageDisplay - Main chat message display area
 * 
 * Shows conversation messages with user/AI bubbles and tool execution displays
 */

import { ConversationData, ConversationMessage } from '../../../types/chat/ChatTypes';
import { MessageBubble } from './MessageBubble';
import { ToolAccordion } from './ToolAccordion';

export class MessageDisplay {
  private conversation: ConversationData | null = null;
  private messageBubbles: MessageBubble[] = [];

  constructor(
    private container: HTMLElement,
    private onRetryMessage?: (messageId: string) => void,
    private onEditMessage?: (messageId: string, newContent: string) => void
  ) {
    this.render();
  }

  /**
   * Set conversation to display
   */
  setConversation(conversation: ConversationData): void {
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
      timestamp: Date.now()
    };
    
    const bubble = this.createMessageBubble(message);
    this.container.querySelector('.messages-container')?.appendChild(bubble);
    this.scrollToBottom();
  }

  /**
   * Update a specific message content without full re-render (for streaming)
   */
  updateMessageContent(messageId: string, content: string, isStreaming: boolean = false): void {
    console.log(`[MessageDisplay] updateMessageContent called - messageId: ${messageId}, isStreaming: ${isStreaming}, content length: ${content.length}`);
    
    const messageElement = this.container.querySelector(`[data-message-id="${messageId}"]`);
    console.log(`[MessageDisplay] Found message element:`, !!messageElement);
    
    if (messageElement) {
      const contentElement = messageElement.querySelector('.message-content');
      console.log(`[MessageDisplay] Found content element:`, !!contentElement);
      
      if (contentElement) {
        if (isStreaming) {
          contentElement.innerHTML = `<div class="streaming-content">${this.escapeHtml(content)}<span class="streaming-cursor">|</span></div>`;
          console.log(`[MessageDisplay] Set streaming content with cursor`);
        } else {
          contentElement.innerHTML = `<div class="final-content">${this.escapeHtml(content)}</div>`;
          console.log(`[MessageDisplay] Set final content`);
        }
      } else {
        console.error(`[MessageDisplay] Content element not found for messageId: ${messageId}`);
      }
    } else {
      console.error(`[MessageDisplay] Message element not found for messageId: ${messageId}`);
      // Debug: log all existing message elements
      const allMessages = this.container.querySelectorAll('[data-message-id]');
      console.log(`[MessageDisplay] All message elements:`, Array.from(allMessages).map(el => el.getAttribute('data-message-id')));
    }
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
   * Show welcome state
   */
  showWelcome(): void {
    this.container.empty();
    this.container.addClass('message-display');

    const welcome = this.container.createDiv('chat-welcome');
    welcome.innerHTML = `
      <div class="chat-welcome-content">
        <div class="chat-welcome-icon">💬</div>
        <h2>Welcome to AI Chat</h2>
        <p>Start a conversation with your AI assistant. You can:</p>
        <ul>
          <li>Ask questions about your notes</li>
          <li>Create and edit content</li>
          <li>Search and organize your vault</li>
          <li>Get help with any task</li>
        </ul>
        <p>Type a message below to get started!</p>
      </div>
    `;
  }

  /**
   * Render the message display
   */
  private render(): void {
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

    // Render messages
    this.conversation.messages.forEach(message => {
      const messageEl = this.createMessageBubble(message);
      messagesContainer.appendChild(messageEl);
    });

    this.scrollToBottom();
  }

  /**
   * Create a message bubble element
   */
  private createMessageBubble(message: ConversationMessage): HTMLElement {
    const bubble = new MessageBubble(
      message,
      (messageId) => this.onCopyMessage(messageId),
      (messageId) => this.handleRetryMessage(messageId),
      (messageId, newContent) => this.handleEditMessage(messageId, newContent)
    );

    this.messageBubbles.push(bubble);
    
    const bubbleEl = bubble.createElement();

    // Add tool accordion if there are tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolAccordion = new ToolAccordion(message.tool_calls);
      const toolEl = toolAccordion.createElement();
      bubbleEl.appendChild(toolEl);
    }

    return bubbleEl;
  }

  /**
   * Handle copy message action
   */
  private onCopyMessage(messageId: string): void {
    const message = this.findMessage(messageId);
    if (message) {
      navigator.clipboard.writeText(message.content).then(() => {
        console.log('[MessageDisplay] Message copied to clipboard');
      }).catch(err => {
        console.error('[MessageDisplay] Failed to copy message:', err);
      });
    }
  }

  /**
   * Handle retry message action
   */
  private handleRetryMessage(messageId: string): void {
    console.log('[MessageDisplay] Retry message:', messageId);
    if (this.onRetryMessage) {
      this.onRetryMessage(messageId);
    }
  }

  /**
   * Handle edit message action
   */
  private handleEditMessage(messageId: string, newContent: string): void {
    console.log('[MessageDisplay] Edit message:', messageId, 'New content:', newContent);
    if (this.onEditMessage) {
      this.onEditMessage(messageId, newContent);
    }
  }

  /**
   * Find message by ID
   */
  private findMessage(messageId: string): ConversationMessage | undefined {
    return this.conversation?.messages.find(msg => msg.id === messageId);
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
}