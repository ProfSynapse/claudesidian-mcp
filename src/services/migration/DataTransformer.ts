// Location: src/services/migration/DataTransformer.ts
// Transforms ChromaDB collection data into the new nested JSON structure
// Used by: DataMigrationService to convert legacy data to simplified architecture
// Dependencies: ChromaDataLoader for source data, MigrationTypes for target structure

import { WorkspaceDataStructure, ConversationDataStructure } from '../../types/migration/MigrationTypes';
import { ChromaCollectionData } from './ChromaDataLoader';

export class DataTransformer {

  transformToNewStructure(chromaData: ChromaCollectionData): {
    workspaceData: WorkspaceDataStructure;
    conversationData: ConversationDataStructure;
  } {
    console.log('[Claudesidian] Starting transformation to new structure...');

    // Step 1: Transform conversations (simpler structure)
    const conversationData = this.transformConversations(chromaData.conversations);

    // Step 2: Transform workspace hierarchy (complex nested structure)
    const workspaceData = this.transformWorkspaceHierarchy(
      chromaData.workspaces,
      chromaData.sessions,
      chromaData.memoryTraces,
      chromaData.snapshots
    );

    console.log('[Claudesidian] Transformation completed');
    return { workspaceData, conversationData };
  }

  private transformConversations(conversations: any[]): ConversationDataStructure {
    console.log(`[Claudesidian] Transforming ${conversations.length} conversations...`);

    const result: ConversationDataStructure = {
      conversations: {},
      metadata: {
        version: '2.0.0',
        lastUpdated: Date.now(),
        totalConversations: conversations.length
      }
    };

    for (const conv of conversations) {
      try {
        const conversationData = conv.metadata?.conversation || {};
        const messages = conversationData.messages || [];

        result.conversations[conv.id] = {
          id: conv.id,
          title: conv.metadata?.title || conversationData.title || 'Untitled Conversation',
          created_at: conv.metadata?.created_at || conversationData.created_at || Date.now(),
          last_updated: conv.metadata?.last_updated || conversationData.last_updated || Date.now(),
          vault_name: conv.metadata?.vault_name || conversationData.vault_name || 'Unknown',
          message_count: conv.metadata?.message_count || conversationData.message_count || messages.length,
          messages: this.transformMessages(messages)
        };

        console.log(`[Claudesidian] Transformed conversation: ${conv.id}`);
      } catch (error) {
        console.error(`[Claudesidian] Error transforming conversation ${conv.id}:`, error);
      }
    }

    return result;
  }

  private transformMessages(messages: any[]): any[] {
    if (!Array.isArray(messages)) return [];

    return messages.map(msg => ({
      id: msg.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
      role: msg.role || 'user',
      content: msg.content || '',
      timestamp: msg.timestamp || Date.now(),
      toolName: msg.toolName,
      toolParams: msg.toolParams,
      toolResult: msg.toolResult
    }));
  }

