/**
 * ConversationRepository - Repository pattern for conversation CRUD operations
 * 
 * Provides clean data access layer for chat conversations following the repository pattern.
 * Implements simplified single collection design with complete conversation data storage.
 * 
 * Based on: /docs/architecture/database-architecture-specification.md
 */

import { v4 as uuidv4 } from 'uuid';
import { ConversationCollection } from '../../collections/ConversationCollection';
import type { IVectorStore } from '../../interfaces/IVectorStore';
import type { EmbeddingService } from '../core/EmbeddingService';
import type {
  ConversationDocument,
  ConversationData,
  ConversationMessage,
  ConversationSearchOptions,
  ConversationSearchResult,
  CreateConversationParams,
  AddMessageParams,
  UpdateConversationParams,
  ConversationOperationResult,
  MessageQueryOptions,
  PaginatedMessages
} from '../../../types/chat/ChatTypes';

export class ConversationRepository {
  private collection: ConversationCollection;

  constructor(
    private vectorStore: IVectorStore,
    private embeddingService: EmbeddingService
  ) {
    this.collection = new ConversationCollection(vectorStore);
  }

  // =============================================================================
  // COLLECTION MANAGEMENT
  // =============================================================================

  /**
   * Initialize the conversation repository
   */
  async initialize(): Promise<void> {
    await this.collection.initialize();
  }

  /**
   * Check if the collection exists and is healthy
   */
  async isHealthy(): Promise<boolean> {
    return await this.collection.exists();
  }

  // =============================================================================
  // CONVERSATION CRUD OPERATIONS
  // =============================================================================

