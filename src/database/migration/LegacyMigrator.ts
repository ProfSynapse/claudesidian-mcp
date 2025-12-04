/**
 * Location: src/database/migration/LegacyMigrator.ts
 *
 * Legacy JSON to JSONL/SQLite Migration System
 *
 * This file provides migration logic for converting legacy data from `.workspaces/`
 * and `.conversations/` folders (JSON format) to the new `.nexus/` format (JSONL + SQLite).
 *
 * Design Principles:
 * - Non-destructive: Legacy files are kept as backup
 * - Resumable: Can handle partial migrations and resume from failures
 * - Idempotent: Can run multiple times safely
 * - Trackable: Records migration status and progress
 *
 * Migration Flow:
 * 1. Check if migration is needed (legacy folders exist, new system not populated)
 * 2. Read all workspace JSON files from `.workspaces/`
 * 3. Read all conversation JSON files from `.conversations/`
 * 4. Convert workspaces to JSONL events in `.nexus/workspaces/`
 * 5. Convert conversations to JSONL events in `.nexus/conversations/`
 * 6. Record migration status in `.nexus/migration-status.json`
 * 7. SQLite cache will be rebuilt automatically on next startup
 *
 * Related Files:
 * - src/database/storage/JSONLWriter.ts - JSONL file writing operations
 * - src/types/storage/StorageTypes.ts - Legacy data structures
 * - src/types/storage/HybridStorageTypes.ts - New data structures
 * - src/database/interfaces/StorageEvents.ts - Event type definitions
 */

import { App, TFile, TFolder } from 'obsidian';
import { JSONLWriter } from '../storage/JSONLWriter';
import {
  IndividualWorkspace,
  IndividualConversation,
  SessionData,
  MemoryTrace,
  StateData,
} from '../../types/storage/StorageTypes';
import {
  WorkspaceCreatedEvent,
  SessionCreatedEvent,
  StateSavedEvent,
  TraceAddedEvent,
  ConversationCreatedEvent,
  MessageEvent,
} from '../interfaces/StorageEvents';
import { v4 as uuidv4 } from 'uuid';

/**
 * Migration status tracking
 */
export interface MigrationStatus {
  /** Whether migration has been completed */
  completed: boolean;

  /** Timestamp when migration started */
  startedAt?: number;

  /** Timestamp when migration completed */
  completedAt?: number;

  /** Version of migration logic */
  version: string;

  /** Migration statistics */
  stats?: {
    workspacesMigrated: number;
    sessionsMigrated: number;
    statesMigrated: number;
    tracesMigrated: number;
    conversationsMigrated: number;
    messagesMigrated: number;
    errors: string[];
  };

  /** Device that performed the migration */
  deviceId?: string;

  /** Any errors encountered during migration */
  errors?: string[];
}

/**
 * Migration result returned to caller
 */
export interface MigrationResult {
  /** Whether migration was needed */
  needed: boolean;

  /** Whether migration completed successfully */
  success: boolean;

  /** Migration statistics */
  stats: {
    workspacesMigrated: number;
    sessionsMigrated: number;
    statesMigrated: number;
    tracesMigrated: number;
    conversationsMigrated: number;
    messagesMigrated: number;
  };

  /** Any errors encountered */
  errors: string[];

  /** Duration of migration in milliseconds */
  duration: number;

  /** Human-readable message */
  message: string;
}

/**
 * Legacy data migrator for JSON to JSONL/SQLite transition
 *
 * Usage:
 * ```typescript
 * const migrator = new LegacyMigrator(app);
 * const result = await migrator.migrate();
 *
 * if (result.needed) {
 *   console.log(`Migration completed: ${result.message}`);
 *   console.log(`Migrated ${result.stats.workspacesMigrated} workspaces`);
 *   console.log(`Migrated ${result.stats.conversationsMigrated} conversations`);
 * }
 * ```
 */
export class LegacyMigrator {
  private app: App;
  private jsonlWriter: JSONLWriter;
  private migrationStatusPath = '.nexus/migration-status.json';
  private legacyWorkspacesPath = '.workspaces';
  private legacyConversationsPath = '.conversations';

  // Current migration version - increment to force re-migration
  // 1.0.0 - Initial migration
  // 1.1.0 - Fixed message migration detection (files without messages)
  // 1.2.0 - Fixed JSONLWriter.appendEvent() for hidden folders (messages were silently dropped)
  private readonly MIGRATION_VERSION = '1.2.0';

