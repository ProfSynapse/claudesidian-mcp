/**
 * MessageDisplay - Main chat message display area
 * 
 * Shows conversation messages with user/AI bubbles and tool execution displays
 */

import { ConversationData, ConversationMessage } from '../../../types/chat/ChatTypes';
import { MessageBubble } from './MessageBubble';

export class MessageDisplay {
  private conversation: ConversationData | null = null;
  private messageBubbles: MessageBubble[] = [];

  constructor(
    private container: HTMLElement,
    private onRetryMessage?: (messageId: string) => void,
    private onEditMessage?: (messageId: string, newContent: string) => void,
    private onToolEvent?: (messageId: string, event: 'detected' | 'started' | 'completed', data: any) => void
  ) {
    this.render();
  }

  /**
   * Set conversation to display
   */
  setConversation(conversation: ConversationData): void {
    // Set conversation data
    
    // Check if we're just updating an existing conversation with progressive accordions
    if (this.conversation && this.conversation.id === conversation.id) {
      // Same conversation - checking for progressive accordions
      
      // Check if any message bubbles have progressive accordions
      const hasProgressiveAccordions = this.messageBubbles.some(bubble => 
        bubble.getProgressiveToolAccordions().size > 0
      );
      
      if (hasProgressiveAccordions) {
        // Skip re-render to preserve progressive accordions
        // Just update the conversation data without re-rendering
        this.conversation = conversation;
        this.scrollToBottom();
        return;
      }
    }
    
    // Proceeding with full re-render
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
   * Add an AI message immediately (for streaming setup)
   */
  addAIMessage(message: ConversationMessage): void {
    const bubble = this.createMessageBubble(message);
    this.container.querySelector('.messages-container')?.appendChild(bubble);
    this.scrollToBottom();
  }

  /**
   * Update a specific message content without full re-render (for streaming)
   */
  updateMessageContent(messageId: string, content: string, isComplete: boolean = false, isIncremental?: boolean): void {
    // Find the MessageBubble instance for this message ID
    const messageBubble = this.messageBubbles.find(bubble => {
      const element = bubble.getElement();
      return element?.getAttribute('data-message-id') === messageId;
    });

    if (messageBubble) {
      // Use the MessageBubble's updateContent method for progressive updates
      messageBubble.updateContent(content, isComplete, isIncremental);
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
      (messageId, newContent) => this.handleEditMessage(messageId, newContent),
      this.onToolEvent
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
    
    const messageIndex = this.conversation.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return undefined;
    
    // MessageBubbles are created in same order as messages
    return this.messageBubbles[messageIndex];
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
}