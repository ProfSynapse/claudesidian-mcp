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
import { documentToConversationData } from '../../types/chat/ChatTypes';

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
      const documents = await this.conversationService.listConversations(options);
      return documents.map(documentToConversationData);
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
      const documents = await this.conversationService.searchConversations(query, options);
      return documents.map(documentToConversationData);
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
