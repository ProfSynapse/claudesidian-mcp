/**
 * Location: /src/database/sync/SyncCoordinator.ts
 *
 * Synchronization coordinator between JSONL (source of truth) and SQLite (cache).
 *
 * Architecture:
 * - JSONL files are the source of truth (append-only event log)
 * - SQLite is a materialized view cache for fast reads
 * - This coordinator replays JSONL events into SQLite
 * - Tracks sync state to avoid re-processing events
 *
 * Sync Strategies:
 * 1. Incremental Sync: Apply only events since last sync
 * 2. Full Rebuild: Replay all events from scratch (for consistency)
 *
 * Related Files:
 * - /src/database/storage/JSONLWriter.ts - JSONL event log (source of truth)
 * - /src/database/storage/SQLiteCacheManager.ts - SQLite materialized view
 * - /src/database/optimizations/BatchOperations.ts - Batch processing utilities
 * - /src/database/interfaces/StorageEvents.ts - Event type definitions
 */

import { BatchOperations, BatchOptions } from '../optimizations/BatchOperations';
import {
  StorageEvent,
  WorkspaceEvent,
  ConversationEvent,
  isWorkspaceEvent,
  isConversationEvent,
  WorkspaceCreatedEvent,
  WorkspaceUpdatedEvent,
  WorkspaceDeletedEvent,
  SessionCreatedEvent,
  SessionUpdatedEvent,
  StateSavedEvent,
  StateDeletedEvent,
  TraceAddedEvent,
  ConversationCreatedEvent,
  ConversationUpdatedEvent,
  MessageEvent,
  MessageUpdatedEvent
} from '../interfaces/StorageEvents';

// ============================================================================
// External Dependencies (to be implemented)
// ============================================================================

/**
 * JSONL Writer Interface
 * TODO: Implement in /src/database/storage/JSONLWriter.ts
 */
export interface IJSONLWriter {
  /** Get device ID for this instance */
  getDeviceId(): string;
  /** List all JSONL files in a category */
  listFiles(category: 'workspaces' | 'conversations'): Promise<string[]>;
  /** Read all events from a file */
  readEvents<T extends StorageEvent>(file: string): Promise<T[]>;
  /** Get events not from specified device since timestamp */
  getEventsNotFromDevice<T extends StorageEvent>(
    file: string,
    deviceId: string,
    sinceTimestamp: number
  ): Promise<T[]>;
}

/**
 * SQLite Cache Manager Interface
 * TODO: Implement in /src/database/storage/SQLiteCacheManager.ts
 */
export interface ISQLiteCacheManager {
  /** Get sync state for a device */
  getSyncState(deviceId: string): Promise<SyncState | null>;
  /** Update sync state after sync */
  updateSyncState(
    deviceId: string,
    lastEventTimestamp: number,
    fileTimestamps: Record<string, number>
  ): Promise<void>;
  /** Check if event has been applied */
  isEventApplied(eventId: string): Promise<boolean>;
  /** Mark event as applied */
  markEventApplied(eventId: string): Promise<void>;
  /** Execute SQL statement (returns result info) */
  run(sql: string, params?: any[]): Promise<any>;
  /** Clear all data (for rebuild) */
  clearAllData(): Promise<void>;
  /** Rebuild FTS indexes */
  rebuildFTSIndexes(): Promise<void>;
  /** Save database to disk */
  save(): Promise<void>;
}

/**
 * Sync state tracking
 */
export interface SyncState {
  deviceId: string;
  lastEventTimestamp: number;
  fileTimestamps: Record<string, number>;
}

// ============================================================================
// Sync Result Types
// ============================================================================

/**
 * Result of a sync operation
 */
export interface SyncResult {
  /** Whether sync completed successfully */
  success: boolean;
  /** Number of events applied to cache */
  eventsApplied: number;
  /** Number of events skipped (already applied) */
  eventsSkipped: number;
  /** Error messages (if any) */
  errors: string[];
  /** Duration in milliseconds */
  duration: number;
  /** List of files processed */
  filesProcessed: string[];
  /** Timestamp of last successfully synced event */
  lastSyncTimestamp: number;
}

/**
 * Options for sync operations
 */
export interface SyncOptions {
  /** Force full rebuild from JSONL */
  forceRebuild?: boolean;
  /** Progress callback */
  onProgress?: (phase: string, progress: number, total: number) => void;
  /** Batch size for event processing */
  batchSize?: number;
}

