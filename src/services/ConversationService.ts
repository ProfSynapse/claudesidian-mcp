import { Plugin } from 'obsidian';
import { FileSystemService } from './migration/FileSystemService';
import { ConversationDataStructure } from '../types/migration/MigrationTypes';

/**
 * Location: src/services/ConversationService.ts
 *
 * ConversationService for managing conversation data using the new JSON structure.
 * Handles conversations stored in .data/conversations.json with search capabilities.
 *
 * Used by: Chat-related agents and features for conversation management
 * Integrates with: FileSystemService for data persistence
 */
export class ConversationService {
  private plugin: Plugin;
  private fileSystem: FileSystemService;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.fileSystem = new FileSystemService(plugin);
  }

  async getAllConversations(): Promise<any[]> {
    const data = await this.loadConversationData();
    return Object.values(data.conversations);
  }

  async getConversation(id: string): Promise<any | undefined> {
    const data = await this.loadConversationData();
    return data.conversations[id];
  }

  async createConversation(conversation: any): Promise<any> {
    const data = await this.loadConversationData();

    const convId = conversation.id || Date.now().toString();
    data.conversations[convId] = {
      ...conversation,
      id: convId,
      created: Date.now(),
      updated: Date.now()
    };

    await this.saveConversationData(data);
    return data.conversations[convId];
  }

  async updateConversation(id: string, updates: any): Promise<void> {
    const data = await this.loadConversationData();

    if (!data.conversations[id]) {
      throw new Error(`Conversation ${id} not found`);
    }

    data.conversations[id] = {
      ...data.conversations[id],
      ...updates,
      updated: Date.now()
    };

    await this.saveConversationData(data);
  }

  async deleteConversation(id: string): Promise<void> {
    const data = await this.loadConversationData();

    if (!data.conversations[id]) {
      throw new Error(`Conversation ${id} not found`);
    }

    delete data.conversations[id];
    await this.saveConversationData(data);
  }

  async addMessage(conversationId: string, message: any): Promise<void> {
    const data = await this.loadConversationData();

    if (!data.conversations[conversationId]) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const conversation = data.conversations[conversationId];

    if (!conversation.messages) {
      conversation.messages = [];
    }

    const messageWithId = {
      ...message,
      id: message.id || Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: message.timestamp || Date.now()
    };

    conversation.messages.push(messageWithId);
    conversation.message_count = conversation.messages.length;
    conversation.updated = Date.now();

    await this.saveConversationData(data);
  }

  async getConversationsByVault(vaultName: string): Promise<any[]> {
    const conversations = await this.getAllConversations();
    return conversations.filter(conv => conv.vault_name === vaultName);
  }

  async searchConversations(query: string, limit?: number): Promise<any[]> {
    const conversations = await this.getAllConversations();

    if (!query) {
      return limit ? conversations.slice(0, limit) : conversations;
    }

    const filtered = conversations.filter(conv =>
      conv.title.toLowerCase().includes(query.toLowerCase()) ||
      conv.messages.some((msg: any) =>
        msg.content.toLowerCase().includes(query.toLowerCase())
      )
    );

    return limit ? filtered.slice(0, limit) : filtered;
  }

  async searchConversationsByDateRange(startDate: number, endDate: number): Promise<any[]> {
    const conversations = await this.getAllConversations();

    return conversations.filter(conv =>
      conv.created >= startDate && conv.created <= endDate
    );
  }

  async getRecentConversations(limit: number = 10): Promise<any[]> {
    const conversations = await this.getAllConversations();

    return conversations
      .sort((a, b) => b.updated - a.updated)
      .slice(0, limit);
  }

  async listConversations(vaultName?: string, limit?: number): Promise<any[]> {
    const conversations = await this.getAllConversations();

    let filtered = conversations;

    // Filter by vault if specified
    if (vaultName) {
      filtered = conversations.filter(conv => conv.vault_name === vaultName);
    }

    // Sort by last updated (most recent first)
    filtered.sort((a, b) => (b.updated || 0) - (a.updated || 0));

    // Apply limit if specified
    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }

  async getConversationStats(): Promise<{
    totalConversations: number;
    totalMessages: number;
    vaultCounts: Record<string, number>;
    oldestConversation?: number;
    newestConversation?: number;
  }> {
    const conversations = await this.getAllConversations();

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

  private async loadConversationData(): Promise<ConversationDataStructure> {
    const data = await this.fileSystem.readJSON('conversations.json');

    if (!data) {
      return {
        conversations: {},
        metadata: {
          version: '2.0.0',
          lastUpdated: Date.now(),
          totalConversations: 0
        }
      };
    }

    return data;
  }

  private async saveConversationData(data: ConversationDataStructure): Promise<void> {
    data.metadata.lastUpdated = Date.now();
    data.metadata.totalConversations = Object.keys(data.conversations).length;
    await this.fileSystem.writeJSON('conversations.json', data);
  }
}