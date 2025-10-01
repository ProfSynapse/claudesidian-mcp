/**
 * ConversationList - Sidebar component for managing conversations
 * 
 * Displays list of conversations with create/delete functionality
 */

import { ConversationData } from '../../../types/chat/ChatTypes';

export class ConversationList {
  private conversations: ConversationData[] = [];
  private activeConversationId: string | null = null;

  constructor(
    private container: HTMLElement,
    private onConversationSelect: (conversation: ConversationData) => void,
    private onConversationDelete: (conversationId: string) => void
  ) {
    this.render();
  }

  /**
   * Set conversations to display
   */
  setConversations(conversations: ConversationData[]): void {
    this.conversations = conversations.sort((a, b) => b.updated - a.updated);
    this.render();
  }

  /**
   * Set active conversation
   */
  setActiveConversation(conversationId: string): void {
    this.activeConversationId = conversationId;
    this.updateActiveState();
  }

  /**
   * Render the conversation list
   */
  private render(): void {
    this.container.empty();
    this.container.addClass('conversation-list');

    if (this.conversations.length === 0) {
      const emptyState = this.container.createDiv('conversation-list-empty');
      emptyState.textContent = 'No conversations yet';
      return;
    }

    this.conversations.forEach(conversation => {
      const item = this.container.createDiv('conversation-item');
      
      if (conversation.id === this.activeConversationId) {
        item.addClass('active');
      }

      // Main conversation content
      const content = item.createDiv('conversation-content');
      content.addEventListener('click', () => {
        this.onConversationSelect(conversation);
      });

      // Title
      const title = content.createDiv('conversation-title');
      title.textContent = conversation.title;

      // Last message preview
      const lastMessage = conversation.messages[conversation.messages.length - 1];
      if (lastMessage) {
        const preview = content.createDiv('conversation-preview');
        const previewText = lastMessage.content.length > 60 
          ? lastMessage.content.substring(0, 60) + '...'
          : lastMessage.content;
        preview.textContent = previewText;
      }

      // Timestamp
      const timestamp = content.createDiv('conversation-timestamp');
      timestamp.textContent = this.formatTimestamp(conversation.updated);

      // Delete button
      const deleteBtn = item.createDiv('conversation-delete');
      deleteBtn.innerHTML = '×';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this conversation?')) {
          this.onConversationDelete(conversation.id);
        }
      });
    });
  }

  /**
   * Update active state styling
   */
  private updateActiveState(): void {
    const items = this.container.querySelectorAll('.conversation-item');
    items.forEach((item, index) => {
      const conversation = this.conversations[index];
      if (conversation && conversation.id === this.activeConversationId) {
        item.addClass('active');
      } else {
        item.removeClass('active');
      }
    });
  }

  /**
   * Format timestamp for display
   */
  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clean up any event listeners if needed
  }
}