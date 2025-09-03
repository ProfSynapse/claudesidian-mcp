/**
 * ConversationRepository - Database operations for conversation data
 * Updated for message-level alternatives (removed conversation-level branching)
 */

import { ConversationData, ConversationMessage, ConversationDocument, CreateConversationParams, AddMessageParams, UpdateConversationParams, ConversationOperationResult, ConversationSearchOptions, ConversationSearchResult } from '../../../types/chat/ChatTypes';
import { ConversationCollection } from '../../collections/ConversationCollection';
import { EmbeddingService } from '../core/EmbeddingService';
import { v4 as uuidv4 } from 'uuid';

export class ConversationRepository {
  constructor(
    private collection: ConversationCollection,
    private embeddingService: EmbeddingService
  ) {}

  // =============================================================================
  // REPOSITORY LIFECYCLE
  // =============================================================================

  /**
   * Initialize the repository and underlying collection
   */
  async initialize(): Promise<void> {
    try {
      await this.collection.initialize();
      console.log('[ConversationRepository] Repository initialized successfully');
    } catch (error) {
      console.error('[ConversationRepository] Failed to initialize repository:', error);
      throw error;
    }
  }

  /**
   * Check if repository and collection are healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const exists = await this.collection.exists();
      if (!exists) {
        return false;
      }
      
      // Try a simple query to verify accessibility
      await this.collection.getConversationCount();
      return true;
    } catch (error) {
      console.error('[ConversationRepository] Health check failed:', error);
      return false;
    }
  }

  // =============================================================================
  // CORE CONVERSATION OPERATIONS
  // =============================================================================

  /**
   * Create a new conversation
   */
  async createConversation(params: CreateConversationParams): Promise<ConversationOperationResult> {
    try {
      // Generate unique conversation ID
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
          title: conversationData.title,
          created_at: conversationData.created_at,
          last_updated: conversationData.last_updated,
          vault_name: params.vaultName,
          message_count: conversationData.messages.length,
          conversation: conversationData
        }
      };

      await this.collection.addConversation(document);