  /**
   * Create a new conversation
   */
  async createConversation(params: CreateConversationParams): Promise<ConversationOperationResult> {
    try {
      const now = Date.now();
      const conversationId = `conv_${now}_${uuidv4().slice(0, 8)}`;
      
      // Create initial conversation data
      const conversationData: ConversationData = {
        id: conversationId,
        title: params.title,
        created_at: now,
        last_updated: now,
        messages: []
      };

      // Add initial message if provided
      if (params.initialMessage) {
        const messageId = `msg_${now}_${uuidv4().slice(0, 8)}`;
        conversationData.messages.push({
          id: messageId,
          role: params.initialMessage.role,
          content: params.initialMessage.content,
          timestamp: now
        });
      }

      // Generate document content for embedding
      const documentContent = this.extractConversationContent(conversationData);
      const embedding = await this.embeddingService.getEmbedding(documentContent) || [];

      // Create document for storage
      const document: ConversationDocument = {
        id: conversationId,
        embedding,
        document: documentContent,
        metadata: {
          title: params.title,
          created_at: now,
          last_updated: now,
          vault_name: params.vaultName,
          message_count: conversationData.messages.length,
          conversation: conversationData
        }
      };

      await this.collection.storeConversation(document);

      return {
        success: true,
        conversationId
      };

    } catch (error) {
      console.error('[ConversationRepository] Failed to create conversation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Retrieve a conversation by ID
   */
  async getConversation(conversationId: string): Promise<ConversationData | null> {
    try {
      const document = await this.collection.getConversation(conversationId);
      if (!document) {
        return null;
      }

      return document.metadata.conversation;

    } catch (error) {
      console.error(`[ConversationRepository] Failed to get conversation ${conversationId}:`, error);
      return null;
    }
  }

  /**
   * Update conversation metadata (title, summary)
   */
  async updateConversation(
    conversationId: string,
    updates: UpdateConversationParams
  ): Promise<ConversationOperationResult> {
    try {
      const existingDocument = await this.collection.getConversation(conversationId);
      if (!existingDocument) {
        return {
          success: false,
          error: 'Conversation not found'
        };
      }

      // Update conversation data
      const conversationData = { ...existingDocument.metadata.conversation };
      conversationData.last_updated = Date.now();

      if (updates.title) {
        conversationData.title = updates.title;
      }

      if (updates.messages) {
        conversationData.messages = updates.messages;
      }

      // Generate document content directly from conversation messages
      const documentContent = this.extractConversationContent(conversationData);
      const embedding = await this.embeddingService.getEmbedding(documentContent) || [];

      // Update document
      await this.collection.updateConversation(conversationId, {
        embedding,
        document: documentContent,
        metadata: {
          ...existingDocument.metadata,
          title: conversationData.title,
          last_updated: conversationData.last_updated,
          conversation: conversationData
        }
      });

      return {
        success: true,
        conversationId
      };

    } catch (error) {
      console.error(`[ConversationRepository] Failed to update conversation ${conversationId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<ConversationOperationResult> {
    try {
      await this.collection.deleteConversation(conversationId);

      return {
        success: true,
        conversationId
      };

    } catch (error) {
      console.error(`[ConversationRepository] Failed to delete conversation ${conversationId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // =============================================================================
  // MESSAGE OPERATIONS
  // =============================================================================

  /**
   * Add a message to a conversation
   */
  async addMessage(params: AddMessageParams): Promise<ConversationOperationResult> {
    try {
      const existingDocument = await this.collection.getConversation(params.conversationId);
      if (!existingDocument) {
        return {
          success: false,
          error: 'Conversation not found'
        };
      }

      const now = Date.now();
      const messageId = `msg_${now}_${uuidv4().slice(0, 8)}`;

      // Create new message
      const newMessage: ConversationMessage = {
        id: messageId,
        role: params.role,
        content: params.content,
        timestamp: now,
        tool_calls: params.toolCalls
      };

      // Update conversation data
      const conversationData = { ...existingDocument.metadata.conversation };
      conversationData.messages.push(newMessage);
      conversationData.last_updated = now;

      // Generate updated document content and embedding
      const documentContent = this.extractConversationContent(conversationData);
      const embedding = await this.embeddingService.getEmbedding(documentContent) || [];

      // Update document
      await this.collection.updateConversation(params.conversationId, {
        embedding,
        document: documentContent,
        metadata: {
          ...existingDocument.metadata,
          last_updated: now,
          message_count: conversationData.messages.length,
          conversation: conversationData
        }
      });

      return {
        success: true,
        conversationId: params.conversationId,
        messageId
      };

    } catch (error) {
      console.error(`[ConversationRepository] Failed to add message to ${params.conversationId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get messages from a conversation with pagination
   */
  async getMessages(
    conversationId: string,
    options: MessageQueryOptions = {}
  ): Promise<PaginatedMessages | null> {
    try {
      const document = await this.collection.getConversation(conversationId);
      if (!document) {
        return null;
      }

      let messages = document.metadata.conversation.messages;

      // Apply filters
      if (options.role) {
        messages = messages.filter(msg => msg.role === options.role);
      }

      if (options.afterTimestamp) {
        messages = messages.filter(msg => msg.timestamp >= options.afterTimestamp!);
      }

      // Apply pagination
      const offset = options.offset || 0;
      const limit = Math.min(options.limit || 50, 500); // Max 500 messages per query
      const total = messages.length;
      const paginatedMessages = messages.slice(offset, offset + limit);

      return {
        messages: paginatedMessages,
        pagination: {
          offset,
          limit,
          total,
          hasMore: offset + paginatedMessages.length < total
        }
      };

    } catch (error) {
      console.error(`[ConversationRepository] Failed to get messages from ${conversationId}:`, error);
      return null;
    }
  }

  // =============================================================================
  // SEARCH OPERATIONS
  // =============================================================================

  /**
   * Search conversations by semantic similarity
   */
  async searchConversations(
    query: string,
    options: ConversationSearchOptions = {}
  ): Promise<ConversationSearchResult[]> {
    try {
      const queryEmbedding = await this.embeddingService.getEmbedding(query) || [];
      return await this.collection.searchConversations(queryEmbedding, options);

    } catch (error) {
      console.error('[ConversationRepository] Failed to search conversations:', error);
      return [];
    }
  }

  /**
   * List conversations for a vault
   */
  async listConversations(
    vaultName?: string,
    limit: number = 20
  ): Promise<ConversationSearchResult[]> {
    try {
      return await this.collection.listConversations(vaultName, limit);

    } catch (error) {
      console.error('[ConversationRepository] Failed to list conversations:', error);
      return [];
    }
  }

  // =============================================================================
  // UTILITY OPERATIONS
  // =============================================================================

  /**
   * Get recent conversations for a session
   */
  async getRecentConversations(sessionId: string, limit: number = 20): Promise<ConversationSearchResult[]> {
    try {
      const searchResults = await this.collection.listConversations(sessionId, limit);
      return searchResults;
    } catch (error) {
      console.error('[ConversationRepository] Error getting recent conversations:', error);
      return [];
    }
  }

  /**
   * Get conversation statistics
   */
  async getStatistics(): Promise<{
    totalConversations: number;
    totalMessages: number;
    averageMessagesPerConversation: number;
  }> {
    try {
      const baseStats = await this.collection.getStatistics();
      const totalMessages = baseStats.totalConversations * baseStats.averageMessageCount;

      return {
        totalConversations: baseStats.totalConversations,
        totalMessages: Math.round(totalMessages),
        averageMessagesPerConversation: baseStats.averageMessageCount
      };

    } catch (error) {
      console.error('[ConversationRepository] Failed to get statistics:', error);
      return {
        totalConversations: 0,
        totalMessages: 0,
        averageMessagesPerConversation: 0
      };
    }
  }

  /**
   * Check if a conversation exists
   */
  async conversationExists(conversationId: string): Promise<boolean> {
    try {
      const document = await this.collection.getConversation(conversationId);
      return document !== null;
    } catch (error) {
      return false;
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Extract full conversation content for embedding and search
   */
  private extractConversationContent(conversation: ConversationData): string {
    if (conversation.messages.length === 0) {
      return `Conversation: ${conversation.title}`;
    }

    // Include title and all message content for comprehensive search
    let content = `Title: ${conversation.title}\n\n`;
    
    // Add all messages with role labels for context
    conversation.messages.forEach((message, index) => {
      const roleLabel = message.role === 'user' ? 'User' : 'Assistant';
      content += `${roleLabel}: ${message.content}\n\n`;
    });

    return content.trim();
  }

  /**
   * Get collection name for external reference
   */
  static getCollectionName(): string {
    return ConversationCollection.getCollectionName();
  }
}