// ============================================================================
// Sync Coordinator Implementation
// ============================================================================

/**
 * Coordinates synchronization between JSONL (source of truth) and SQLite (cache).
 *
 * Responsibilities:
 * - Replay JSONL events into SQLite cache
 * - Track sync state to avoid duplicate processing
 * - Support incremental and full rebuild sync
 * - Batch process events for performance
 * - Handle sync errors gracefully
 *
 * @example Incremental sync
 * ```typescript
 * const coordinator = new SyncCoordinator(jsonlWriter, sqliteCache);
 * const result = await coordinator.sync({
 *   onProgress: (phase, progress, total) => {
 *     console.log(`${phase}: ${progress}/${total}`);
 *   }
 * });
 * console.log(`Applied ${result.eventsApplied} events`);
 * ```
 *
 * @example Full rebuild
 * ```typescript
 * const result = await coordinator.sync({
 *   forceRebuild: true,
 *   batchSize: 500,
 *   onProgress: (phase, progress, total) => {
 *     console.log(`${phase}: ${progress}/${total}`);
 *   }
 * });
 * ```
 */
export class SyncCoordinator {
  private jsonlWriter: IJSONLWriter;
  private sqliteCache: ISQLiteCacheManager;
  private deviceId: string;

  /**
   * Create a new sync coordinator
   *
   * @param jsonlWriter - JSONL event log (source of truth)
   * @param sqliteCache - SQLite cache manager
   */
  constructor(
    jsonlWriter: IJSONLWriter,
    sqliteCache: ISQLiteCacheManager
  ) {
    this.jsonlWriter = jsonlWriter;
    this.sqliteCache = sqliteCache;
    this.deviceId = jsonlWriter.getDeviceId();
  }

  /**
   * Synchronize JSONL files to SQLite cache.
   *
   * Performs incremental sync by default, applying only events since last sync.
   * Use forceRebuild option to rebuild entire cache from scratch.
   *
   * @param options - Sync options
   * @returns Sync result with statistics
   */
  async sync(options: SyncOptions = {}): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let eventsApplied = 0;
    let eventsSkipped = 0;
    const filesProcessed: string[] = [];