  constructor(app: App) {
    this.app = app;
    this.jsonlWriter = new JSONLWriter({
      app,
      basePath: '.nexus',
    });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Check if migration is needed
   *
   * Migration is needed if:
   * 1. Legacy folders exist (.workspaces or .conversations)
   * 2. Migration has not been completed (or status file doesn't exist)
   * 3. There are files in legacy folders to migrate
   *
   * @returns True if migration should run
   */
  async isMigrationNeeded(): Promise<boolean> {
    try {
      // Check if migration has already been completed
      const status = await this.loadMigrationStatus();

      if (status?.completed && status.version === this.MIGRATION_VERSION) {
        return false;
      }

      // Check if legacy folders exist and contain data
      const hasLegacyWorkspaces = await this.hasLegacyWorkspaces();
      const hasLegacyConversations = await this.hasLegacyConversations();

      return hasLegacyWorkspaces || hasLegacyConversations;
    } catch (error) {
      console.error('[LegacyMigrator] Error checking migration status:', error);
      return false;
    }
  }

  /**
   * Perform the migration from legacy JSON to JSONL/SQLite
   *
   * This is the main entry point for the migration process.
   * It will:
   * 1. Check if migration is needed
   * 2. Create .nexus directory structure
   * 3. Migrate all workspaces
   * 4. Migrate all conversations
   * 5. Record migration status
   *
   * @returns Migration result with statistics
   */
  async migrate(): Promise<MigrationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const stats = {
      workspacesMigrated: 0,
      sessionsMigrated: 0,
      statesMigrated: 0,
      tracesMigrated: 0,
      conversationsMigrated: 0,
      messagesMigrated: 0,
    };

    try {
      // Check if migration is needed
      const needed = await this.isMigrationNeeded();
      if (!needed) {
        return {
          needed: false,
          success: true,
          stats,
          errors: [],
          duration: Date.now() - startTime,
          message: 'Migration not needed - already completed or no legacy data found',
        };
      }

      // Ensure .nexus directory structure exists
      await this.jsonlWriter.ensureDirectory();
      await this.jsonlWriter.ensureDirectory('workspaces');
      await this.jsonlWriter.ensureDirectory('conversations');

      // Record migration start
      await this.saveMigrationStatus({
        completed: false,
        startedAt: startTime,
        version: this.MIGRATION_VERSION,
        deviceId: this.jsonlWriter.getDeviceId(),
      });

      // Migrate workspaces
      try {
        const workspaceResult = await this.migrateWorkspaces();
        stats.workspacesMigrated = workspaceResult.workspaces;
        stats.sessionsMigrated = workspaceResult.sessions;
        stats.statesMigrated = workspaceResult.states;
        stats.tracesMigrated = workspaceResult.traces;
        errors.push(...workspaceResult.errors);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Workspace migration failed: ${message}`);
        console.error('[LegacyMigrator] Workspace migration error:', error);
      }

      // Migrate conversations
      try {
        const conversationResult = await this.migrateConversations();
        stats.conversationsMigrated = conversationResult.conversations;
        stats.messagesMigrated = conversationResult.messages;
        errors.push(...conversationResult.errors);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Conversation migration failed: ${message}`);
        console.error('[LegacyMigrator] Conversation migration error:', error);
      }

      // Record migration completion
      const completedAt = Date.now();
      await this.saveMigrationStatus({
        completed: true,
        startedAt: startTime,
        completedAt,
        version: this.MIGRATION_VERSION,
        stats: {
          ...stats,
          errors,
        },
        deviceId: this.jsonlWriter.getDeviceId(),
        errors,
      });

      const duration = completedAt - startTime;
      const success = errors.length === 0;

      console.log(`[LegacyMigrator] Migrated ${stats.conversationsMigrated} conversations, ${stats.messagesMigrated} messages (${duration}ms)`);

      return {
        needed: true,
        success,
        stats,
        errors,
        duration,
        message: success
          ? `Successfully migrated ${stats.workspacesMigrated} workspaces and ${stats.conversationsMigrated} conversations`
          : `Migration completed with ${errors.length} errors`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Migration failed: ${message}`);
      console.error('[LegacyMigrator] Fatal migration error:', error);

      return {
        needed: true,
        success: false,
        stats,
        errors,
        duration: Date.now() - startTime,
        message: `Migration failed: ${message}`,
      };
    }
  }

  // ============================================================================
  // Workspace Migration
  // ============================================================================

  /**
   * Migrate all workspaces from legacy JSON to JSONL
   * Uses adapter for hidden folder support
   */
  private async migrateWorkspaces(): Promise<{
    workspaces: number;
    sessions: number;
    states: number;
    traces: number;
    errors: string[];
  }> {
    const result = {
      workspaces: 0,
      sessions: 0,
      states: 0,
      traces: 0,
      errors: [] as string[],
    };

    try {
      const workspacePaths = await this.listLegacyWorkspaceFilePaths();

      for (const filePath of workspacePaths) {
        try {
          await this.migrateWorkspaceFromPath(filePath, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result.errors.push(`Failed to migrate workspace ${filePath}: ${message}`);
          console.error(`[LegacyMigrator] Error migrating workspace ${filePath}:`, error);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to list workspace files: ${message}`);
      console.error('[LegacyMigrator] Error listing workspace files:', error);
    }

    return result;
  }

