/**
 * ChatDatabaseService - Simplified coordinator for chat database operations
 * 
 * Central service that orchestrates core chat database functionality:
 * - Repository operations for CRUD
 * - Collection management
 * - Basic health monitoring
 * - Integration with existing plugin services
 * 
 * Based on: /docs/architecture/database-architecture-specification.md (simplified design)
 */

import type { IVectorStore } from '../../interfaces/IVectorStore';
import type { EmbeddingService } from '../core/EmbeddingService';
import { ConversationRepository } from './ConversationRepository';
import { ChatCollectionService } from './ChatCollectionService';
import type {
  ConversationData,
  ConversationSearchOptions,
  ConversationSearchResult,
  CreateConversationParams,
  AddMessageParams,
  UpdateConversationParams,
  ConversationOperationResult,
  MessageQueryOptions,
  PaginatedMessages,
  ChatDatabaseHealth,
  ChatCollectionStats
} from '../../../types/chat/ChatTypes';

export interface ChatDatabaseConfig {
  enableHealthMonitoring?: boolean;
  healthCheckInterval?: number;
}

export interface ChatServiceInitResult {
  success: boolean;
  collectionReady: boolean;
  errors: string[];
  initTime: number;
}

/**
 * Simplified chat database service coordinator
 */
export class ChatDatabaseService {
  private repository: ConversationRepository;
  private collectionService: ChatCollectionService;
  private config: ChatDatabaseConfig;
  private initialized = false;

  constructor(
    private vectorStore: IVectorStore,
    private embeddingService: EmbeddingService,
    config: ChatDatabaseConfig = {}
  ) {
    this.config = {
      enableHealthMonitoring: false,
      healthCheckInterval: 60000, // 1 minute
      ...config
    };

    // Initialize core components
    this.repository = new ConversationRepository(vectorStore, embeddingService);
    this.collectionService = new ChatCollectionService(
      vectorStore,
      embeddingService,
      {
        enableHealthChecks: this.config.enableHealthMonitoring,
        healthCheckInterval: this.config.healthCheckInterval
      }
    );
  }

  // =============================================================================
  // INITIALIZATION AND LIFECYCLE
  // =============================================================================

  /**
   * Initialize the chat database service
   */
  async initialize(): Promise<ChatServiceInitResult> {
    const startTime = Date.now();
    const result: ChatServiceInitResult = {
      success: false,
      collectionReady: false,
      errors: [],
      initTime: 0
    };

    try {
      console.log('[ChatDatabaseService] Initializing chat database...');

      // Initialize collection service and repository
      await this.collectionService.initialize();
      await this.repository.initialize();

      // Verify collection is ready
      result.collectionReady = await this.collectionService.exists();

      result.success = true;
      result.initTime = Date.now() - startTime;
      this.initialized = true;

      console.log(`[ChatDatabaseService] Initialization completed in ${result.initTime}ms`);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Initialization failed: ${errorMessage}`);
      result.initTime = Date.now() - startTime;
      
      console.error('[ChatDatabaseService] Initialization failed:', error);
      return result;
    }
  }

  /**
   * Check if the service is initialized and ready
   */
  async isReady(): Promise<boolean> {
    return this.initialized && await this.repository.isHealthy();
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    await this.collectionService.shutdown();
    this.initialized = false;
    console.log('[ChatDatabaseService] Service shutdown complete');
  }

  // =============================================================================
  // CONVERSATION OPERATIONS (Delegated to Repository)
  // =============================================================================

  /**
   * Create a new conversation
   */
  async createConversation(params: CreateConversationParams): Promise<ConversationOperationResult> {
    if (!this.initialized) {
      return { success: false, error: 'Service not initialized' };
    }

    return await this.repository.createConversation(params);
  }

  /**
   * Get a conversation by ID
   */
  async getConversation(conversationId: string): Promise<ConversationData | null> {
    if (!this.initialized) return null;
    return await this.repository.getConversation(conversationId);
  }

  /**
   * Update a conversation
   */
  async updateConversation(
    conversationId: string,
    updates: UpdateConversationParams
  ): Promise<ConversationOperationResult> {
    if (!this.initialized) {
      return { success: false, error: 'Service not initialized' };
    }

    return await this.repository.updateConversation(conversationId, updates);
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<ConversationOperationResult> {
    if (!this.initialized) {
      return { success: false, error: 'Service not initialized' };
    }

    return await this.repository.deleteConversation(conversationId);
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(params: AddMessageParams): Promise<ConversationOperationResult> {
    if (!this.initialized) {
      return { success: false, error: 'Service not initialized' };
    }

    return await this.repository.addMessage(params);
  }

  /**
   * Get messages from a conversation
   */
  async getMessages(
    conversationId: string,
    options: MessageQueryOptions = {}
  ): Promise<PaginatedMessages | null> {
    if (!this.initialized) return null;
    return await this.repository.getMessages(conversationId, options);
  }

  // =============================================================================
  // SEARCH OPERATIONS (Simplified)
  // =============================================================================

  /**
   * Search conversations by semantic similarity
   */
  async searchConversations(
    query: string,
    options: ConversationSearchOptions = {}
  ): Promise<ConversationSearchResult[]> {
    if (!this.initialized) return [];
    return await this.repository.searchConversations(query, options);
  }

  /**
   * List conversations for a vault
   */
  async listConversations(
    vaultName?: string,
    limit: number = 20
  ): Promise<ConversationSearchResult[]> {
    if (!this.initialized) return [];
    return await this.repository.listConversations(vaultName, limit);
  }

  // =============================================================================
  // STATISTICS AND HEALTH
  // =============================================================================

  /**
   * Get basic database statistics
   */
  async getStatistics(): Promise<ChatCollectionStats> {
    if (!this.initialized) {
      return {
        totalConversations: 0,
        totalMessages: 0,
        averageMessagesPerConversation: 0,
        storageSize: 0,
        lastUpdated: Date.now()
      };
    }

    const stats = await this.repository.getStatistics();
    return {
      ...stats,
      storageSize: 0, // Not calculated in simplified version
      lastUpdated: Date.now()
    };
  }

  /**
   * Get database health status
   */
  async getHealthStatus(): Promise<ChatDatabaseHealth> {
    return await this.collectionService.checkHealth();
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Check if a conversation exists
   */
  async conversationExists(conversationId: string): Promise<boolean> {
    if (!this.initialized) return false;
    return await this.repository.conversationExists(conversationId);
  }

  /**
   * Get collection service instance
   */
  getCollectionService(): ChatCollectionService {
    return this.collectionService;
  }

  /**
   * Get repository instance
   */
  getRepository(): ConversationRepository {
    return this.repository;
  }
}