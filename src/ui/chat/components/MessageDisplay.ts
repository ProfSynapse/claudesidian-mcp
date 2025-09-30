/**
 * MessageDisplay - Main chat message display area
 *
 * Shows conversation messages with user/AI bubbles and tool execution displays
 */

import { ConversationData, ConversationMessage } from '../../../types/chat/ChatTypes';
import { MessageBubble } from './MessageBubble';
import { BranchManager } from '../services/BranchManager';
import { App, setIcon } from 'obsidian';

export class MessageDisplay {
  private conversation: ConversationData | null = null;
  private messageBubbles: MessageBubble[] = [];

  constructor(
    private container: HTMLElement,
    private app: App,
    private branchManager: BranchManager,
    private onRetryMessage?: (messageId: string) => void,
    private onEditMessage?: (messageId: string, newContent: string) => void,
    private onToolEvent?: (messageId: string, event: 'detected' | 'started' | 'completed', data: any) => void,
    private onMessageAlternativeChanged?: (messageId: string, alternativeIndex: number) => void
  ) {
    this.render();
  }

  /**
   * Set conversation to display
   */
  setConversation(conversation: ConversationData): void {
    console.log('[TOOL-UI-DEBUG] MessageDisplay.setConversation called:', {
      conversationId: conversation.id,
      messageCount: conversation.messages.length,
      isNewConversation: !this.conversation || this.conversation.id !== conversation.id
    });

    // Always re-render from the stored conversation data (single source of truth)
    // Progressive tool accordions are temporary UI during streaming
    // After streaming completes, we re-render with static ToolAccordion components from stored toolCalls
    console.log('[TOOL-UI-DEBUG] Re-rendering from stored conversation data (single source of truth)');
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
    console.log('[MessageDisplay] addMessage called with:', {
      messageId: message.id,
      messageRole: message.role,
      messageContent: message.content.substring(0, 30) + '...'
    });
    
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

    welcomeContent.createEl('p', { text: 'Type a message below to get started!' });
  }

  /**
   * Render the message display
   */
  private render(): void {
    console.log('[TOOL-UI-DEBUG] MessageDisplay.render called - FULL RE-RENDER starts');
    console.log('[TOOL-UI-DEBUG] Existing message bubbles before cleanup:', {
      count: this.messageBubbles.length,
      withProgressiveAccordions: this.messageBubbles.filter(b => b.getProgressiveToolAccordions().size > 0).length
    });

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
    console.log('[TOOL-UI-DEBUG] Message bubbles array cleared, creating new bubbles');

    // Render all messages (no branch filtering needed for message-level alternatives)
    console.log('[MessageDisplay] Rendering conversation messages:', {
      conversationId: this.conversation.id,
      messageCount: this.conversation.messages.length,
      messageBreakdown: this.conversation.messages.reduce((acc, msg) => {
        acc[msg.role] = (acc[msg.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      messagesWithToolCalls: this.conversation.messages.filter(msg => msg.toolCalls && msg.toolCalls.length > 0).length,
      toolMessages: this.conversation.messages.filter(msg => msg.role === 'tool').length
    });

    this.conversation.messages.forEach((message, index) => {
      console.log(`[MessageDisplay] Creating bubble for message ${index}:`, {
        id: message.id,
        role: message.role,
        hasToolCalls: !!(message.toolCalls && message.toolCalls.length > 0),
        toolCallCount: message.toolCalls?.length || 0,
        contentPreview: message.content.substring(0, 50) + '...'
      });

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
      this.app,
      (messageId) => this.onCopyMessage(messageId),
      (messageId) => this.handleRetryMessage(messageId),
      (messageId, newContent) => this.handleEditMessage(messageId, newContent),
      this.onToolEvent,
      this.onMessageAlternativeChanged ? (messageId, alternativeIndex) => this.handleMessageAlternativeChanged(messageId, alternativeIndex) : undefined
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
    
    const messageIndex = this.conversation.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return undefined;
    
    // MessageBubbles are created in same order as messages
    return this.messageBubbles[messageIndex];
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
      console.log('[MessageDisplay] Updating MessageBubble ID:', { from: oldId, to: newId });
      
      // Update the MessageBubble's message reference and DOM attribute
      messageBubble.updateWithNewMessage(updatedMessage);
      
      // Update the DOM attribute to reflect the new ID
      const element = messageBubble.getElement();
      if (element) {
        element.setAttribute('data-message-id', newId);
      }
    } else {
      console.log('[MessageDisplay] Could not find MessageBubble with old ID:', oldId);
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
}