  /**
   * Migrate a single workspace file from path
   * Uses adapter.read for hidden folder support
   */
  private async migrateWorkspaceFromPath(
    filePath: string,
    result: {
      workspaces: number;
      sessions: number;
      states: number;
      traces: number;
      errors: string[];
    }
  ): Promise<void> {
    try {
      // Read legacy workspace JSON via adapter (works for hidden folders)
      const content = await this.app.vault.adapter.read(filePath);
      let workspace: IndividualWorkspace;
      try {
        workspace = JSON.parse(content);
      } catch (parseError) {
        console.error(`[LegacyMigrator] Failed to parse workspace JSON: ${filePath}`, parseError);
        return;
      }

      // Validate workspace has required fields
      if (!workspace.id || !workspace.name) {
        console.warn(`[LegacyMigrator] Skipping invalid workspace file (missing id/name): ${filePath}`);
        return;
      }

      // Create JSONL file path
      const jsonlPath = `workspaces/ws_${workspace.id}.jsonl`;

      // Check if this workspace was already migrated (resumable)
      let exists = false;
      try {
        exists = await this.jsonlWriter.fileExists(jsonlPath);
      } catch (existsError) {
        // Ignore - will try to create anyway
      }

      if (exists) {
        return;
      }

      // Create workspace_created event
      const workspaceEvent: Omit<WorkspaceCreatedEvent, 'id' | 'deviceId' | 'timestamp'> = {
        type: 'workspace_created',
        data: {
          id: workspace.id,
          name: workspace.name,
          description: workspace.description,
          rootFolder: workspace.rootFolder,
          created: workspace.created,
          contextJson: workspace.context ? JSON.stringify(workspace.context) : undefined,
        },
      };

      await this.jsonlWriter.appendEvent(jsonlPath, workspaceEvent);
      result.workspaces++;

      // Migrate sessions
      if (workspace.sessions) {
        for (const [sessionId, sessionData] of Object.entries(workspace.sessions)) {
          try {
            await this.migrateSession(workspace.id, sessionId, sessionData, jsonlPath, result);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            result.errors.push(
              `Failed to migrate session ${sessionId} in workspace ${workspace.id}: ${message}`
            );
          }
        }
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Migrate a single session within a workspace
   */
  private async migrateSession(
    workspaceId: string,
    sessionId: string,
    sessionData: SessionData,
    jsonlPath: string,
    result: {
      workspaces: number;
      sessions: number;
      states: number;
      traces: number;
      errors: string[];
    }
  ): Promise<void> {
    // Create session_created event
    const sessionEvent: Omit<SessionCreatedEvent, 'id' | 'deviceId' | 'timestamp'> = {
      type: 'session_created',
      workspaceId,
      data: {
        id: sessionId,
        name: sessionData.name || `Session ${sessionId}`,
        description: sessionData.description,
        startTime: sessionData.startTime,
      },
    };

    await this.jsonlWriter.appendEvent(jsonlPath, sessionEvent);
    result.sessions++;

    // Migrate states
    if (sessionData.states) {
      for (const [stateId, stateData] of Object.entries(sessionData.states)) {
        try {
          await this.migrateState(workspaceId, sessionId, stateId, stateData, jsonlPath, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result.errors.push(
            `Failed to migrate state ${stateId} in session ${sessionId}: ${message}`
          );
        }
      }
    }

    // Migrate traces
    if (sessionData.memoryTraces) {
      for (const [traceId, traceData] of Object.entries(sessionData.memoryTraces)) {
        try {
          await this.migrateTrace(workspaceId, sessionId, traceId, traceData, jsonlPath, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result.errors.push(
            `Failed to migrate trace ${traceId} in session ${sessionId}: ${message}`
          );
        }
      }
    }
  }

  /**
   * Migrate a single state within a session
   */
  private async migrateState(
    workspaceId: string,
    sessionId: string,
    stateId: string,
    stateData: StateData,
    jsonlPath: string,
    result: {
      workspaces: number;
      sessions: number;
      states: number;
      traces: number;
      errors: string[];
    }
  ): Promise<void> {
    const stateEvent: Omit<StateSavedEvent, 'id' | 'deviceId' | 'timestamp'> = {
      type: 'state_saved',
      workspaceId,
      sessionId,
      data: {
        id: stateId,
        name: stateData.name,
        created: stateData.created,
        stateJson: JSON.stringify(stateData.state),
      },
    };

    await this.jsonlWriter.appendEvent(jsonlPath, stateEvent);
    result.states++;
  }

  /**
   * Migrate a single trace within a session
   */
  private async migrateTrace(
    workspaceId: string,
    sessionId: string,
    traceId: string,
    traceData: MemoryTrace,
    jsonlPath: string,
    result: {
      workspaces: number;
      sessions: number;
      states: number;
      traces: number;
      errors: string[];
    }
  ): Promise<void> {
    const traceEvent: Omit<TraceAddedEvent, 'id' | 'deviceId' | 'timestamp'> = {
      type: 'trace_added',
      workspaceId,
      sessionId,
      data: {
        id: traceId,
        content: traceData.content,
        traceType: traceData.type,
        metadataJson: traceData.metadata ? JSON.stringify(traceData.metadata) : undefined,
      },
    };

    await this.jsonlWriter.appendEvent(jsonlPath, traceEvent);
    result.traces++;
  }

  // ============================================================================
  // Conversation Migration
  // ============================================================================

  /**
   * Migrate all conversations from legacy JSON to JSONL
   * Uses adapter for hidden folder support
   */
  private async migrateConversations(): Promise<{
    conversations: number;
    messages: number;
    errors: string[];
  }> {
    const result = {
      conversations: 0,
      messages: 0,
      errors: [] as string[],
    };

    try {
      const conversationPaths = await this.listLegacyConversationFilePaths();

      for (const filePath of conversationPaths) {
        try {
          await this.migrateConversationFromPath(filePath, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result.errors.push(`Failed to migrate conversation ${filePath}: ${message}`);
          console.error(`[LegacyMigrator] Error migrating conversation ${filePath}:`, error);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to list conversation files: ${message}`);
      console.error('[LegacyMigrator] Error listing conversation files:', error);
    }

    return result;
  }

  /**
   * Migrate a single conversation file from path
   * Uses adapter.read for hidden folder support
   */
  private async migrateConversationFromPath(
    filePath: string,
    result: {
      conversations: number;
      messages: number;
      errors: string[];
    }
  ): Promise<void> {
    try {
      // Read legacy conversation JSON via adapter (works for hidden folders)
      const content = await this.app.vault.adapter.read(filePath);
      const conversation: IndividualConversation = JSON.parse(content);

      // Create JSONL file path
      const jsonlPath = `conversations/conv_${conversation.id}.jsonl`;

      // Check if this conversation was already migrated (resumable)
      const exists = await this.jsonlWriter.fileExists(jsonlPath);
      let needsMessageMigration = true;

      if (exists) {
        // Check if messages were already migrated by counting events
        const existingEvents = await this.jsonlWriter.readEvents(jsonlPath);
        const messageEvents = existingEvents.filter((e: any) => e.type === 'message');

        if (messageEvents.length > 0) {
          return; // Already migrated
        }
        // File exists but no messages - need to migrate messages
        needsMessageMigration = true;
      } else {
        // Create conversation metadata event (first line in JSONL)
        const metadataEvent: Omit<ConversationCreatedEvent, 'id' | 'deviceId' | 'timestamp'> = {
          type: 'metadata',
          data: {
            id: conversation.id,
            title: conversation.title,
            created: conversation.created,
            vault: conversation.vault_name,
            settings: conversation.metadata?.chatSettings,
          },
        };

        await this.jsonlWriter.appendEvent(jsonlPath, metadataEvent);
        result.conversations++;
      }

      // Migrate messages
      if (conversation.messages && conversation.messages.length > 0) {
        // Sort messages by timestamp to ensure correct order
        const sortedMessages = [...conversation.messages].sort(
          (a, b) => a.timestamp - b.timestamp
        );

        for (let i = 0; i < sortedMessages.length; i++) {
          const message = sortedMessages[i];
          try {
            // Create message event (OpenAI format)
            const messageEvent: Omit<MessageEvent, 'id' | 'deviceId' | 'timestamp'> = {
              type: 'message',
              conversationId: conversation.id,
              data: {
                id: message.id,
                role: message.role,
                content: message.content,
                state: message.state,
                sequenceNumber: i,
                tool_calls: message.toolCalls?.map((tc) => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: {
                    name: tc.function?.name || tc.name || '',
                    arguments: tc.function?.arguments || JSON.stringify(tc.parameters || {}),
                  },
                })),
              },
            };

            await this.jsonlWriter.appendEvent(jsonlPath, messageEvent);
            result.messages++;
          } catch (error) {
            const message_err = error instanceof Error ? error.message : String(error);
            result.errors.push(
              `Failed to migrate message ${message.id} in conversation ${conversation.id}: ${message_err}`
            );
          }
        }
      }
    } catch (error) {
      throw error;
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Check if legacy workspaces folder exists and has data
   * Uses vault.adapter for hidden folder support
   */
  private async hasLegacyWorkspaces(): Promise<boolean> {
    try {
      const exists = await this.app.vault.adapter.exists(this.legacyWorkspacesPath);
      if (!exists) return false;

      const listing = await this.app.vault.adapter.list(this.legacyWorkspacesPath);
      const jsonFiles = listing.files.filter(f => f.endsWith('.json') && !f.endsWith('index.json'));
      return jsonFiles.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if legacy conversations folder exists and has data
   * Uses vault.adapter for hidden folder support
   */
  private async hasLegacyConversations(): Promise<boolean> {
    try {
      const exists = await this.app.vault.adapter.exists(this.legacyConversationsPath);
      if (!exists) return false;

      const listing = await this.app.vault.adapter.list(this.legacyConversationsPath);
      const jsonFiles = listing.files.filter(f => f.endsWith('.json') && !f.endsWith('index.json'));
      return jsonFiles.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * List all workspace JSON file paths in legacy folder
   * Uses adapter for hidden folder support
   */
  private async listLegacyWorkspaceFilePaths(): Promise<string[]> {
    try {
      const exists = await this.app.vault.adapter.exists(this.legacyWorkspacesPath);
      if (!exists) {
        return [];
      }

      const listing = await this.app.vault.adapter.list(this.legacyWorkspacesPath);
      return listing.files.filter(f => {
        // Must be .json file
        if (!f.endsWith('.json')) return false;
        // Skip index and schema files
        const filename = f.split('/').pop() || '';
        if (filename === 'index.json') return false;
        if (filename.startsWith('.')) return false;  // Skip hidden files like .trace-schema.json
        if (filename.includes('schema')) return false;
        return true;
      });
    } catch (error) {
      console.error('[LegacyMigrator] Error listing workspace files:', error);
      return [];
    }
  }

  /**
   * List all conversation JSON file paths in legacy folder
   * Uses adapter for hidden folder support
   */
  private async listLegacyConversationFilePaths(): Promise<string[]> {
    try {
      const exists = await this.app.vault.adapter.exists(this.legacyConversationsPath);
      if (!exists) {
        return [];
      }

      const listing = await this.app.vault.adapter.list(this.legacyConversationsPath);
      return listing.files.filter(f => f.endsWith('.json') && !f.endsWith('index.json'));
    } catch (error) {
      console.error('[LegacyMigrator] Error listing conversation files:', error);
      return [];
    }
  }

  /**
   * Read file content via adapter (works for hidden files)
   */
  private async readFileViaAdapter(path: string): Promise<string | null> {
    try {
      return await this.app.vault.adapter.read(path);
    } catch (error) {
      console.error(`[LegacyMigrator] Error reading file ${path}:`, error);
      return null;
    }
  }

  /**
   * Load migration status from file
   */
  private async loadMigrationStatus(): Promise<MigrationStatus | null> {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.migrationStatusPath);
      if (!(file instanceof TFile)) {
        return null;
      }

      const content = await this.app.vault.read(file);
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Save migration status to file
   */
  private async saveMigrationStatus(status: MigrationStatus): Promise<void> {
    try {
      const content = JSON.stringify(status, null, 2);
      const file = this.app.vault.getAbstractFileByPath(this.migrationStatusPath);

      if (file instanceof TFile) {
        await this.app.vault.modify(file, content);
      } else {
        // Handle race condition where file exists but isn't in metadata cache
        try {
          await this.app.vault.create(this.migrationStatusPath, content);
        } catch (createError: any) {
          if (createError?.message?.includes('already exists')) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const retryFile = this.app.vault.getAbstractFileByPath(this.migrationStatusPath);
            if (retryFile instanceof TFile) {
              await this.app.vault.modify(retryFile, content);
            }
          } else {
            throw createError;
          }
        }
      }
    } catch (error) {
      console.error('[LegacyMigrator] Failed to save migration status:', error);
      throw error;
    }
  }
}
