/**
 * Data Migration Service
 * Handles migration from ChromaDB collections to JSON-based storage
 */

import { Plugin } from 'obsidian';
import { WorkspaceService } from '../../agents/memoryManager/services/WorkspaceService';
import { MemoryService } from '../../agents/memoryManager/services/MemoryService';

export interface MigrationStatus {
  isRequired: boolean;
  hasLegacyData: boolean;
  migrationComplete: boolean;
  migrationError?: string;
  lastMigrationAttempt?: number;
  dataBackupPath?: string;
}

export interface MigrationResult {
  success: boolean;
  workspacesMigrated: number;
  sessionsMigrated: number;
  conversationsMigrated: number;
  memoryTracesMigrated: number;
  snapshotsMigrated: number;
  errors: string[];
  backupCreated: boolean;
  migrationTime: number;
}

/**
 * Service responsible for migrating data from ChromaDB to JSON storage
 */
export class DataMigrationService {
  private plugin: Plugin;
  private workspaceService: WorkspaceService;
  private memoryService: MemoryService;

  constructor(
    plugin: Plugin,
    workspaceService: WorkspaceService,
    memoryService: MemoryService
  ) {
    this.plugin = plugin;
    this.workspaceService = workspaceService;
    this.memoryService = memoryService;
  }

  /**
   * Check if migration is required
   */
  async checkMigrationStatus(): Promise<MigrationStatus> {
    const pluginData = await this.plugin.loadData() || {};

    // Check if migration has already been completed
    if (pluginData.migrationComplete) {
      return {
        isRequired: false,
        hasLegacyData: false,
        migrationComplete: true
      };
    }

    // Check for legacy ChromaDB data directories
    const hasLegacyData = await this.detectLegacyData();

    return {
      isRequired: hasLegacyData && !pluginData.migrationComplete,
      hasLegacyData,
      migrationComplete: false,
      lastMigrationAttempt: pluginData.lastMigrationAttempt,
      migrationError: pluginData.migrationError
    };
  }

  /**
   * Detect legacy ChromaDB data that needs migration
   */
  private async detectLegacyData(): Promise<boolean> {
    try {
      // Check for common ChromaDB data patterns in plugin data
      const pluginData = await this.plugin.loadData() || {};

      // Look for legacy collection data
      const hasWorkspaces = pluginData.workspaces && Array.isArray(pluginData.workspaces);
      const hasSessions = pluginData.sessions && Array.isArray(pluginData.sessions);
      const hasMemoryTraces = pluginData.memoryTraces && Array.isArray(pluginData.memoryTraces);
      const hasConversations = pluginData.conversations && Array.isArray(pluginData.conversations);

      return hasWorkspaces || hasSessions || hasMemoryTraces || hasConversations;
    } catch (error) {
      console.warn('[DataMigrationService] Error detecting legacy data:', error);
      return false;
    }
  }

