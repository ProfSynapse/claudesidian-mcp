// Location: src/services/migration/DataTransformer.ts
// Transforms ChromaDB collection data into individual conversation and workspace files
// Used by: DataMigrationService to convert legacy data to split-file architecture
// Dependencies: ChromaDataLoader for source data, StorageTypes for target structure

import { IndividualConversation, IndividualWorkspace } from '../../types/storage/StorageTypes';
import { ChromaCollectionData } from './ChromaDataLoader';

export class DataTransformer {

  transformToNewStructure(chromaData: ChromaCollectionData): {
    conversations: IndividualConversation[];
    workspaces: IndividualWorkspace[];
  } {
    console.log('[DataTransformer] Starting transformation to split-file structure...');

    // Transform conversations to individual file format
    const conversations = this.transformConversations(chromaData.conversations);

    // Transform workspaces to individual file format
    const workspaces = this.transformWorkspaceHierarchy(
      chromaData.workspaces,
      chromaData.sessions,
      chromaData.memoryTraces,
      chromaData.snapshots
    );

    console.log('[DataTransformer] Transformation completed');
    return { conversations, workspaces };
  }

  private transformConversations(conversations: any[]): IndividualConversation[] {
    console.log(`[DataTransformer] Transforming ${conversations.length} conversations...`);

    const result: IndividualConversation[] = [];

    for (const conv of conversations) {
      try {
        const conversationData = conv.metadata?.conversation || {};
        const messages = conversationData.messages || [];

        const transformed: IndividualConversation = {
          id: conv.id,
          title: conv.metadata?.title || conversationData.title || 'Untitled Conversation',
          created: conv.metadata?.created || conversationData.created || Date.now(),
          updated: conv.metadata?.updated || conversationData.updated || Date.now(),
          vault_name: conv.metadata?.vault_name || conversationData.vault_name || 'Unknown',
          message_count: messages.length,
          messages: this.transformMessages(messages)
        };

        result.push(transformed);
        console.log(`[DataTransformer] Transformed conversation: ${conv.id}`);
      } catch (error) {
        console.error(`[DataTransformer] Error transforming conversation ${conv.id}:`, error);
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
      toolCalls: msg.toolCalls,
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
  ): IndividualWorkspace[] {
    console.log(`[DataTransformer] Transforming workspace hierarchy...`);
    console.log(`  - ${workspaces.length} workspaces`);
    console.log(`  - ${sessions.length} sessions`);
    console.log(`  - ${memoryTraces.length} memory traces`);
    console.log(`  - ${snapshots.length} snapshots`);

    // Group data by relationships
    const sessionsByWorkspace = this.groupBy(sessions, s => s.metadata?.workspaceId || 'unknown');
    const tracesBySession = this.groupBy(memoryTraces, t => t.metadata?.sessionId || 'orphan');
    const statesBySession = this.groupBy(snapshots, s => s.metadata?.sessionId || 'orphan');

    const result: IndividualWorkspace[] = [];

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
          // Apply workspace context migration to new structure
          context = this.migrateWorkspaceContext(context);
        }

        const workspace: IndividualWorkspace = {
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

          workspace.sessions[session.id] = {
            id: session.id,
            name: session.metadata?.name,
            description: session.metadata?.description,
            startTime: session.metadata?.startTime || session.metadata?.created || Date.now(),
            endTime: session.metadata?.endTime,
            isActive: session.metadata?.isActive ?? true,
            memoryTraces: this.transformTraces(sessionTraces),
            states: this.transformStates(sessionStates)
          };

          console.log(`[DataTransformer] Processed session ${session.id}: ${sessionTraces.length} traces, ${sessionStates.length} states`);
        }

        result.push(workspace);
        console.log(`[DataTransformer] Processed workspace ${workspaceId}: ${workspaceSessions.length} sessions`);
      } catch (error) {
        console.error(`[DataTransformer] Error processing workspace ${workspaceId}:`, error);
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
        console.error(`[DataTransformer] Error transforming trace ${trace.id}:`, error);
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
        console.error(`[DataTransformer] Error transforming state ${state.id}:`, error);
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

  /**
   * Migrate workspace context from old structure to new structure
   */
  private migrateWorkspaceContext(context: any): any {
    if (!context || typeof context !== 'object') {
      return context;
    }

    const migratedContext = { ...context };

    // Migrate agents array to dedicatedAgent
    if (context.agents && Array.isArray(context.agents) && context.agents.length > 0) {
      const firstAgent = context.agents[0];
      if (firstAgent && firstAgent.name) {
        migratedContext.dedicatedAgent = {
          agentId: firstAgent.id || firstAgent.name,
          agentName: firstAgent.name
        };
        console.log(`[DataTransformer] Migrated agent '${firstAgent.name}' to dedicatedAgent structure`);
      }
      delete migratedContext.agents;
    }

    // Migrate keyFiles from complex categorized structure to simple array
    if (context.keyFiles && Array.isArray(context.keyFiles)) {
      const simpleKeyFiles: string[] = [];
      context.keyFiles.forEach((category: any) => {
        if (category.files && typeof category.files === 'object') {
          Object.values(category.files).forEach((filePath: any) => {
            if (typeof filePath === 'string') {
              simpleKeyFiles.push(filePath);
            }
          });
        }
      });
      migratedContext.keyFiles = simpleKeyFiles;
      console.log(`[DataTransformer] Migrated ${simpleKeyFiles.length} key files to simple array format`);
    }

    // Migrate preferences from array to string
    if (context.preferences && Array.isArray(context.preferences)) {
      const preferencesString = context.preferences
        .filter((pref: any) => typeof pref === 'string' && pref.trim())
        .join('. ') + (context.preferences.length > 0 ? '.' : '');
      migratedContext.preferences = preferencesString;
      console.log(`[DataTransformer] Migrated ${context.preferences.length} preferences to string format`);
    }

    // Remove status field
    if (context.status) {
      console.log(`[DataTransformer] Removed status field: '${context.status}' (replaced by active toggle)`);
      delete migratedContext.status;
    }

    return migratedContext;
  }
}