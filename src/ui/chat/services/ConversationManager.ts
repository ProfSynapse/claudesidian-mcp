/**
 * ConversationManager - Handles all conversation CRUD operations
 */

import { ChatService } from '../../../services/chat/ChatService';
import { ConversationData } from '../../../types/chat/ChatTypes';
import { BranchManager } from './BranchManager';

export interface ConversationManagerEvents {
  onConversationSelected: (conversation: ConversationData) => void;
  onConversationsChanged: () => void;
  onError: (message: string) => void;
}

export class ConversationManager {
  private currentConversation: ConversationData | null = null;
  private conversations: ConversationData[] = [];

  constructor(
    private chatService: ChatService,
    private branchManager: BranchManager,
    private events: ConversationManagerEvents
  ) {}

  /**
   * Get current conversation
   */
  getCurrentConversation(): ConversationData | null {
    return this.currentConversation;
  }

  /**
   * Get all conversations
   */
  getConversations(): ConversationData[] {
    return this.conversations;
  }

  /**
   * Load conversations from the chat service
   */
  async loadConversations(): Promise<void> {
    try {
      this.conversations = await this.chatService.listConversations({ limit: 50 });

      this.events.onConversationsChanged();

      // Auto-select the most recent conversation
      if (this.conversations.length > 0 && !this.currentConversation) {
        await this.selectConversation(this.conversations[0]);
      }
    } catch (error) {
      console.error('[ConversationManager] Failed to load conversations:', error);
      this.events.onError('Failed to load conversations');
    }
  }

  /**
   * Select and display a conversation
   */
  async selectConversation(conversation: ConversationData): Promise<void> {
    try {
      this.currentConversation = conversation;

      // Load full conversation data
      const fullConversation = await this.chatService.getConversation(conversation.id);

      if (fullConversation) {
        this.currentConversation = fullConversation;
        this.events.onConversationSelected(fullConversation);
      }
    } catch (error) {
      console.error('[ConversationManager] Failed to select conversation:', error);
      this.events.onError('Failed to load conversation');
    }
  }

  /**
   * Create a new conversation
   */
  async createNewConversation(title?: string): Promise<void> {
    try {
      // Prompt for title if not provided
      const conversationTitle = title || await this.promptForConversationTitle();
      if (!conversationTitle) return; // User cancelled

      const result = await this.chatService.createConversation(conversationTitle);

      if (result.success && result.conversationId) {
        // Reload conversations and select the new one
        await this.loadConversations();
        const newConversation = await this.chatService.getConversation(result.conversationId);
        if (newConversation) {
          await this.selectConversation(newConversation);
        }
      } else {
        this.events.onError(result.error || 'Failed to create conversation');
      }
    } catch (error) {
      console.error('[ConversationManager] Failed to create conversation:', error);
      this.events.onError('Failed to create conversation');
    }
  }

  /**
   * Create new conversation with initial message
   */
  async createNewConversationWithMessage(
    message: string,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
      workspaceId?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    const title = message.length > 50 ? message.substring(0, 47) + '...' : message;

    console.log('[ConversationManager] createNewConversationWithMessage() called with:', {
      messageLength: message.length,
      title,
      options
    });

    try {
      console.log('[ConversationManager] Calling ChatService.createConversation()...');

      const result = await this.chatService.createConversation(
        title,
        message,
        {
          ...options,
          workspaceId: options?.workspaceId
        }
      );

      console.log('[ConversationManager] ChatService.createConversation() result:', result);

      if (result.success && result.conversationId && result.sessionId) {
        console.log(`[ConversationManager] ✓ Created conversation ${result.conversationId} with session ${result.sessionId}`);

        // Reload conversations and select the new one
        await this.loadConversations();
        const newConversation = await this.chatService.getConversation(result.conversationId);

        console.log('[ConversationManager] Reloaded conversation from storage:', {
          id: newConversation?.id,
          hasMetadata: !!newConversation?.metadata,
          metadata: newConversation?.metadata
        });

        if (newConversation) {
          await this.selectConversation(newConversation);
        }
      } else if (result.success && result.conversationId) {
        // Fallback for conversations without session ID (shouldn't happen with new code)
        console.warn('[ConversationManager] Created conversation without session ID');

        await this.loadConversations();
        const newConversation = await this.chatService.getConversation(result.conversationId);
        if (newConversation) {
          await this.selectConversation(newConversation);
        }
      } else {
        this.events.onError(result.error || 'Failed to create conversation');
      }
    } catch (error) {
      console.error('[ConversationManager] Failed to create conversation with message:', error);
      this.events.onError('Failed to create conversation');
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    try {
      const success = await this.chatService.deleteConversation(conversationId);
      
      if (success) {
        // If this was the current conversation, clear it
        if (this.currentConversation?.id === conversationId) {
          this.currentConversation = null;
        }
        
        // Reload conversation list
        await this.loadConversations();
      } else {
        this.events.onError('Failed to delete conversation');
      }
    } catch (error) {
      console.error('[ConversationManager] Failed to delete conversation:', error);
      this.events.onError('Failed to delete conversation');
    }
  }

  /**
   * Update current conversation data
   */
  updateCurrentConversation(conversation: ConversationData): void {
    this.currentConversation = conversation;
  }

  /**
   * Prompt user for conversation title
   */
  private async promptForConversationTitle(): Promise<string | null> {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.addClass('chat-modal-overlay');
      
      // Create modal dialog
      const modal = overlay.createDiv('chat-modal');
      
      // Modal header
      const header = modal.createDiv('chat-modal-header');
      header.createEl('h3', { text: 'New Conversation' });
      
      // Close button
      const closeBtn = header.createEl('button', { 
        cls: 'chat-modal-close',
        text: '×' 
      });
      
      // Modal content
      const content = modal.createDiv('chat-modal-content');
      content.createEl('p', { text: 'Enter a title for your new conversation:' });
      
      const input = content.createEl('input', {
        type: 'text',
        cls: 'chat-title-input',
        attr: { placeholder: 'e.g., "Help with React project"' }
      });
      
      // Modal actions
      const actions = modal.createDiv('chat-modal-actions');
      const cancelBtn = actions.createEl('button', { 
        text: 'Cancel',
        cls: 'chat-btn-secondary'
      });
      const createBtn = actions.createEl('button', { 
        text: 'Create Chat',
        cls: 'chat-btn-primary'
      });
      
      // Event handlers
      const cleanup = () => {
        overlay.remove();
      };
      
      const handleSubmit = () => {
        const title = input.value.trim();
        if (title) {
          cleanup();
          resolve(title);
        } else {
          input.focus();
          input.addClass('chat-input-error');
          setTimeout(() => input.removeClass('chat-input-error'), 2000);
        }
      };
      
      const handleCancel = () => {
        cleanup();
        resolve(null);
      };
      
      // Wire up events
      closeBtn.addEventListener('click', handleCancel);
      cancelBtn.addEventListener('click', handleCancel);
      createBtn.addEventListener('click', handleSubmit);
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      });
      
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          handleCancel();
        }
      });
      
      // Add to page and focus
      document.body.appendChild(overlay);
      input.focus();
      input.select();
    });
  }

}