// Location: src/services/migration/SearchIndexBuilder.ts
// Builds keyword-based search indexes for the new JSON data structure
// Used by: DataMigrationService to create searchable indexes for workspaces and conversations
// Dependencies: MigrationTypes for data structure definitions

import { WorkspaceDataStructure, ConversationDataStructure, WorkspaceSearchIndex, ConversationSearchIndex } from '../../types/migration/MigrationTypes';

export class SearchIndexBuilder {

  buildWorkspaceIndex(data: WorkspaceDataStructure): WorkspaceSearchIndex {
    console.log('[Claudesidian] Building workspace search index...');

    const index: WorkspaceSearchIndex = {
      byName: {},
      byDescription: {},
      byFolder: {},
      sessionsByWorkspace: {},
      sessionsByName: {},
      tracesByTool: {},
      tracesByType: {},
      lastUpdated: Date.now()
    };

    let totalWorkspaces = 0;
    let totalSessions = 0;
    let totalTraces = 0;

    for (const [workspaceId, workspace] of Object.entries(data.workspaces)) {
      totalWorkspaces++;

      // Index workspace by name
      this.addToIndex(index.byName, workspace.name, workspaceId);

      // Index workspace by description
      if (workspace.description) {
        this.addToIndex(index.byDescription, workspace.description, workspaceId);
      }

      // Index workspace by folder
      index.byFolder[workspace.rootFolder] = workspaceId;

      // Index sessions by workspace
      const sessionIds = Object.keys(workspace.sessions);
      index.sessionsByWorkspace[workspaceId] = sessionIds;

      // Index sessions and traces
      for (const [sessionId, session] of Object.entries(workspace.sessions)) {
        totalSessions++;

        // Index session by name
        if (session.name) {
          this.addToIndex(index.sessionsByName, session.name, sessionId);
        }

        // Index session by description
        if (session.description) {
          this.addToIndex(index.sessionsByName, session.description, sessionId);
        }

        // Index memory traces
        for (const trace of Object.values(session.memoryTraces)) {
          totalTraces++;

          if (trace.metadata?.tool) {
            this.addToIndex(index.tracesByTool, trace.metadata.tool, trace.id);
          }
          this.addToIndex(index.tracesByType, trace.type, trace.id);

          // Index trace content for text search
          if (trace.content) {
            this.addToIndex(index.tracesByType, trace.content, trace.id);
          }
        }
      }
    }

    console.log(`[Claudesidian] Workspace index built: ${totalWorkspaces} workspaces, ${totalSessions} sessions, ${totalTraces} traces`);
    return index;
  }

  buildConversationIndex(data: ConversationDataStructure): ConversationSearchIndex {
    console.log('[Claudesidian] Building conversation search index...');

    const index: ConversationSearchIndex = {
      byTitle: {},
      byContent: {},
      byVault: {},
      byDateRange: [],
      lastUpdated: Date.now()
    };

    // Build date range buckets (monthly)
    const dateRanges = this.createDateRangeBuckets();

    let totalConversations = 0;
    let totalMessages = 0;

    for (const [convId, conversation] of Object.entries(data.conversations)) {
      totalConversations++;

      // Index by title
      this.addToIndex(index.byTitle, conversation.title, convId);

      // Index by vault
      this.addToIndex(index.byVault, conversation.vault_name, convId);

      // Index by message content
      for (const message of conversation.messages) {
        totalMessages++;

        // Index message content
        if (message.content) {
          this.addToIndex(index.byContent, message.content, convId);
        }

        // Index tool-related content
        if (message.toolName) {
          this.addToIndex(index.byContent, message.toolName, convId);
        }
      }

      // Add to date range bucket
      this.addToDateRangeBucket(dateRanges, conversation.created_at, convId);
    }

    index.byDateRange = dateRanges;

    console.log(`[Claudesidian] Conversation index built: ${totalConversations} conversations, ${totalMessages} messages`);
    return index;
  }

  /**
   * Rebuild indexes for existing data files
   */
  async rebuildIndexes(
    workspaceData: WorkspaceDataStructure,
    conversationData: ConversationDataStructure
  ): Promise<{
    workspaceIndex: WorkspaceSearchIndex;
    conversationIndex: ConversationSearchIndex;
  }> {
    console.log('[Claudesidian] Rebuilding search indexes...');

    const workspaceIndex = this.buildWorkspaceIndex(workspaceData);
    const conversationIndex = this.buildConversationIndex(conversationData);

    console.log('[Claudesidian] Index rebuild completed');

    return {
      workspaceIndex,
      conversationIndex
    };
  }

  private addToIndex(index: Record<string, string[]>, text: string, id: string): void {
    if (!text || typeof text !== 'string') return;

    // Split text into words and clean them
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/)
      .filter(word => word.length > 2); // Only words longer than 2 characters

    for (const word of words) {
      if (!index[word]) index[word] = [];
      if (!index[word].includes(id)) {
        index[word].push(id);
      }
    }
  }

  private createDateRangeBuckets(): Array<{start: number, end: number, conversationIds: string[]}> {
    const buckets = [];
    const now = Date.now();
    const oneMonth = 30 * 24 * 60 * 60 * 1000;

    // Create 12 monthly buckets going back in time
    for (let i = 0; i < 12; i++) {
      const end = now - (i * oneMonth);
      const start = end - oneMonth;
      buckets.push({
        start,
        end,
        conversationIds: []
      });
    }

    return buckets;
  }

  private addToDateRangeBucket(buckets: any[], timestamp: number, id: string): void {
    for (const bucket of buckets) {
      if (timestamp >= bucket.start && timestamp < bucket.end) {
        bucket.conversationIds.push(id);
        break;
      }
    }
  }

  /**
   * Search utilities for using the built indexes
   */
  searchWorkspaces(index: WorkspaceSearchIndex, query: string): {
    workspaceIds: string[];
    sessionIds: string[];
    traceIds: string[];
  } {
    const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const workspaceIds = new Set<string>();
    const sessionIds = new Set<string>();
    const traceIds = new Set<string>();

    for (const word of words) {
      // Search workspace names and descriptions
      if (index.byName[word]) {
        index.byName[word].forEach(id => workspaceIds.add(id));
      }
      if (index.byDescription[word]) {
        index.byDescription[word].forEach(id => workspaceIds.add(id));
      }

      // Search session names
      if (index.sessionsByName[word]) {
        index.sessionsByName[word].forEach(id => sessionIds.add(id));
      }

      // Search traces by tool and type
      if (index.tracesByTool[word]) {
        index.tracesByTool[word].forEach(id => traceIds.add(id));
      }
      if (index.tracesByType[word]) {
        index.tracesByType[word].forEach(id => traceIds.add(id));
      }
    }

    return {
      workspaceIds: Array.from(workspaceIds),
      sessionIds: Array.from(sessionIds),
      traceIds: Array.from(traceIds)
    };
  }

  searchConversations(index: ConversationSearchIndex, query: string): {
    conversationIds: string[];
  } {
    const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const conversationIds = new Set<string>();

    for (const word of words) {
      // Search titles
      if (index.byTitle[word]) {
        index.byTitle[word].forEach(id => conversationIds.add(id));
      }

      // Search content
      if (index.byContent[word]) {
        index.byContent[word].forEach(id => conversationIds.add(id));
      }
    }

    return {
      conversationIds: Array.from(conversationIds)
    };
  }
}