  private transformWorkspaceHierarchy(
    workspaces: any[],
    sessions: any[],
    memoryTraces: any[],
    snapshots: any[]
  ): WorkspaceDataStructure {
    console.log(`[Claudesidian] Transforming workspace hierarchy...`);
    console.log(`  - ${workspaces.length} workspaces`);
    console.log(`  - ${sessions.length} sessions`);
    console.log(`  - ${memoryTraces.length} memory traces`);
    console.log(`  - ${snapshots.length} snapshots`);

    // Group data by relationships
    const sessionsByWorkspace = this.groupBy(sessions, s => s.metadata?.workspaceId || 'unknown');
    const tracesBySession = this.groupBy(memoryTraces, t => t.metadata?.sessionId || 'orphan');
    const statesBySession = this.groupBy(snapshots, s => s.metadata?.sessionId || 'orphan');

    const result: WorkspaceDataStructure = {
      workspaces: {},
      metadata: {
        version: '2.0.0',
        lastUpdated: Date.now(),
        migrationCompleted: Date.now()
      }
    };

    // Build workspace metadata lookup
    const workspaceMetadata = this.keyBy(workspaces, 'id');

    // Process each workspace
    for (const [workspaceId, workspaceSessions] of Object.entries(sessionsByWorkspace)) {
      const wsMetadata = workspaceMetadata[workspaceId];

      try {
        // Parse context if it's a string
        let context;
        if (wsMetadata?.metadata?.context) {
          context = this.parseJSONString(wsMetadata.metadata.context);
        }

        result.workspaces[workspaceId] = {
          id: workspaceId,
          name: wsMetadata?.metadata?.name || `Workspace ${workspaceId}`,
          description: wsMetadata?.metadata?.description || '',
          rootFolder: wsMetadata?.metadata?.rootFolder || '/',
          created: wsMetadata?.metadata?.created || Date.now(),
          lastAccessed: wsMetadata?.metadata?.lastAccessed || Date.now(),
          isActive: wsMetadata?.metadata?.isActive ?? true,
          context,
          sessions: {}
        };

        // Process sessions within workspace
        for (const session of workspaceSessions) {
          const sessionTraces = tracesBySession[session.id] || [];
          const sessionStates = statesBySession[session.id] || [];

          result.workspaces[workspaceId].sessions[session.id] = {
            id: session.id,
            name: session.metadata?.name,
            description: session.metadata?.description,
            startTime: session.metadata?.startTime || session.metadata?.created || Date.now(),
            endTime: session.metadata?.endTime,
            isActive: session.metadata?.isActive ?? true,
            memoryTraces: this.transformTraces(sessionTraces),
            states: this.transformStates(sessionStates)
          };

          console.log(`[Claudesidian] Processed session ${session.id}: ${sessionTraces.length} traces, ${sessionStates.length} states`);
        }

        console.log(`[Claudesidian] Processed workspace ${workspaceId}: ${workspaceSessions.length} sessions`);
      } catch (error) {
        console.error(`[Claudesidian] Error processing workspace ${workspaceId}:`, error);
      }
    }

    return result;
  }

  private transformTraces(traces: any[]): Record<string, any> {
    const result: Record<string, any> = {};

    for (const trace of traces) {
      try {
        // Extract content from either document.content or direct content
        const content = trace.document?.content || trace.content || trace.metadata?.content || '';

        result[trace.id] = {
          id: trace.id,
          timestamp: trace.metadata?.timestamp || trace.document?.timestamp || Date.now(),
          type: trace.metadata?.activityType || trace.metadata?.type || 'unknown',
          content: content,
          metadata: {
            tool: trace.metadata?.tool || trace.document?.tool,
            params: this.parseJSONString(trace.metadata?.params),
            result: this.parseJSONString(trace.metadata?.result),
            relatedFiles: this.parseJSONString(trace.metadata?.relatedFiles) || []
          }
        };
      } catch (error) {
        console.error(`[Claudesidian] Error transforming trace ${trace.id}:`, error);
      }
    }

    return result;
  }

  private transformStates(states: any[]): Record<string, any> {
    const result: Record<string, any> = {};

    for (const state of states) {
      try {
        result[state.id] = {
          id: state.id,
          name: state.metadata?.name || 'Unnamed State',
          created: state.metadata?.created || Date.now(),
          snapshot: state.metadata?.snapshot || state.snapshot || {}
        };
      } catch (error) {
        console.error(`[Claudesidian] Error transforming state ${state.id}:`, error);
      }
    }

    return result;
  }

  // Utility methods
  private groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const key = keyFn(item);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  private keyBy<T>(array: T[], key: string): Record<string, T> {
    return array.reduce((result, item) => {
      const keyValue = (item as any)[key];
      if (keyValue) result[keyValue] = item;
      return result;
    }, {} as Record<string, T>);
  }

  private parseJSONString(str: string | undefined): any {
    if (!str) return undefined;
    if (typeof str !== 'string') return str;

    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }
}