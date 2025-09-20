/**
 * ConversationCollection - Simplified ChromaDB collection for native chatbot conversations
 * 
 * Implements the simplified single collection design from database architecture specification.
 * Stores complete conversation data in metadata with minimal essential fields.
 * 
 * Based on: /docs/architecture/database-architecture-specification.md
 */

import type { IVectorStore } from '../interfaces/IVectorStore';
import type { ConversationData, ConversationDocument } from '../../types/chat/ChatTypes';

/**
 * Simplified ChromaDB document structure for conversations
 * Single collection: chat_conversations
 */
export interface SimplifiedConversationDocument {
  id: string;                    // Format: "conv_{timestamp}_{uuid}"
  embedding: number[];           // Summary embedding for semantic search
  document: string;              // Conversation summary for search
  metadata: {
    // Essential metadata only
    title: string;
    created_at: number;
    last_updated: number;
    vault_name: string;
    message_count: number;
    
    // The actual conversation data
    conversation: ConversationData;
  };
}

/**
 * Simplified search options for conversation queries
 */
export interface ConversationSearchOptions {
  limit?: number;
  timeRange?: { start: number; end: number };
  vaultName?: string;
  sessionId?: string;
}

/**
 * Search result for conversation queries
 */
export interface ConversationSearchResult {
  id: string;
  title: string;
  summary: string;
  metadata: SimplifiedConversationDocument['metadata'];
  relevanceScore: number;
  snippet?: string;
}

/**
 * Simplified conversation collection implementation
 * Single collection design with essential operations only
 */
export class ConversationCollection {
  private static readonly COLLECTION_NAME = 'chat_conversations';
  private vectorStore: IVectorStore;

  constructor(vectorStore: IVectorStore) {
    this.vectorStore = vectorStore;
  }