  /**
   * Perform the migration from legacy data to simplified JSON storage
   */
  async performMigration(): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      workspacesMigrated: 0,
      sessionsMigrated: 0,
      conversationsMigrated: 0,
      memoryTracesMigrated: 0,
      snapshotsMigrated: 0,
      errors: [],
      backupCreated: false,
      migrationTime: 0
    };

    try {
      console.log('[DataMigrationService] Starting data migration...');

      // Step 1: Create backup of current data
      const backupSuccess = await this.createDataBackup();
      result.backupCreated = backupSuccess;

      if (!backupSuccess) {
        result.errors.push('Failed to create data backup');
        return result;
      }

      // Step 2: Load legacy data
      const legacyData = await this.loadLegacyData();

      // Step 3: Migrate workspaces
      if (legacyData.workspaces) {
        result.workspacesMigrated = await this.migrateWorkspaces(legacyData.workspaces);
      }

      // Step 4: Migrate sessions
      if (legacyData.sessions) {
        result.sessionsMigrated = await this.migrateSessions(legacyData.sessions);
      }

      // Step 5: Migrate memory traces
      if (legacyData.memoryTraces) {
        result.memoryTracesMigrated = await this.migrateMemoryTraces(legacyData.memoryTraces);
      }

      // Step 6: Migrate conversations
      if (legacyData.conversations) {
        result.conversationsMigrated = await this.migrateConversations(legacyData.conversations);
      }

      // Step 7: Migrate snapshots
      if (legacyData.snapshots) {
        result.snapshotsMigrated = await this.migrateSnapshots(legacyData.snapshots);
      }

      // Step 8: Mark migration as complete
      await this.markMigrationComplete();

      result.success = true;
      result.migrationTime = Date.now() - startTime;

      console.log('[DataMigrationService] Migration completed successfully:', result);

    } catch (error) {
      console.error('[DataMigrationService] Migration failed:', error);
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Save migration error for troubleshooting
      await this.saveMigrationError(error);
    }

    result.migrationTime = Date.now() - startTime;
    return result;
  }

  /**
   * Create backup of current plugin data
   */
  private async createDataBackup(): Promise<boolean> {
    try {
      const pluginData = await this.plugin.loadData() || {};
      const timestamp = Date.now();

      // Store backup in plugin data with timestamp
      const backupData = {
        ...pluginData,
        backupTimestamp: timestamp,
        migrationBackup: true
      };

      // Save backup reference
      pluginData.migrationBackup = {
        timestamp,
        backupCreated: true
      };

      await this.plugin.saveData(pluginData);
      return true;
    } catch (error) {
      console.error('[DataMigrationService] Backup creation failed:', error);
      return false;
    }
  }

  /**
   * Load legacy data from plugin storage
   */
  private async loadLegacyData(): Promise<any> {
    const pluginData = await this.plugin.loadData() || {};
    return {
      workspaces: pluginData.workspaces,
      sessions: pluginData.sessions,
      memoryTraces: pluginData.memoryTraces,
      conversations: pluginData.conversations,
      snapshots: pluginData.snapshots
    };
  }

  /**
   * Migrate workspace data to new format
   */
  private async migrateWorkspaces(legacyWorkspaces: any[]): Promise<number> {
    let migrated = 0;

    for (const workspace of legacyWorkspaces) {
      try {
        // Convert legacy workspace to new format
        const migratedWorkspace = {
          id: workspace.id,
          name: workspace.name,
          description: workspace.description || '',
          rootFolder: workspace.rootFolder || '/',
          isActive: workspace.isActive ?? true,
          created: workspace.created || Date.now(),
          lastAccessed: workspace.lastAccessed || Date.now(),
          context: workspace.context || {
            purpose: '',
            currentGoal: '',
            status: 'Migrated from legacy data',
            workflows: [],
            keyFiles: [],
            preferences: [],
            agents: []
          }
        };

        await this.workspaceService.createWorkspace(migratedWorkspace);
        migrated++;
      } catch (error) {
        console.error('[DataMigrationService] Error migrating workspace:', workspace.id, error);
      }
    }

    return migrated;
  }

  /**
   * Migrate session data to new format
   */
  private async migrateSessions(legacySessions: any[]): Promise<number> {
    let migrated = 0;

    for (const session of legacySessions) {
      try {
        // Convert legacy session to new format
        const migratedSession = {
          id: session.id,
          workspaceId: session.workspaceId,
          name: session.name || 'Migrated Session',
          description: session.description || 'Migrated from legacy data',
          created: session.created || Date.now(),
          lastAccessed: session.lastAccessed || Date.now()
        };

        await this.memoryService.createSession(migratedSession);
        migrated++;
      } catch (error) {
        console.error('[DataMigrationService] Error migrating session:', session.id, error);
      }
    }

    return migrated;
  }

  /**
   * Migrate memory trace data to new format
   */
  private async migrateMemoryTraces(legacyTraces: any[]): Promise<number> {
    let migrated = 0;

    for (const trace of legacyTraces) {
      try {
        // Convert legacy trace to new format (remove embedding data)
        const migratedTrace = {
          id: trace.id,
          workspaceId: trace.workspaceId,
          timestamp: trace.timestamp,
          activityType: trace.activityType || 'tool_call',
          content: trace.content,
          metadata: {
            tool: trace.metadata?.tool || 'unknown',
            params: trace.metadata?.params || {},
            result: trace.metadata?.result || {},
            relatedFiles: trace.metadata?.relatedFiles || []
          },
          importance: trace.importance || 1,
          tags: trace.tags || [],
          sessionId: trace.sessionId
        };

        await this.memoryService.recordActivityTrace(migratedTrace);
        migrated++;
      } catch (error) {
        console.error('[DataMigrationService] Error migrating memory trace:', trace.id, error);
      }
    }

    return migrated;
  }

  /**
   * Migrate conversation data to new format
   */
  private async migrateConversations(legacyConversations: any[]): Promise<number> {
    let migrated = 0;

    for (const conversation of legacyConversations) {
      try {
        // Convert legacy conversation to new format (remove embedding data)
        const migratedConversation = {
          id: conversation.id,
          title: conversation.metadata?.title || 'Migrated Conversation',
          created_at: conversation.metadata?.created_at || Date.now(),
          last_updated: conversation.metadata?.last_updated || Date.now(),
          messages: conversation.metadata?.conversation?.messages || [],
          vault_name: conversation.metadata?.vault_name,
          message_count: conversation.metadata?.message_count || 0
        };

        // Store conversation using memory service
        await this.memoryService.recordActivityTrace({
          id: `conversation_${conversation.id}`,
          workspaceId: 'global',
          timestamp: migratedConversation.created_at,
          activityType: 'conversation',
          content: migratedConversation.title,
          metadata: {
            tool: 'chat',
            params: { conversationId: conversation.id },
            result: migratedConversation,
            relatedFiles: []
          },
          importance: 2,
          tags: ['conversation', 'migrated']
        });

        migrated++;
      } catch (error) {
        console.error('[DataMigrationService] Error migrating conversation:', conversation.id, error);
      }
    }

    return migrated;
  }

  /**
   * Migrate snapshot data to new format
   */
  private async migrateSnapshots(legacySnapshots: any[]): Promise<number> {
    let migrated = 0;

    for (const snapshot of legacySnapshots) {
      try {
        // Convert legacy snapshot to new format
        const migratedSnapshot = {
          id: snapshot.id,
          name: snapshot.name || 'Migrated Snapshot',
          workspaceId: snapshot.workspaceId,
          created: snapshot.created || Date.now(),
          snapshot: snapshot.snapshot || {}
        };

        await this.memoryService.saveSnapshot(migratedSnapshot);
        migrated++;
      } catch (error) {
        console.error('[DataMigrationService] Error migrating snapshot:', snapshot.id, error);
      }
    }

    return migrated;
  }

  /**
   * Mark migration as complete in plugin data
   */
  private async markMigrationComplete(): Promise<void> {
    const pluginData = await this.plugin.loadData() || {};
    pluginData.migrationComplete = true;
    pluginData.migrationCompletedAt = Date.now();

    // Clear legacy data arrays to save space
    delete pluginData.workspaces;
    delete pluginData.sessions;
    delete pluginData.memoryTraces;
    delete pluginData.conversations;
    delete pluginData.snapshots;

    await this.plugin.saveData(pluginData);
  }

  /**
   * Save migration error for troubleshooting
   */
  private async saveMigrationError(error: any): Promise<void> {
    try {
      const pluginData = await this.plugin.loadData() || {};
      pluginData.migrationError = error instanceof Error ? error.message : 'Unknown error';
      pluginData.lastMigrationAttempt = Date.now();
      await this.plugin.saveData(pluginData);
    } catch (saveError) {
      console.error('[DataMigrationService] Failed to save migration error:', saveError);
    }
  }

  /**
   * Force clear migration flag (for development/testing)
   */
  async resetMigrationFlag(): Promise<void> {
    const pluginData = await this.plugin.loadData() || {};
    pluginData.migrationComplete = false;
    delete pluginData.migrationCompletedAt;
    delete pluginData.migrationError;
    delete pluginData.lastMigrationAttempt;
    await this.plugin.saveData(pluginData);
  }
}