    try {
      // Check if we need a full rebuild
      if (options.forceRebuild) {
        return this.fullRebuild(options);
      }

      // Get current sync state
      const syncState = await this.sqliteCache.getSyncState(this.deviceId);
      const lastSync = syncState?.lastEventTimestamp ?? 0;

      // Process workspace files
      const workspaceFiles = await this.jsonlWriter.listFiles('workspaces');
      options.onProgress?.('Processing workspaces', 0, workspaceFiles.length);

      for (let i = 0; i < workspaceFiles.length; i++) {
        const file = workspaceFiles[i];
        try {
          // Get events not from this device (avoid processing our own events)
          const events = await this.jsonlWriter.getEventsNotFromDevice<WorkspaceEvent>(
            file,
            this.deviceId,
            lastSync
          );

          for (const event of events) {
            // Skip if already applied
            if (await this.sqliteCache.isEventApplied(event.id)) {
              eventsSkipped++;
              continue;
            }

            // Apply event to SQLite
            await this.applyWorkspaceEvent(event);
            await this.sqliteCache.markEventApplied(event.id);
            eventsApplied++;
          }

          filesProcessed.push(file);
          options.onProgress?.('Processing workspaces', i + 1, workspaceFiles.length);
        } catch (e) {
          errors.push(`Failed to process ${file}: ${e}`);
        }
      }

      // Process conversation files
      const conversationFiles = await this.jsonlWriter.listFiles('conversations');
      options.onProgress?.('Processing conversations', 0, conversationFiles.length);

      for (let i = 0; i < conversationFiles.length; i++) {
        const file = conversationFiles[i];
        try {
          const events = await this.jsonlWriter.getEventsNotFromDevice<ConversationEvent>(
            file,
            this.deviceId,
            lastSync
          );

          for (const event of events) {
            // Skip if already applied
            if (await this.sqliteCache.isEventApplied(event.id)) {
              eventsSkipped++;
              continue;
            }

            // Apply event to SQLite
            await this.applyConversationEvent(event);
            await this.sqliteCache.markEventApplied(event.id);
            eventsApplied++;
          }

          filesProcessed.push(file);
          options.onProgress?.('Processing conversations', i + 1, conversationFiles.length);
        } catch (e) {
          errors.push(`Failed to process ${file}: ${e}`);
        }
      }

      // Update sync state
      await this.sqliteCache.updateSyncState(
        this.deviceId,
        Date.now(),
        {} // Could track per-file timestamps here
      );

      // Save database
      await this.sqliteCache.save();

      options.onProgress?.('Complete', 1, 1);

      return {
        success: errors.length === 0,
        eventsApplied,
        eventsSkipped,
        errors,
        duration: Date.now() - startTime,
        filesProcessed,
        lastSyncTimestamp: Date.now()
      };

    } catch (error) {
      return {
        success: false,
        eventsApplied,
        eventsSkipped,
        errors: [...errors, `Sync failed: ${error}`],
        duration: Date.now() - startTime,
        filesProcessed,
        lastSyncTimestamp: Date.now()
      };
    }
  }

  /**
   * Full rebuild of SQLite from JSONL files.
   *
   * Clears entire SQLite cache and replays all events from scratch.
   * Ensures consistency between JSONL and SQLite.
   *
   * @param options - Sync options
   * @returns Sync result with statistics
   */
  async fullRebuild(options: SyncOptions = {}): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let eventsApplied = 0;
    const filesProcessed: string[] = [];
    const batchSize = options.batchSize ?? 100;

    try {
      options.onProgress?.('Clearing cache', 0, 1);

      // Clear all data
      await this.sqliteCache.clearAllData();

      // Process workspace files
      const workspaceFiles = await this.jsonlWriter.listFiles('workspaces');
      options.onProgress?.('Processing workspaces', 0, workspaceFiles.length);

      for (let i = 0; i < workspaceFiles.length; i++) {
        const file = workspaceFiles[i];
        try {
          const events = await this.jsonlWriter.readEvents<WorkspaceEvent>(file);

          // Sort events by timestamp to ensure correct order
          events.sort((a, b) => a.timestamp - b.timestamp);

          // Apply events in batches
          const result = await BatchOperations.executeBatch(
            events,
            async (event) => {
              await this.applyWorkspaceEvent(event);
              await this.sqliteCache.markEventApplied(event.id);
            },
            { batchSize }
          );

          eventsApplied += result.totalProcessed;
          if (result.errors.length > 0) {
            errors.push(...result.errors.map(e => `${file}: ${e.error.message}`));
          }

          filesProcessed.push(file);
          options.onProgress?.('Processing workspaces', i + 1, workspaceFiles.length);
        } catch (e) {
          errors.push(`Failed to process ${file}: ${e}`);
        }
      }

      // Process conversation files
      const conversationFiles = await this.jsonlWriter.listFiles('conversations');
      options.onProgress?.('Processing conversations', 0, conversationFiles.length);

      for (let i = 0; i < conversationFiles.length; i++) {
        const file = conversationFiles[i];
        try {
          const events = await this.jsonlWriter.readEvents<ConversationEvent>(file);

          // Sort events by timestamp
          events.sort((a, b) => a.timestamp - b.timestamp);

          // Apply events in batches
          const result = await BatchOperations.executeBatch(
            events,
            async (event) => {
              await this.applyConversationEvent(event);
              await this.sqliteCache.markEventApplied(event.id);
            },
            { batchSize }
          );

          eventsApplied += result.totalProcessed;
          if (result.errors.length > 0) {
            errors.push(...result.errors.map(e => `${file}: ${e.error.message}`));
          }

          filesProcessed.push(file);
          options.onProgress?.('Processing conversations', i + 1, conversationFiles.length);
        } catch (e) {
          errors.push(`Failed to process ${file}: ${e}`);
        }
      }

      // Rebuild FTS indexes
      options.onProgress?.('Rebuilding search indexes', 0, 1);
      await this.sqliteCache.rebuildFTSIndexes();

      // Update sync state
      await this.sqliteCache.updateSyncState(this.deviceId, Date.now(), {});

      // Save database
      await this.sqliteCache.save();

      options.onProgress?.('Complete', 1, 1);

      const result: SyncResult = {
        success: errors.length === 0,
        eventsApplied,
        eventsSkipped: 0,
        errors,
        duration: Date.now() - startTime,
        filesProcessed,
        lastSyncTimestamp: Date.now()
      };

      console.log(`[SyncCoordinator] Rebuilt cache: ${eventsApplied} events from ${filesProcessed.length} files (${result.duration}ms)`);

      return result;

    } catch (error) {
      console.error('[SyncCoordinator] Full rebuild failed:', error);
      return {
        success: false,
        eventsApplied,
        eventsSkipped: 0,
        errors: [...errors, `Rebuild failed: ${error}`],
        duration: Date.now() - startTime,
        filesProcessed,
        lastSyncTimestamp: Date.now()
      };
    }
  }

  // ============================================================================
  // Event Application (Workspace)
  // ============================================================================

  /**
   * Apply a workspace-related event to SQLite cache.
   *
   * Translates event into appropriate SQL operations.
   *
   * @param event - Workspace event to apply
   */
  private async applyWorkspaceEvent(event: WorkspaceEvent): Promise<void> {
    switch (event.type) {
      case 'workspace_created':
        await this.applyWorkspaceCreated(event);
        break;
      case 'workspace_updated':
        await this.applyWorkspaceUpdated(event);
        break;
      case 'workspace_deleted':
        await this.applyWorkspaceDeleted(event);
        break;
      case 'session_created':
        await this.applySessionCreated(event);
        break;
      case 'session_updated':
        await this.applySessionUpdated(event);
        break;
      case 'state_saved':
        await this.applyStateSaved(event);
        break;
      case 'state_deleted':
        await this.applyStateDeleted(event);
        break;
      case 'trace_added':
        await this.applyTraceAdded(event);
        break;
    }
  }

  private async applyWorkspaceCreated(event: WorkspaceCreatedEvent): Promise<void> {
    // Skip invalid workspace events (missing required fields)
    if (!event.data?.id || !event.data?.name) {
      console.warn('[SyncCoordinator] Skipping invalid workspace_created event - missing id or name:', event);
      return;
    }

    await this.sqliteCache.run(
      `INSERT OR REPLACE INTO workspaces
       (id, name, description, root_folder, created, last_accessed, is_active, context_json, dedicated_agent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.data.id,
        event.data.name,
        event.data.description ?? null,
        event.data.rootFolder ?? '',
        event.data.created ?? Date.now(),
        event.data.created ?? Date.now(),
        0,
        event.data.contextJson ?? null,
        event.data.dedicatedAgentId ?? null
      ]
    );
  }

  private async applyWorkspaceUpdated(event: WorkspaceUpdatedEvent): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    if (event.data.name !== undefined) { updates.push('name = ?'); values.push(event.data.name); }
    if (event.data.description !== undefined) { updates.push('description = ?'); values.push(event.data.description); }
    if (event.data.rootFolder !== undefined) { updates.push('root_folder = ?'); values.push(event.data.rootFolder); }
    if (event.data.lastAccessed !== undefined) { updates.push('last_accessed = ?'); values.push(event.data.lastAccessed); }
    if (event.data.isActive !== undefined) { updates.push('is_active = ?'); values.push(event.data.isActive ? 1 : 0); }
    if (event.data.contextJson !== undefined) { updates.push('context_json = ?'); values.push(event.data.contextJson); }
    if (event.data.dedicatedAgentId !== undefined) { updates.push('dedicated_agent_id = ?'); values.push(event.data.dedicatedAgentId); }

    if (updates.length > 0) {
      values.push(event.workspaceId);
      await this.sqliteCache.run(
        `UPDATE workspaces SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }
  }

  private async applyWorkspaceDeleted(event: WorkspaceDeletedEvent): Promise<void> {
    await this.sqliteCache.run('DELETE FROM workspaces WHERE id = ?', [event.workspaceId]);
  }

  private async applySessionCreated(event: SessionCreatedEvent): Promise<void> {
    await this.sqliteCache.run(
      `INSERT OR REPLACE INTO sessions
       (id, workspace_id, name, description, start_time, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        event.data.id,
        event.workspaceId,
        event.data.name,
        event.data.description ?? null,
        event.data.startTime,
        1
      ]
    );
  }

  private async applySessionUpdated(event: SessionUpdatedEvent): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    if (event.data.name !== undefined) { updates.push('name = ?'); values.push(event.data.name); }
    if (event.data.description !== undefined) { updates.push('description = ?'); values.push(event.data.description); }
    if (event.data.endTime !== undefined) { updates.push('end_time = ?'); values.push(event.data.endTime); }
    if (event.data.isActive !== undefined) { updates.push('is_active = ?'); values.push(event.data.isActive ? 1 : 0); }

    if (updates.length > 0) {
      values.push(event.sessionId);
      await this.sqliteCache.run(
        `UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }
  }

  private async applyStateSaved(event: StateSavedEvent): Promise<void> {
    await this.sqliteCache.run(
      `INSERT OR REPLACE INTO states
       (id, session_id, workspace_id, name, description, created, state_json, tags_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.data.id,
        event.sessionId,
        event.workspaceId,
        event.data.name,
        event.data.description ?? null,
        event.data.created,
        event.data.stateJson,
        event.data.tags ? JSON.stringify(event.data.tags) : null
      ]
    );
  }

  private async applyStateDeleted(event: StateDeletedEvent): Promise<void> {
    await this.sqliteCache.run('DELETE FROM states WHERE id = ?', [event.stateId]);
  }

  private async applyTraceAdded(event: TraceAddedEvent): Promise<void> {
    await this.sqliteCache.run(
      `INSERT OR REPLACE INTO memory_traces
       (id, session_id, workspace_id, timestamp, trace_type, content, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        event.data.id,
        event.sessionId,
        event.workspaceId,
        event.timestamp,
        event.data.traceType ?? null,
        event.data.content,
        event.data.metadataJson ?? null
      ]
    );
  }

  // ============================================================================
  // Event Application (Conversation)
  // ============================================================================

  /**
   * Apply a conversation-related event to SQLite cache.
   *
   * Translates event into appropriate SQL operations.
   *
   * @param event - Conversation event to apply
   */
  private async applyConversationEvent(event: ConversationEvent): Promise<void> {
    switch (event.type) {
      case 'metadata':
        await this.applyConversationCreated(event);
        break;
      case 'conversation_updated':
        await this.applyConversationUpdated(event);
        break;
      case 'message':
        await this.applyMessageAdded(event);
        break;
      case 'message_updated':
        await this.applyMessageUpdated(event);
        break;
    }
  }

  private async applyConversationCreated(event: ConversationCreatedEvent): Promise<void> {
    await this.sqliteCache.run(
      `INSERT OR REPLACE INTO conversations
       (id, title, created, updated, vault_name, message_count, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        event.data.id,
        event.data.title,
        event.data.created,
        event.data.created,
        event.data.vault,
        0,
        event.data.settings ? JSON.stringify(event.data.settings) : null
      ]
    );
  }

  private async applyConversationUpdated(event: ConversationUpdatedEvent): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    if (event.data.title !== undefined) { updates.push('title = ?'); values.push(event.data.title); }
    if (event.data.updated !== undefined) { updates.push('updated = ?'); values.push(event.data.updated); }
    if (event.data.settings !== undefined) { updates.push('metadata_json = ?'); values.push(JSON.stringify(event.data.settings)); }

    if (updates.length > 0) {
      values.push(event.conversationId);
      await this.sqliteCache.run(
        `UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }
  }

  private async applyMessageAdded(event: MessageEvent): Promise<void> {
    await this.sqliteCache.run(
      `INSERT OR REPLACE INTO messages
       (id, conversation_id, role, content, timestamp, state, tool_calls_json, tool_call_id, sequence_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.data.id,
        event.conversationId,
        event.data.role,
        event.data.content,
        event.timestamp,
        event.data.state ?? 'complete',
        event.data.tool_calls ? JSON.stringify(event.data.tool_calls) : null,
        event.data.tool_call_id ?? null,
        event.data.sequenceNumber
      ]
    );

    // Update message count
    await this.sqliteCache.run(
      `UPDATE conversations SET message_count = message_count + 1, updated = ? WHERE id = ?`,
      [event.timestamp, event.conversationId]
    );
  }

  private async applyMessageUpdated(event: MessageUpdatedEvent): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    if (event.data.content !== undefined) { updates.push('content = ?'); values.push(event.data.content); }
    if (event.data.state !== undefined) { updates.push('state = ?'); values.push(event.data.state); }
    if (event.data.reasoning !== undefined) { updates.push('reasoning_content = ?'); values.push(event.data.reasoning); }

    if (updates.length > 0) {
      values.push(event.messageId);
      await this.sqliteCache.run(
        `UPDATE messages SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }
  }
}