  /**
   * Wait for vector store to be ready with timeout
   */
  private async waitForVectorStore(timeoutMs: number = 10000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if ((this.vectorStore as any).initialized && (this.vectorStore as any).client) {
        return;
      }

      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Initialize the chat_conversations collection
   */
  async initialize(): Promise<void> {
    try {
      const collectionConfig = {
        name: ConversationCollection.COLLECTION_NAME,
        distance: 'cosine' as const,
        metadata: {
          description: 'Native chatbot conversations with embedded summaries',
          version: '2.0.0',
          created_by: 'SimplifiedConversationCollection',
          schema: 'simplified_single_collection'
        }
      };

      await this.vectorStore.createCollection(
        ConversationCollection.COLLECTION_NAME,
        collectionConfig
      );

      console.log('[ConversationCollection] Simplified collection initialized');
    } catch (error) {
      console.error('[ConversationCollection] Failed to initialize collection:', error);
      throw error;
    }
  }

  /**
   * Store a conversation document
   */
  async storeConversation(conversation: ConversationDocument): Promise<void> {
    try {
      await this.vectorStore.addItems(ConversationCollection.COLLECTION_NAME, {
        ids: [conversation.id],
        embeddings: [conversation.embedding],
        metadatas: [conversation.metadata],
        documents: [conversation.document]
      });

      console.log(`[ConversationCollection] Stored conversation: ${conversation.id}`);
    } catch (error) {
      console.error(`[ConversationCollection] Failed to store conversation ${conversation.id}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing conversation
   */
  async updateConversation(conversationId: string, updates: Partial<ConversationDocument>): Promise<void> {
    try {
      const updateData: {
        ids: string[];
        embeddings?: number[][];
        metadatas?: Record<string, any>[];
        documents?: string[];
      } = { ids: [conversationId] };
      
      if (updates.embedding) {
        updateData.embeddings = [updates.embedding];
      }
      
      if (updates.metadata) {
        updateData.metadatas = [updates.metadata];
      }
      
      if (updates.document) {
        updateData.documents = [updates.document];
      }

      await this.vectorStore.updateItems(ConversationCollection.COLLECTION_NAME, updateData);

      console.log(`[ConversationCollection] Updated conversation: ${conversationId}`);
    } catch (error) {
      console.error(`[ConversationCollection] Failed to update conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve a conversation by ID
   */
  async getConversation(conversationId: string): Promise<ConversationDocument | null> {
    try {
      console.log(`[ConversationCollection] Getting conversation: ${conversationId}`);
      
      const results = await this.vectorStore.getItems(
        ConversationCollection.COLLECTION_NAME, 
        [conversationId],
        ['documents', 'metadatas', 'embeddings']
      );

      console.log(`[ConversationCollection] VectorStore results:`, {
        conversationId,
        found: !!(results.documents && results.documents.length > 0),
        documentsCount: results.documents?.length || 0,
        hasMetadata: !!(results.metadatas && results.metadatas.length > 0),
        metadataPreview: results.metadatas?.[0] ? {
          title: results.metadatas[0].title,
          messageCount: results.metadatas[0].message_count,
          hasConversationData: !!(results.metadatas[0].conversation)
        } : null
      });

      if (!results.documents || results.documents.length === 0) {
        console.log(`[ConversationCollection] No conversation found for ID: ${conversationId}`);
        return null;
      }

      const document = {
        id: conversationId,
        document: results.documents[0],
        metadata: results.metadatas?.[0] as ConversationDocument['metadata'],
        embedding: results.embeddings?.[0] || []
      };
      
      console.log(`[ConversationCollection] Returning conversation:`, {
        conversationId,
        hasConversationInMetadata: !!(document.metadata?.conversation),
        messageCount: document.metadata?.conversation?.messages?.length || 0
      });

      return document;
    } catch (error) {
      console.error(`[ConversationCollection] Failed to get conversation ${conversationId}:`, error);
      return null;
    }
  }

  /**
   * Search conversations by semantic similarity
   */
  async searchConversations(
    queryEmbedding: number[],
    options: ConversationSearchOptions = {}
  ): Promise<ConversationSearchResult[]> {
    try {
      const whereClause: Record<string, any> = {};

      // Build simplified where clause
      if (options.timeRange) {
        whereClause['metadata.created_at'] = {
          $gte: options.timeRange.start,
          $lte: options.timeRange.end
        };
      }

      if (options.vaultName) {
        whereClause['metadata.vault_name'] = options.vaultName;
      }

      const results = await this.vectorStore.query(ConversationCollection.COLLECTION_NAME, {
        queryEmbeddings: [queryEmbedding],
        nResults: options.limit || 20,
        where: whereClause,
        include: ['documents', 'metadatas', 'distances']
      });

      if (!results.documents || !results.metadatas || !results.distances) {
        return [];
      }

      // Handle nested array results from vector store query
      const searchResults: ConversationSearchResult[] = [];
      
      if (results.documents?.[0] && results.ids?.[0]) {
        for (let i = 0; i < results.documents[0].length; i++) {
          searchResults.push({
            id: results.ids[0][i] || '',
            title: results.metadatas?.[0]?.[i]?.title || 'Untitled Conversation',
            summary: results.documents[0][i],
            metadata: results.metadatas?.[0]?.[i] as ConversationDocument['metadata'],
            relevanceScore: 1 - (results.distances?.[0]?.[i] || 1),
            snippet: this.generateSnippet(results.documents[0][i], 150)
          });
        }
      }
      
      return searchResults;
    } catch (error) {
      console.error('[ConversationCollection] Failed to search conversations:', error);
      return [];
    }
  }

  /**
   * List conversations by vault and time (simplified recent conversations)
   */
  async listConversations(
    vaultName?: string,
    limit: number = 20
  ): Promise<ConversationSearchResult[]> {
    try {
      const whereClause: Record<string, any> = {};

      if (vaultName) {
        whereClause['metadata.vault_name'] = vaultName;
      }

      const results = await this.vectorStore.query(ConversationCollection.COLLECTION_NAME, {
        where: whereClause,
        nResults: limit,
        include: ['documents', 'metadatas']
      });

      if (!results.documents || !results.metadatas) {
        return [];
      }

      // Handle nested array results from vector store query
      const conversations: ConversationSearchResult[] = [];
      
      if (results.documents?.[0] && results.ids?.[0]) {
        for (let i = 0; i < results.documents[0].length; i++) {
          conversations.push({
            id: results.ids[0][i] || '',
            title: results.metadatas?.[0]?.[i]?.title || 'Untitled Conversation',
            summary: results.documents[0][i],
            metadata: results.metadatas?.[0]?.[i] as ConversationDocument['metadata'],
            relevanceScore: 1.0,
            snippet: this.generateSnippet(results.documents[0][i], 150)
          });
        }
      }

      // Sort by last_updated timestamp (most recent first)
      return conversations.sort((a, b) => b.metadata.last_updated - a.metadata.last_updated);
    } catch (error) {
      console.error('[ConversationCollection] Failed to list conversations:', error);
      return [];
    }
  }


  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    try {
      await this.vectorStore.deleteItems(ConversationCollection.COLLECTION_NAME, [conversationId]);
      console.log(`[ConversationCollection] Deleted conversation: ${conversationId}`);
    } catch (error) {
      console.error(`[ConversationCollection] Failed to delete conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * Get total conversation count
   */
  async getConversationCount(): Promise<number> {
    try {
      return await this.vectorStore.count(ConversationCollection.COLLECTION_NAME);
    } catch (error) {
      console.error('[ConversationCollection] Failed to get conversation count:', error);
      return 0;
    }
  }

  /**
   * Check if collection exists and is initialized
   */
  async exists(): Promise<boolean> {
    try {
      return await this.vectorStore.hasCollection(ConversationCollection.COLLECTION_NAME);
    } catch (error) {
      console.error('[ConversationCollection] Failed to check collection existence:', error);
      return false;
    }
  }

  /**
   * Get collection statistics for monitoring
   */
  async getStatistics(): Promise<{
    totalConversations: number;
    activeConversations: number;
    averageMessageCount: number;
    topicDistribution: Record<string, number>;
  }> {
    try {
      // Get all conversations for analysis using getAllItems
      const allItems = await this.vectorStore.getAllItems(ConversationCollection.COLLECTION_NAME);
      
      if (!allItems.metadatas) {
        return {
          totalConversations: 0,
          activeConversations: 0,
          averageMessageCount: 0,
          topicDistribution: {}
        };
      }

      const conversations = allItems.metadatas as ConversationDocument['metadata'][];
      const totalMessageCount = conversations.reduce((sum, c) => sum + c.message_count, 0);
      const averageMessageCount = conversations.length > 0 ? totalMessageCount / conversations.length : 0;

      // Simplified statistics - no topic distribution in minimal schema
      const topicDistribution: Record<string, number> = {};

      return {
        totalConversations: conversations.length,
        activeConversations: conversations.length, // All conversations are considered active in simplified schema
        averageMessageCount: Math.round(averageMessageCount * 100) / 100,
        topicDistribution
      };
    } catch (error) {
      console.error('[ConversationCollection] Failed to get statistics:', error);
      return {
        totalConversations: 0,
        activeConversations: 0,
        averageMessageCount: 0,
        topicDistribution: {}
      };
    }
  }

  /**
   * Generate a snippet from conversation summary
   */
  private generateSnippet(text: string, maxLength: number = 150): string {
    if (text.length <= maxLength) {
      return text;
    }
    
    const truncated = text.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) {
      return truncated.slice(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }

  /**
   * Add a conversation (alias for storeConversation for compatibility)
   */
  async addConversation(conversation: ConversationDocument): Promise<void> {
    return this.storeConversation(conversation);
  }

  /**
   * Get all conversations with pagination
   */
  async getAllConversations(limit: number = 50, offset: number = 0): Promise<ConversationDocument[]> {
    try {
      // Wait for vector store to be ready before querying
      await this.waitForVectorStore();

      const results = await this.vectorStore.query(ConversationCollection.COLLECTION_NAME, {
        nResults: limit,
        include: ['documents', 'metadatas', 'embeddings']
      });

      if (!results.documents || !results.metadatas || !results.embeddings) {
        return [];
      }

      const conversations: ConversationDocument[] = [];
      
      if (results.documents?.[0] && results.ids?.[0] && results.metadatas?.[0]) {
        const docs = results.documents[0];
        const ids = results.ids[0];
        const metadatas = results.metadatas[0];
        const embeddings = results.embeddings?.[0] || [];
        
        // Apply pagination offset
        const startIndex = offset;
        const endIndex = Math.min(startIndex + limit, docs.length);
        
        for (let i = startIndex; i < endIndex; i++) {
          conversations.push({
            id: ids[i] || '',
            document: docs[i] || '',
            metadata: metadatas[i] as ConversationDocument['metadata'],
            embedding: embeddings[i] || []
          });
        }
      }

      // Sort by last_updated timestamp (most recent first)
      return conversations.sort((a, b) => b.metadata.last_updated - a.metadata.last_updated);
    } catch (error) {
      console.error('[ConversationCollection] Failed to get all conversations:', error);
      return [];
    }
  }

  /**
   * Get conversations by vault name
   */
  async getConversationsByVault(vaultName: string, limit: number = 20): Promise<ConversationDocument[]> {
    try {
      // Wait for vector store to be ready before querying
      await this.waitForVectorStore();
      if (!(this.vectorStore as any).initialized || !(this.vectorStore as any).client) {
        return [];
      }

      const whereClause = {
        'metadata.vault_name': vaultName
      };

      const results = await this.vectorStore.query(ConversationCollection.COLLECTION_NAME, {
        where: whereClause,
        nResults: limit,
        include: ['documents', 'metadatas', 'embeddings']
      });

      if (!results.documents || !results.metadatas || !results.embeddings) {
        return [];
      }

      const conversations: ConversationDocument[] = [];
      
      if (results.documents?.[0] && results.ids?.[0] && results.metadatas?.[0]) {
        for (let i = 0; i < results.documents[0].length; i++) {
          conversations.push({
            id: results.ids[0][i] || '',
            document: results.documents[0][i] || '',
            metadata: results.metadatas[0][i] as ConversationDocument['metadata'],
            embedding: results.embeddings?.[0]?.[i] || []
          });
        }
      }

      // Sort by last_updated timestamp (most recent first)
      return conversations.sort((a, b) => b.metadata.last_updated - a.metadata.last_updated);
    } catch (error) {
      console.error('[ConversationCollection] Failed to get conversations by vault:', error);
      return [];
    }
  }

  /**
   * Get the collection name (useful for external references)
   */
  static getCollectionName(): string {
    return ConversationCollection.COLLECTION_NAME;
  }
}