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
    // Find the MessageBubble instance for this message ID
    const messageBubble = this.messageBubbles.find(bubble => {
      const element = bubble.getElement();
      return element?.getAttribute('data-message-id') === messageId;
    });

    if (messageBubble) {
      // Use the MessageBubble's updateContent method
      messageBubble.updateContent(content, isStreaming);
    } else {
      console.error(`[MessageDisplay] MessageBubble not found for messageId: ${messageId}`);
      // Debug: log all existing message bubbles
      console.log(`[MessageDisplay] Available message bubbles:`, 
        this.messageBubbles.map(bubble => bubble.getElement()?.getAttribute('data-message-id')).filter(Boolean));
    }
  }

  /**
   * Update a specific message with new data (including tool calls) without full re-render
   */
  updateMessage(messageId: string, updatedMessage: ConversationMessage): void {
    console.log(`[MessageDisplay DEBUG] updateMessage called:`, {
      messageId,
      hasConversation: !!this.conversation,
      hasToolCalls: !!(updatedMessage.tool_calls && updatedMessage.tool_calls.length > 0),
      toolCallCount: updatedMessage.tool_calls?.length || 0,
      isLoading: updatedMessage.isLoading
    });

    if (!this.conversation) {
      console.error('[MessageDisplay DEBUG] No conversation available for updateMessage');
      return;
    }

    // Find and update the message in conversation data
    const messageIndex = this.conversation.messages.findIndex(msg => msg.id === messageId);
    console.log(`[MessageDisplay DEBUG] Message index in conversation:`, {
      messageIndex,
      totalMessages: this.conversation.messages.length
    });
    
    if (messageIndex !== -1) {
      this.conversation.messages[messageIndex] = updatedMessage;
      console.log(`[MessageDisplay DEBUG] Updated conversation message at index ${messageIndex}`);
    }

    // Find the MessageBubble instance
    const messageBubble = this.messageBubbles.find(bubble => {
      const element = bubble.getElement();
      return element?.getAttribute('data-message-id') === messageId;
    });

    console.log(`[MessageDisplay DEBUG] MessageBubble search result:`, {
      bubbleFound: !!messageBubble,
      totalBubbles: this.messageBubbles.length,
      bubbleIds: this.messageBubbles.map(bubble => bubble.getElement()?.getAttribute('data-message-id')).filter(Boolean)
    });

    if (messageBubble) {
      // Tell the MessageBubble to re-render with updated message data
      console.log(`[MessageDisplay DEBUG] About to call updateWithNewMessage`);
      messageBubble.updateWithNewMessage(updatedMessage);
      console.log(`[MessageDisplay DEBUG] MessageBubble.updateWithNewMessage completed`);
    } else {
      console.error(`[MessageDisplay DEBUG] MessageBubble not found for messageId: ${messageId}`);
      console.error('[MessageDisplay DEBUG] Available MessageBubbles:', 
        this.messageBubbles.map(bubble => ({
          element: bubble.getElement(),
          messageId: bubble.getElement()?.getAttribute('data-message-id')
        }))
      );
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
      (messageId, newContent) => this.handleEditMessage(messageId, newContent),
      this.onToolEvent
    );

    this.messageBubbles.push(bubble);
    
    const bubbleEl = bubble.createElement();

    // Tool accordion is now rendered inside MessageBubble's content area
    console.log('[MessageDisplay] Message bubble created with tool calls:', {
      messageId: message.id,
      role: message.role,
      hasToolCalls: !!(message.tool_calls && message.tool_calls.length > 0),
      toolCallCount: message.tool_calls?.length || 0
    });

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