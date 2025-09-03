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
        messages: [],
        branches: {
          'main': {
            createdFrom: '',
            lastMessageId: '',
            isActive: true
          }
        },
        activeBranchId: 'main',
        mainBranchId: 'main'
      };

      // Add initial message if provided
      if (params.initialMessage) {
        const messageId = `msg_${now}_${uuidv4().slice(0, 8)}`;
        conversationData.messages.push({
          id: messageId,
          role: params.initialMessage.role,
          content: params.initialMessage.content,
          timestamp: now,
          branchId: 'main'
        });
        
        // Update main branch lastMessageId
        conversationData.branches['main'].lastMessageId = messageId;
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
      const activeBranchId = conversation.activeBranchId || conversation.mainBranchId || 'main';
      
      const newMessage: ConversationMessage = {
        id: messageId,
        role: params.role,
        content: params.content,
        timestamp: now,
        tool_calls: params.toolCalls,
        branchId: activeBranchId
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
  // BRANCH OPERATIONS
  // =============================================================================

  /**
   * Create a new branch from a specific message
   */
  async createBranch(conversationId: string, fromMessageId: string): Promise<string> {
    try {
      const document = await this.collection.getConversation(conversationId);
      if (!document) {
        throw new Error('Conversation not found');
      }

      const conversation = document.metadata.conversation;
      const fromMessage = conversation.messages.find(msg => msg.id === fromMessageId);
      if (!fromMessage) {
        throw new Error('Message not found');
      }

      // Generate new branch ID
      const branchId = `branch_${Date.now()}_${uuidv4().slice(0, 8)}`;
      
      // Add branch to conversation
      if (!conversation.branches) {
        conversation.branches = {};
      }
      
      conversation.branches[branchId] = {
        createdFrom: fromMessageId,
        lastMessageId: fromMessageId,
        isActive: false
      };

      // Initialize main branch if not exists
      if (!conversation.mainBranchId) {
        conversation.mainBranchId = 'main';
        conversation.branches['main'] = {
          createdFrom: conversation.messages[0]?.id || '',
          lastMessageId: conversation.messages[conversation.messages.length - 1]?.id || '',
          isActive: conversation.activeBranchId === 'main' || !conversation.activeBranchId
        };
      }

      // Update conversation metadata
      conversation.last_updated = Date.now();
      
      // Generate document content for embedding
      const documentContent = this.extractConversationContent(conversation);
      const embedding = await this.embeddingService.getEmbedding(documentContent) || [];
      
      // Save updated conversation with proper format
      const metadata = { ...document.metadata };
      metadata.conversation = conversation;
      metadata.last_updated = conversation.last_updated;
      metadata.message_count = conversation.messages.length;
      
      await this.collection.updateConversation(conversationId, {
        embedding,
        document: documentContent,
        metadata
      });

      return branchId;
    } catch (error) {
      console.error(`[ConversationRepository] Failed to create branch:`, error);
      throw error;
    }
  }

  /**
   * Switch to a different branch
   */
  async switchToBranch(conversationId: string, branchId: string): Promise<void> {
    try {
      const document = await this.collection.getConversation(conversationId);
      if (!document) {
        throw new Error('Conversation not found');
      }

      const conversation = document.metadata.conversation;
      if (!conversation.branches?.[branchId]) {
        throw new Error('Branch not found');
      }

      // Update branch active states
      Object.keys(conversation.branches).forEach(id => {
        conversation.branches[id].isActive = id === branchId;
      });
      
      conversation.activeBranchId = branchId;
      conversation.last_updated = Date.now();
      
      // Generate document content for embedding
      const documentContent = this.extractConversationContent(conversation);
      const embedding = await this.embeddingService.getEmbedding(documentContent) || [];
      
      // Update metadata with new conversation data
      const metadata = { ...document.metadata };
      metadata.conversation = conversation;
      metadata.last_updated = conversation.last_updated;
      metadata.message_count = conversation.messages.length;

      await this.collection.updateConversation(conversationId, {
        embedding,
        document: documentContent,
        metadata
      });
    } catch (error) {
      console.error(`[ConversationRepository] Failed to switch branch:`, error);
      throw error;
    }
  }

  /**
   * Get messages for a specific branch
   */
  async getBranchMessages(conversationId: string, branchId: string): Promise<ConversationMessage[]> {
    try {
      const document = await this.collection.getConversation(conversationId);
      if (!document) {
        throw new Error('Conversation not found');
      }

      const conversation = document.metadata.conversation;
      const branch = conversation.branches?.[branchId];
      if (!branch) {
        throw new Error('Branch not found');
      }

      // For main branch, return all messages up to the branch point
      if (branchId === conversation.mainBranchId) {
        return conversation.messages.filter(msg => 
          msg.branchId === branchId || !msg.branchId // Backward compatibility
        );
      }

      // For other branches, find messages from branch point onwards
      const branchPoint = conversation.messages.findIndex(msg => msg.id === branch.createdFrom);
      if (branchPoint === -1) {
        return [];
      }

      // Include messages up to branch point + messages in this branch
      const preBranchMessages = conversation.messages.slice(0, branchPoint + 1);
      const branchMessages = conversation.messages.filter(msg => msg.branchId === branchId);
      
      return [...preBranchMessages, ...branchMessages];
    } catch (error) {
      console.error(`[ConversationRepository] Failed to get branch messages:`, error);
      throw error;
    }
  }

  /**
   * Add message to a specific branch
   */
  async addMessageToBranch(
    conversationId: string, 
    branchId: string, 
    params: Omit<AddMessageParams, 'conversationId'>
  ): Promise<ConversationOperationResult> {
    try {
      const document = await this.collection.getConversation(conversationId);
      if (!document) {
        return { success: false, error: 'Conversation not found' };
      }

      const conversation = document.metadata.conversation;
      const branch = conversation.branches?.[branchId];
      if (!branch) {
        return { success: false, error: 'Branch not found' };
      }

      // Create message with branch ID
      const messageId = `msg_${Date.now()}_${uuidv4().slice(0, 8)}`;
      const newMessage: ConversationMessage = {
        id: messageId,
        role: params.role,
        content: params.content,
        timestamp: Date.now(),
        tool_calls: params.toolCalls,
        branchId: branchId,
        parentMessageId: branch.lastMessageId
      };

      // Add message to conversation
      conversation.messages.push(newMessage);
      
      // Update branch metadata
      branch.lastMessageId = messageId;
      conversation.last_updated = Date.now();

      // Update metadata
      const metadata = { ...document.metadata };
      metadata.conversation = conversation;
      metadata.last_updated = conversation.last_updated;
      metadata.message_count = conversation.messages.length;

      // Generate new summary embedding
      const summary = this.extractConversationContent(conversation);
      const embedding = await this.embeddingService.getEmbedding(summary) || [];
      
      await this.collection.updateConversation(conversationId, {
        embedding,
        document: summary,
        metadata
      });

      return {
        success: true,
        conversationId,
        messageId
      };
    } catch (error) {
      console.error(`[ConversationRepository] Failed to add message to branch:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
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