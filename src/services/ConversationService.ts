// Location: src/services/ConversationService.ts
// Conversation management service with split-file storage
// Used by: ChatService, ConversationManager, UI components
// Dependencies: FileSystemService, IndexManager for data access

import { Plugin } from 'obsidian';
import { FileSystemService } from './storage/FileSystemService';
import { IndexManager } from './storage/IndexManager';
import { IndividualConversation, ConversationMetadata } from '../types/storage/StorageTypes';

export class ConversationService {
  constructor(
    private plugin: Plugin,
    private fileSystem: FileSystemService,
    private indexManager: IndexManager
  ) {}

  /**
   * List conversations (uses index only - lightweight and fast)
   */
  async listConversations(vaultName?: string, limit?: number): Promise<ConversationMetadata[]> {
    const index = await this.indexManager.loadConversationIndex();
    let conversations = Object.values(index.conversations);

    // Filter by vault if specified
    if (vaultName) {
      conversations = conversations.filter(conv => conv.vault_name === vaultName);
    }

    // Sort by updated timestamp (most recent first)
    conversations.sort((a, b) => b.updated - a.updated);

    // Apply limit if specified
    if (limit) {
      conversations = conversations.slice(0, limit);
    }

    return conversations;
  }

  /**
   * Get full conversation with messages (loads individual file)
   */
  async getConversation(id: string): Promise<IndividualConversation | null> {
    const conversation = await this.fileSystem.readConversation(id);

    if (!conversation) {
      console.warn(`[ConversationService] Conversation not found: ${id}`);
      return null;
    }

    return conversation;
  }

  /**
   * Get all conversations with full data (expensive - avoid if possible)
   */
  async getAllConversations(): Promise<IndividualConversation[]> {
    const conversationIds = await this.fileSystem.listConversationIds();
    const conversations: IndividualConversation[] = [];

    for (const id of conversationIds) {
      const conversation = await this.fileSystem.readConversation(id);
      if (conversation) {
        conversations.push(conversation);
      }
    }

    return conversations;
  }

  /**
   * Create new conversation (writes file + updates index)
   */
  async createConversation(data: Partial<IndividualConversation>): Promise<IndividualConversation> {
    const id = data.id || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const conversation: IndividualConversation = {
      id,
      title: data.title || 'Untitled Conversation',
      created: data.created || Date.now(),
      updated: data.updated || Date.now(),
      vault_name: data.vault_name || this.plugin.app.vault.getName(),
      message_count: data.messages?.length || 0,
      messages: data.messages || []
    };

    // Write conversation file
    await this.fileSystem.writeConversation(id, conversation);

    // Update index
    await this.indexManager.updateConversationInIndex(conversation);

    return conversation;
  }

  /**
   * Update conversation (updates file + index metadata)
   */
  async updateConversation(id: string, updates: Partial<IndividualConversation>): Promise<void> {
    // Load existing conversation
    const conversation = await this.fileSystem.readConversation(id);

    if (!conversation) {
      throw new Error(`Conversation ${id} not found`);
    }

    // Apply updates
    const updatedConversation: IndividualConversation = {
      ...conversation,
      ...updates,
      id, // Preserve ID
      updated: Date.now(),
      message_count: updates.messages?.length ?? conversation.message_count
    };

    // Write updated conversation
    await this.fileSystem.writeConversation(id, updatedConversation);

    // Update index
    await this.indexManager.updateConversationInIndex(updatedConversation);
  }

  /**
   * Delete conversation (deletes file + removes from index)
   */
  async deleteConversation(id: string): Promise<void> {
    // Delete conversation file
    await this.fileSystem.deleteConversation(id);

    // Remove from index
    await this.indexManager.removeConversationFromIndex(id);
  }

  /**
   * Update conversation metadata only (for chat settings persistence)
   */
  async updateConversationMetadata(id: string, metadata: any): Promise<void> {
    await this.updateConversation(id, { metadata });
  }

