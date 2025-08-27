/**
 * ChatCollectionService - Collection management service for chat conversations
 * 
 * Provides essential collection management operations including initialization,
 * health monitoring, and basic maintenance for the simplified single collection design.
 * 
 * Based on: /docs/architecture/database-architecture-specification.md
 */

import { ConversationCollection } from '../../collections/ConversationCollection';
import type { IVectorStore } from '../../interfaces/IVectorStore';
import type { EmbeddingService } from '../core/EmbeddingService';
import type {
  ChatDatabaseHealth,
  ChatCollectionStats,
  ChatCollectionConfig
} from '../../../types/chat/ChatTypes';

export interface CollectionServiceConfig {
  enableHealthChecks?: boolean;
  healthCheckInterval?: number; // in milliseconds
  collectionName?: string;
}

export class ChatCollectionService {
  private collection: ConversationCollection;
  private config: CollectionServiceConfig;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    private vectorStore: IVectorStore,
    private embeddingService: EmbeddingService,
    config: CollectionServiceConfig = {}
  ) {
    this.collection = new ConversationCollection(vectorStore);
    this.config = {
      enableHealthChecks: false,
      healthCheckInterval: 60000, // 1 minute
      collectionName: 'chat_conversations',
      ...config
    };
  }

  // =============================================================================
  // COLLECTION LIFECYCLE
  // =============================================================================

  /**
   * Initialize the chat collection service
   */
  async initialize(): Promise<void> {
    try {
      await this.collection.initialize();
      
      if (this.config.enableHealthChecks) {
        this.startHealthChecks();
      }

      console.log('[ChatCollectionService] Service initialized successfully');
    } catch (error) {
      console.error('[ChatCollectionService] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Shutdown the collection service
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    console.log('[ChatCollectionService] Service shutdown complete');
  }

  // =============================================================================
  // HEALTH MONITORING
  // =============================================================================

  /**
   * Check the health of the chat database
   */
  async checkHealth(): Promise<ChatDatabaseHealth> {
    try {
      const exists = await this.collection.exists();
      const itemCount = exists ? await this.collection.getConversationCount() : 0;

      const health: ChatDatabaseHealth = {
        healthy: exists,
        collections: {
          chat_conversations: {
            exists,
            accessible: exists,
            itemCount
          }
        },
        lastCheck: Date.now(),
        issues: []
      };

      if (!exists) {
        health.issues.push('chat_conversations collection does not exist');
      }

      return health;

    } catch (error) {
      return {
        healthy: false,
        collections: {
          chat_conversations: {
            exists: false,
            accessible: false,
            itemCount: 0
          }
        },
        lastCheck: Date.now(),
        issues: [`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.checkHealth();
        if (!health.healthy) {
          console.warn('[ChatCollectionService] Health check failed:', health.issues);
        }
      } catch (error) {
        console.error('[ChatCollectionService] Health check error:', error);
      }
    }, this.config.healthCheckInterval);
  }

  // =============================================================================
  // COLLECTION STATISTICS
  // =============================================================================

  /**
   * Get collection statistics
   */
  async getCollectionStats(): Promise<ChatCollectionStats> {
    try {
      const stats = await this.collection.getStatistics();
      
      return {
        totalConversations: stats.totalConversations,
        totalMessages: Math.round(stats.totalConversations * stats.averageMessageCount),
        averageMessagesPerConversation: stats.averageMessageCount,
        storageSize: 0, // Not available in simplified implementation
        lastUpdated: Date.now()
      };

    } catch (error) {
      console.error('[ChatCollectionService] Failed to get collection stats:', error);
      return {
        totalConversations: 0,
        totalMessages: 0,
        averageMessagesPerConversation: 0,
        storageSize: 0,
        lastUpdated: Date.now()
      };
    }
  }

  // =============================================================================
  // COLLECTION CONFIGURATION
  // =============================================================================

  /**
   * Get current collection configuration
   */
  getCollectionConfig(): ChatCollectionConfig {
    return {
      name: this.config.collectionName || 'chat_conversations',
      distance: 'cosine',
      description: 'Native chatbot conversations with embedded summaries',
      metadata: {
        version: '2.0.0',
        created_by: 'ChatCollectionService',
        index_type: 'conversation_semantic',
        retention_policy: 'user_controlled'
      }
    };
  }

  /**
   * Check if collection exists
   */
  async exists(): Promise<boolean> {
    return await this.collection.exists();
  }

  // =============================================================================
  // MAINTENANCE OPERATIONS
  // =============================================================================

  /**
   * Recreate the collection (useful for schema migrations)
   */
  async recreateCollection(): Promise<void> {
    try {
      // Note: This would delete all existing data
      // In a production system, this should include backup/restore logic
      console.warn('[ChatCollectionService] Recreation would delete existing data - not implemented in simplified version');
      
      // For now, just ensure collection is initialized
      await this.collection.initialize();
      
    } catch (error) {
      console.error('[ChatCollectionService] Failed to recreate collection:', error);
      throw error;
    }
  }

  /**
   * Get collection instance for direct access
   */
  getCollection(): ConversationCollection {
    return this.collection;
  }

  /**
   * Get collection name
   */
  getCollectionName(): string {
    return ConversationCollection.getCollectionName();
  }
}