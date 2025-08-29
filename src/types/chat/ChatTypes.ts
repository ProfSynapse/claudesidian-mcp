/**
 * Chat Types - Type definitions for the native chatbot ChromaDB infrastructure
 * 
 * Implements the simplified single collection design from the database architecture specification.
 * This focuses on essential functionality without complex multi-collection relationships.
 * 
 * Based on: /docs/architecture/database-architecture-specification.md
 */

// =============================================================================
// CORE CONVERSATION TYPES (Simplified Schema)
// =============================================================================

/**
 * Complete conversation data stored in conversation metadata
 */
export interface ConversationData {
  id: string;
  title: string;
  created_at: number;
  last_updated: number;
  messages: ConversationMessage[];
}

/**
 * Individual message within a conversation
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tool_calls?: ToolCall[];
  isLoading?: boolean;  // For UI loading state
}

/**
 * Tool execution data within messages
 */
export interface ToolCall {
  id: string;
  name: string;                  // agent.mode format (e.g., "contentManager.read")
  parameters: Record<string, any>;
  result?: any;
  success: boolean;
  error?: string;
  executionTime?: number;        // Execution time in milliseconds
}

/**
 * ChromaDB document structure for conversations
 * Single collection: chat_conversations
 */
export interface ConversationDocument {
  id: string;                    // Format: "conv_{timestamp}_{uuid}"
  embedding: number[];           // Summary embedding for semantic search
  document: string;              // Conversation summary
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

// =============================================================================
// SEARCH AND QUERY TYPES
// =============================================================================

/**
 * Options for searching conversations
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
  metadata: ConversationDocument['metadata'];
  relevanceScore: number;
  snippet?: string;
}

/**
 * Options for message operations within conversations
 */
export interface MessageQueryOptions {
  limit?: number;
  offset?: number;
  role?: 'user' | 'assistant';
  afterTimestamp?: number;
}

/**
 * Paginated message results
 */
export interface PaginatedMessages {
  messages: ConversationMessage[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// =============================================================================
// REPOSITORY AND SERVICE TYPES
// =============================================================================

/**
 * Parameters for creating a new conversation
 */
export interface CreateConversationParams {
  title: string;
  vaultName: string;
  sessionId?: string;
  initialMessage?: {
    role: 'user' | 'assistant';
    content: string;
  };
}

/**
 * Parameters for adding messages to conversations
 */
export interface AddMessageParams {
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
}

/**
 * Parameters for updating conversation metadata
 */
export interface UpdateConversationParams {
  title?: string;
  messages?: ConversationMessage[];
}

/**
 * Result of conversation operations
 */
export interface ConversationOperationResult {
  success: boolean;
  conversationId?: string;
  messageId?: string;
  error?: string;
}

/**
 * Bulk operation results
 */
export interface BulkOperationResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
}

// =============================================================================
// COLLECTION CONFIGURATION TYPES
// =============================================================================

/**
 * Collection configuration for ChromaDB
 */
export interface ChatCollectionConfig {
  name: string;
  distance: 'cosine' | 'euclidean' | 'manhattan';
  description: string;
  metadata: {
    version: string;
    created_by: string;
    index_type: string;
    retention_policy: string;
  };
}

/**
 * Collection statistics for monitoring
 */
export interface ChatCollectionStats {
  totalConversations: number;
  totalMessages: number;
  averageMessagesPerConversation: number;
  storageSize: number;
  lastUpdated: number;
}

// =============================================================================
// ERROR AND HEALTH MONITORING TYPES
// =============================================================================

/**
 * Chat database health status
 */
export interface ChatDatabaseHealth {
  healthy: boolean;
  collections: {
    chat_conversations: {
      exists: boolean;
      accessible: boolean;
      itemCount: number;
    };
  };
  lastCheck: number;
  issues: string[];
}

/**
 * Performance metrics for chat operations
 */
export interface ChatPerformanceMetrics {
  averageQueryTime: number;
  averageInsertTime: number;
  cacheHitRate: number;
  errorRate: number;
  lastMeasured: number;
}

// =============================================================================
// VALIDATION AND MIGRATION TYPES
// =============================================================================

/**
 * Validation result for conversation data
 */
export interface ConversationValidationResult {
  valid: boolean;
  conversationId: string;
  issues: string[];
  warnings: string[];
}

/**
 * Migration information for schema changes
 */
export interface ChatSchemaMigration {
  fromVersion: string;
  toVersion: string;
  description: string;
  requiredActions: string[];
  dataLossRisk: boolean;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Conversation summary data for display
 */
export interface ConversationSummary {
  id: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  lastUpdated: number;
  vaultName: string;
}

/**
 * Export format for conversation data
 */
export interface ConversationExport {
  metadata: {
    exportedAt: number;
    pluginVersion: string;
    schemaVersion: string;
  };
  conversations: ConversationData[];
}

// =============================================================================
// MCP AGENT PARAMETER TYPES (For ChatAgent modes)
// =============================================================================

import { CommonParameters, CommonResult } from '../index';

// Send Message Parameters
export interface SendMessageParams extends CommonParameters {
  conversationId: string;
  message: string;
  streamResponse?: boolean;
}

// Stream Message Parameters
export interface StreamMessageParams extends CommonParameters {
  conversationId: string;
  message: string;
  includeContext?: boolean;
}

// Get Conversation Parameters
export interface GetConversationParams extends CommonParameters {
  conversationId: string;
  includeMessages?: boolean;
}

// List Conversations Parameters
export interface ListConversationsParams extends CommonParameters {
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'last_updated' | 'message_count';
  sortOrder?: 'asc' | 'desc';
}

// Delete Conversation Parameters
export interface DeleteConversationParams extends CommonParameters {
  conversationId: string;
  confirm?: boolean;
}

// Search Conversations Parameters
export interface SearchConversationsParams extends CommonParameters {
  query: string;
  limit?: number;
  includeSnippets?: boolean;
  minRelevanceScore?: number;
}

// === MCP Agent Result Types ===

// Send Message Result
export interface SendMessageResult extends CommonResult {
  conversationId: string;
  messageId: string;
  response: string;
  toolCalls?: ToolCall[];
}

// Stream Message Result
export interface StreamMessageResult extends CommonResult {
  conversationId: string;
  messageId: string;
  streamCompleted: boolean;
}

// Get Conversation Result
export interface GetConversationResult extends CommonResult {
  conversation: ConversationData | null;
}

// List Conversations Result
export interface ListConversationsResult extends CommonResult {
  conversations: ConversationSummary[];
  total: number;
  hasMore: boolean;
}

// Delete Conversation Result
export interface DeleteConversationResult extends CommonResult {
  conversationId: string;
  deleted: boolean;
}

// Search Conversations Result
export interface SearchConversationsResult extends CommonResult {
  results: ConversationSearchResult[];
  totalFound: number;
}