  /**
   * Add message to conversation (loads file, appends, saves, updates index)
   */
  async addMessage(params: {
    conversationId: string;
    role: 'user' | 'assistant' | 'tool';
    content: string;
    toolCalls?: any[];
    cost?: { totalCost: number; currency: string };
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    provider?: string;
    model?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Load conversation
      const conversation = await this.fileSystem.readConversation(params.conversationId);

      if (!conversation) {
        return {
          success: false,
          error: `Conversation ${params.conversationId} not found`
        };
      }

      // Create message
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const message = {
        id: messageId,
        role: params.role,
        content: params.content,
        timestamp: Date.now(),
        toolCalls: params.toolCalls || undefined,
        cost: params.cost,
        usage: params.usage,
        provider: params.provider,
        model: params.model
      };

      // Append message
      conversation.messages.push(message);
      conversation.message_count = conversation.messages.length;
      conversation.updated = Date.now();

      // Update conversation-level cost summary
      if (params.cost) {
        conversation.metadata = conversation.metadata || {};
        conversation.metadata.totalCost = (conversation.metadata.totalCost || 0) + params.cost.totalCost;
        conversation.metadata.currency = params.cost.currency;
      }

      if (params.usage) {
        conversation.metadata = conversation.metadata || {};
        conversation.metadata.totalTokens = (conversation.metadata.totalTokens || 0) + params.usage.totalTokens;
      }

      // Save conversation
      await this.fileSystem.writeConversation(params.conversationId, conversation);

      // Update index metadata
      await this.indexManager.updateConversationInIndex(conversation);

      return {
        success: true,
        messageId
      };
    } catch (error) {
      console.error('[ConversationService] Failed to add message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Search conversations (uses index search data)
   */
  async searchConversations(query: string, limit?: number): Promise<ConversationMetadata[]> {
    if (!query) {
      return this.listConversations(undefined, limit);
    }

    const index = await this.indexManager.loadConversationIndex();
    const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const matchedIds = new Set<string>();

    // Search title and content indices
    for (const word of words) {
      // Search titles
      if (index.byTitle[word]) {
        index.byTitle[word].forEach(id => matchedIds.add(id));
      }

      // Search content
      if (index.byContent[word]) {
        index.byContent[word].forEach(id => matchedIds.add(id));
      }
    }

    // Get metadata for matched conversations
    const results = Array.from(matchedIds)
      .map(id => index.conversations[id])
      .filter(conv => conv !== undefined)
      .sort((a, b) => b.updated - a.updated);

    // Apply limit
    const limited = limit ? results.slice(0, limit) : results;

    return limited;
  }

  /**
   * Get conversations by vault (uses index)
   */
  async getConversationsByVault(vaultName: string): Promise<ConversationMetadata[]> {
    return this.listConversations(vaultName);
  }

  /**
   * Search conversations by date range (uses index)
   */
  async searchConversationsByDateRange(startDate: number, endDate: number): Promise<ConversationMetadata[]> {
    const index = await this.indexManager.loadConversationIndex();
    const matchedIds = new Set<string>();

    // Check each date range bucket
    for (const bucket of index.byDateRange) {
      // If bucket overlaps with search range, add its conversations
      if (bucket.start <= endDate && bucket.end >= startDate) {
        bucket.conversationIds.forEach(id => matchedIds.add(id));
      }
    }

    // Get metadata and filter by exact date range
    const results = Array.from(matchedIds)
      .map(id => index.conversations[id])
      .filter(conv => conv && conv.created >= startDate && conv.created <= endDate)
      .sort((a, b) => b.created - a.created);

    return results;
  }

  /**
   * Get recent conversations (uses index)
   */
  async getRecentConversations(limit: number = 10): Promise<ConversationMetadata[]> {
    return this.listConversations(undefined, limit);
  }

  /**
   * Get conversation stats (uses index)
   */
  async getConversationStats(): Promise<{
    totalConversations: number;
    totalMessages: number;
    vaultCounts: Record<string, number>;
    oldestConversation?: number;
    newestConversation?: number;
  }> {
    const index = await this.indexManager.loadConversationIndex();
    const conversations = Object.values(index.conversations);

    const stats = {
      totalConversations: conversations.length,
      totalMessages: 0,
      vaultCounts: {} as Record<string, number>,
      oldestConversation: undefined as number | undefined,
      newestConversation: undefined as number | undefined
    };

    if (conversations.length === 0) {
      return stats;
    }

    let oldest = Infinity;
    let newest = 0;

    for (const conv of conversations) {
      stats.totalMessages += conv.message_count || 0;

      // Count by vault
      const vault = conv.vault_name || 'Unknown';
      stats.vaultCounts[vault] = (stats.vaultCounts[vault] || 0) + 1;

      // Track date range
      if (conv.created < oldest) oldest = conv.created;
      if (conv.created > newest) newest = conv.created;
    }

    stats.oldestConversation = oldest === Infinity ? undefined : oldest;
    stats.newestConversation = newest === 0 ? undefined : newest;

    return stats;
  }
}