      return {
        success: true,
        conversationId,
        messageId: params.initialMessage ? conversationData.messages[0].id : undefined
      };
    } catch (error) {
      console.error(`[ConversationRepository] Failed to create conversation:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId: string): Promise<ConversationDocument | null> {
    try {
      return await this.collection.getConversation(conversationId);
    } catch (error) {
      console.error(`[ConversationRepository] Failed to get conversation:`, error);
      return null;
    }
  }

  /**
   * Get all conversations with pagination
   */
  async getAllConversations(limit: number = 50, offset: number = 0): Promise<ConversationDocument[]> {
    try {
      return await this.collection.getAllConversations(limit, offset);
    } catch (error) {
      console.error(`[ConversationRepository] Failed to get conversations:`, error);
      return [];
    }
  }

  /**
   * Delete conversation by ID
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      await this.collection.deleteConversation(conversationId);
      return true;
    } catch (error) {
      console.error(`[ConversationRepository] Failed to delete conversation:`, error);
      return false;
    }
  }

  // =============================================================================
  // MESSAGE OPERATIONS
  // =============================================================================

  /**
   * Add a message to an existing conversation
   */
  async addMessage(params: AddMessageParams): Promise<ConversationOperationResult> {
    try {
      console.log('[ConversationRepository] addMessage called with params:', {
        conversationId: params.conversationId,
        role: params.role,
        contentLength: params.content?.length || 0,
        hasToolCalls: !!(params.toolCalls && params.toolCalls.length > 0),
        toolCallCount: params.toolCalls?.length || 0,
        toolCallsPreview: params.toolCalls?.slice(0, 2).map(tc => ({
          id: tc.id,
          name: tc.name,
          hasResult: !!tc.result,
          hasParameters: !!(tc.parameters)
        })) || []
      });
      
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
      const conversation = existingDocument.metadata.conversation;
      
      const newMessage: ConversationMessage = {
        id: messageId,
        role: params.role,
        content: params.content,
        timestamp: now,
        tool_calls: params.toolCalls
      };
      
      console.log('[ConversationRepository] Created message object:', {
        messageId,
        role: newMessage.role,
        hasToolCalls: !!(newMessage.tool_calls && newMessage.tool_calls.length > 0),
        toolCallCount: newMessage.tool_calls?.length || 0,
        toolCallsWithResults: newMessage.tool_calls?.filter(tc => tc.result !== undefined).length || 0
      });

      // Update conversation data
      const conversationData = { ...existingDocument.metadata.conversation };
      conversationData.messages.push(newMessage);
      conversationData.last_updated = now;
      
      // Generate document content for embedding
      const documentContent = this.extractConversationContent(conversationData);
      const embedding = await this.embeddingService.getEmbedding(documentContent) || [];
      
      // Update metadata with new message count
      const metadata = { ...existingDocument.metadata };
      metadata.conversation = conversationData;
      metadata.last_updated = now;
      metadata.message_count = conversationData.messages.length;

      await this.collection.updateConversation(params.conversationId, {
        embedding,
        document: documentContent,
        metadata
      });

      console.log('[ConversationCollection] Updated conversation:', params.conversationId);

      return {
        success: true,
        conversationId: params.conversationId,
        messageId
      };
    } catch (error) {
      console.error(`[ConversationRepository] Failed to add message:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update conversation metadata and/or messages
   */
  async updateConversation(conversationId: string, params: UpdateConversationParams): Promise<ConversationOperationResult> {
    try {
      const existingDocument = await this.collection.getConversation(conversationId);
      if (!existingDocument) {
        return {
          success: false,
          error: 'Conversation not found'
        };
      }

      // Create updated conversation data
      const conversationData = { ...existingDocument.metadata.conversation };
      if (params.title !== undefined) {
        conversationData.title = params.title;
      }
      if (params.messages !== undefined) {
        conversationData.messages = params.messages;
      }
      conversationData.last_updated = Date.now();

      // Generate document content for embedding
      const documentContent = this.extractConversationContent(conversationData);
      const embedding = await this.embeddingService.getEmbedding(documentContent) || [];

      // Update metadata
      const metadata = { ...existingDocument.metadata };
      metadata.conversation = conversationData;
      metadata.title = conversationData.title;
      metadata.last_updated = conversationData.last_updated;
      metadata.message_count = conversationData.messages.length;

      await this.collection.updateConversation(conversationId, {
        embedding,
        document: documentContent,
        metadata
      });

      return {
        success: true,
        conversationId
      };
    } catch (error) {
      console.error(`[ConversationRepository] Failed to update conversation:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // =============================================================================
  // SEARCH AND QUERY OPERATIONS  
  // =============================================================================

  /**
   * Search conversations by query string (returns documents)
   */
  async searchConversations(query: string, limit: number = 10): Promise<ConversationDocument[]> {
    try {
      const queryEmbedding = await this.embeddingService.getEmbedding(query);
      if (!queryEmbedding) {
        console.warn('[ConversationRepository] Could not generate embedding for search query');
        return [];
      }

      const searchResults = await this.collection.searchConversations(queryEmbedding, { limit });
      // Convert search results back to documents (for backward compatibility)
      const documents: ConversationDocument[] = [];
      
      for (const result of searchResults) {
        const document = await this.collection.getConversation(result.id);
        if (document) {
          documents.push(document);
        }
      }
      
      return documents;
    } catch (error) {
      console.error(`[ConversationRepository] Failed to search conversations:`, error);
      return [];
    }
  }
  
  /**
   * Search conversations and return search results with relevance scores
   */
  async searchConversationsWithResults(query: string, options: ConversationSearchOptions = {}): Promise<ConversationSearchResult[]> {
    try {
      const queryEmbedding = await this.embeddingService.getEmbedding(query);
      if (!queryEmbedding) {
        console.warn('[ConversationRepository] Could not generate embedding for search query');
        return [];
      }

      return await this.collection.searchConversations(queryEmbedding, options);
    } catch (error) {
      console.error(`[ConversationRepository] Failed to search conversations with results:`, error);
      return [];
    }
  }

  /**
   * Get conversations for a specific vault
   */
  async getConversationsByVault(vaultName: string, limit: number = 50): Promise<ConversationDocument[]> {
    try {
      return await this.collection.getConversationsByVault(vaultName, limit);
    } catch (error) {
      console.error(`[ConversationRepository] Failed to get conversations by vault:`, error);
      return [];
    }
  }

  /**
   * Get recent conversations sorted by last_updated
   */
  async getRecentConversations(limit: number = 20): Promise<ConversationDocument[]> {
    try {
      const allConversations = await this.collection.getAllConversations(limit * 2, 0);
      
      // Sort by last_updated in descending order
      return allConversations
        .sort((a: ConversationDocument, b: ConversationDocument) => b.metadata.last_updated - a.metadata.last_updated)
        .slice(0, limit);
    } catch (error) {
      console.error(`[ConversationRepository] Failed to get recent conversations:`, error);
      return [];
    }
  }

  /**
   * Get messages for a specific conversation
   */
  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    try {
      const document = await this.collection.getConversation(conversationId);
      if (!document) {
        return [];
      }
      return document.metadata.conversation.messages;
    } catch (error) {
      console.error(`[ConversationRepository] Failed to get messages:`, error);
      return [];
    }
  }

  /**
   * List conversations with optional filtering
   */
  async listConversations(vaultName?: string, limit: number = 20): Promise<ConversationDocument[]> {
    try {
      if (vaultName) {
        return await this.collection.getConversationsByVault(vaultName, limit);
      } else {
        return await this.collection.getAllConversations(limit, 0);
      }
    } catch (error) {
      console.error(`[ConversationRepository] Failed to list conversations:`, error);
      return [];
    }
  }

  /**
   * Get repository statistics
   */
  async getStatistics(): Promise<{
    totalConversations: number;
    activeConversations: number;
    averageMessageCount: number;
    topicDistribution: Record<string, number>;
  }> {
    try {
      return await this.collection.getStatistics();
    } catch (error) {
      console.error(`[ConversationRepository] Failed to get statistics:`, error);
      return {
        totalConversations: 0,
        activeConversations: 0,
        averageMessageCount: 0,
        topicDistribution: {}
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
      console.error(`[ConversationRepository] Failed to check conversation existence:`, error);
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