/**
 * ConversationQueryService - Handles read operations for conversations
 *
 * Responsibilities:
 * - Get conversation by ID
 * - List conversations with pagination
 * - Search conversations
 * - Repository access for advanced queries
 *
 * Follows Single Responsibility Principle - only handles read operations.
 */

import { ConversationData } from '../../types/chat/ChatTypes';

export class ConversationQueryService {
  constructor(
    private conversationService: any
  ) {}

  /**
   * Get a conversation by ID
   */
  async getConversation(id: string): Promise<ConversationData | null> {
    try {
      return await this.conversationService.getConversation(id);
    } catch (error) {
      console.error('Failed to get conversation:', error);
      return null;
    }
  }

  /**
   * List all conversations
   */
  async listConversations(options?: {
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ConversationData[]> {
    try {
      // ConversationService.listConversations expects (vaultName?: string, limit?: number)
      // We pass undefined for vaultName to get all conversations, and extract limit from options
      const metadataList = await this.conversationService.listConversations(undefined, options?.limit);

      // Convert ConversationMetadata to ConversationData format
      // Note: messages array is empty since we're only using the index (lightweight)
      return metadataList.map((metadata: any) => ({
        id: metadata.id,
        title: metadata.title,
        messages: [], // Empty for list view - messages loaded when conversation is selected
        created: metadata.created,
        updated: metadata.updated,
        metadata: {
          vault_name: metadata.vault_name,
          message_count: metadata.message_count
        }
      }));
    } catch (error) {
      console.error('Failed to list conversations:', error);
      return [];
    }
  }

  /**
   * Search conversations by query
   */
  async searchConversations(query: string, options?: {
    limit?: number;
    fields?: string[];
  }): Promise<ConversationData[]> {
    try {
      const metadataList = await this.conversationService.searchConversations(query, options?.limit);

      // Convert ConversationMetadata to ConversationData format
      return metadataList.map((metadata: any) => ({
        id: metadata.id,
        title: metadata.title,
        messages: [], // Empty for search results - messages loaded when conversation is selected
        created: metadata.created,
        updated: metadata.updated,
        metadata: {
          vault_name: metadata.vault_name,
          message_count: metadata.message_count
        }
      }));
    } catch (error) {
      console.error('Failed to search conversations:', error);
      return [];
    }
  }

  /**
   * Get conversation repository for advanced queries
   */
  getConversationRepository(): any {
    return this.conversationService.getRepository?.() || this.conversationService;
  }

  /**
   * Get underlying conversation service
   */
  getConversationService(): any {
    return this.conversationService;
  }

  /**
   * Count total conversations
   */
  async countConversations(): Promise<number> {
    try {
      return await this.conversationService.count?.() || 0;
    } catch (error) {
      console.error('Failed to count conversations:', error);
      return 0;
    }
  }

  /**
   * Check if conversation exists
   */
  async conversationExists(id: string): Promise<boolean> {
    const conversation = await this.getConversation(id);
    return conversation !== null;
  }
}
