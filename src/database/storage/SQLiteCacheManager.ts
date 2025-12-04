/**
 * Location: src/database/storage/SQLiteCacheManager.ts
 * Purpose: SQLite cache manager using sql.js for hybrid storage system
 *
 * Provides:
 * - Local cache for fast queries and true pagination
 * - Can be rebuilt from JSONL files anytime
 * - Full-text search via FTS5
 * - Transaction support
 * - Event tracking to prevent duplicate processing
 *
 * Relationships:
 * - Used by StorageManager for fast queries
 * - Backed by JSONL files in EventLogManager
 * - Implements IStorageBackend interface
 */

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { App, TFile } from 'obsidian';
import { PaginatedResult, PaginationParams } from '../../types/pagination/PaginationTypes';
import { IStorageBackend, RunResult, DatabaseStats } from '../interfaces/IStorageBackend';
import type { SyncState, ISQLiteCacheManager } from '../sync/SyncCoordinator';

// Import schema from TypeScript module (esbuild compatible)
import { SCHEMA_SQL } from '../schema/schema';

export interface SQLiteCacheManagerOptions {
  app: App;
  dbPath: string;  // e.g., '.nexus/cache.db'
  autoSaveInterval?: number; // Auto-save interval in ms (default: 30000)
}

export interface QueryResult<T> {
  items: T[];
  totalCount?: number;
}

/**
 * SQLite cache manager using sql.js
 *
 * Features:
 * - Pure JavaScript SQLite (no native dependencies)
 * - Stored as binary in Obsidian vault
 * - Full-text search with FTS5
 * - Cursor-based pagination
 * - Transaction support
 * - Auto-save with dirty tracking
 */
export class SQLiteCacheManager implements IStorageBackend, ISQLiteCacheManager {
  private app: App;
  private dbPath: string;
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private isDirty: boolean = false;
  private autoSaveInterval: number;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;

  constructor(options: SQLiteCacheManagerOptions) {
    this.app = options.app;
    this.dbPath = options.dbPath;
    this.autoSaveInterval = options.autoSaveInterval ?? 30000;
  }

  /**
   * Initialize sql.js and create/open database
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[SQLiteCacheManager] Already initialized');
      return;
    }

    try {
      // Initialize sql.js
      this.SQL = await initSqlJs({
        // Load sql.js wasm from CDN
        locateFile: (file: string) => `https://sql.js.org/dist/${file}`
      });

      // Try to load existing database
      const existingData = await this.loadDatabaseFile();

      if (existingData) {
        this.db = new this.SQL.Database(existingData);
        console.log('[SQLiteCacheManager] Loaded existing database');
      } else {
        // Create new database with schema
        this.db = new this.SQL.Database();
        await this.exec(SCHEMA_SQL);
        await this.save(); // Persist the new database
        console.log('[SQLiteCacheManager] Created new database with schema');
      }

      this.isInitialized = true;

      // Start auto-save timer
      this.startAutoSave();
    } catch (error) {
      console.error('[SQLiteCacheManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load database file from Obsidian vault
   */
  private async loadDatabaseFile(): Promise<Uint8Array | null> {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.dbPath);
      if (!(file instanceof TFile)) {
        return null;
      }

      const arrayBuffer = await this.app.vault.readBinary(file);
      return new Uint8Array(arrayBuffer);
    } catch (error) {
      console.error('[SQLiteCacheManager] Failed to load database file:', error);
      return null;
    }
  }

  /**
   * Save database to Obsidian vault
   */
  async save(): Promise<void> {
    if (!this.db) {
      console.warn('[SQLiteCacheManager] Cannot save: database not initialized');
      return;
    }

    if (!this.isDirty) {
      return; // No changes to save
    }

    try {
      const data = this.db.export();
      // Convert Uint8Array to ArrayBuffer (Obsidian API requires ArrayBuffer, not SharedArrayBuffer)
      const buffer = new ArrayBuffer(data.byteLength);
      new Uint8Array(buffer).set(data);

      // Ensure parent directory exists (race-safe)
      const parentPath = this.dbPath.substring(0, this.dbPath.lastIndexOf('/'));
      const parentFolder = this.app.vault.getAbstractFileByPath(parentPath);
      if (!parentFolder) {
        try {
          await this.app.vault.createFolder(parentPath);
        } catch (e: any) {
          // Ignore "already exists" errors (race condition with other init code)
          if (!e?.message?.includes('already exists')) {
            throw e;
          }
        }
      }

      const file = this.app.vault.getAbstractFileByPath(this.dbPath);
      if (file instanceof TFile) {
        await this.app.vault.modifyBinary(file, buffer);
      } else {
        // Try to create, but handle race condition where file exists but isn't in metadata cache yet
        try {
          await this.app.vault.createBinary(this.dbPath, buffer);
        } catch (createError: any) {
          if (createError?.message?.includes('already exists')) {
            // File exists but wasn't in metadata cache - wait a bit and retry with modify
            await new Promise(resolve => setTimeout(resolve, 100));
            const retryFile = this.app.vault.getAbstractFileByPath(this.dbPath);
            if (retryFile instanceof TFile) {
              await this.app.vault.modifyBinary(retryFile, buffer);
            } else {
              // Last resort: delete and recreate
              await this.app.vault.adapter.remove(this.dbPath);
              await this.app.vault.createBinary(this.dbPath, buffer);
            }
          } else {
            throw createError;
          }
        }
      }

      this.isDirty = false;
    } catch (error) {
      console.error('[SQLiteCacheManager] Failed to save database:', error);
      throw error;
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(async () => {
      if (this.isDirty) {
        try {
          await this.save();
        } catch (error) {
          console.error('[SQLiteCacheManager] Auto-save failed:', error);
        }
      }
    }, this.autoSaveInterval);
  }

  /**
   * Close the database
   */
  async close(): Promise<void> {
    try {
      // Stop auto-save timer
      if (this.autoSaveTimer) {
        clearInterval(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }

      // Save if dirty
      if (this.isDirty) {
        await this.save();
      }

      // Close database
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      this.isInitialized = false;
    } catch (error) {
      console.error('[SQLiteCacheManager] Error closing database:', error);
      throw error;
    }
  }

  /**
   * Execute raw SQL (for schema creation and multi-statement execution)
   */
  async exec(sql: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      this.db.exec(sql);
      this.isDirty = true;
    } catch (error) {
      console.error('[SQLiteCacheManager] Exec failed:', error);
      throw error;
    }
  }

  /**
   * Query returning multiple rows
   */
  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const stmt = this.db.prepare(sql);

      if (params && params.length > 0) {
        stmt.bind(params);
      }

      const results: T[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject() as T);
      }
      stmt.free();

      return results;
    } catch (error) {
      console.error('[SQLiteCacheManager] Query failed:', error, { sql, params });
      throw error;
    }
  }

  /**
   * Query returning single row
   */
  async queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Run a statement (INSERT, UPDATE, DELETE)
   */
  async run(sql: string, params?: any[]): Promise<RunResult> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      this.db.run(sql, params);
      this.isDirty = true;

      const changes = this.db.getRowsModified();

      // Get last insert rowid via query
      const lastIdResult = this.db.exec('SELECT last_insert_rowid() as id');
      const lastInsertRowid = lastIdResult.length > 0 && lastIdResult[0].values.length > 0
        ? lastIdResult[0].values[0][0] as number
        : 0;

      return { changes, lastInsertRowid };
    } catch (error) {
      console.error('[SQLiteCacheManager] Run failed:', error, { sql, params });
      throw error;
    }
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<void> {
    await this.exec('BEGIN TRANSACTION');
  }

  /**
   * Commit a transaction
   */
  async commit(): Promise<void> {
    await this.exec('COMMIT');
  }

  /**
   * Rollback a transaction
   */
  async rollback(): Promise<void> {
    await this.exec('ROLLBACK');
  }

  /**
   * Execute a function within a transaction
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.beginTransaction();
    try {
      const result = await fn();
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  // ==================== Higher-level query methods ====================

  /**
   * Get paginated results with offset-based pagination
   */
  async queryPaginated<T>(
    baseQuery: string,
    countQuery: string,
    options: PaginationParams = {},
    params: any[] = []
  ): Promise<PaginatedResult<T>> {
    const page = options.page ?? 0;
    const pageSize = Math.min(options.pageSize ?? 25, 200);
    const offset = page * pageSize;

    // Get total count
    const countResult = await this.queryOne<{ count: number }>(countQuery, params);
    const totalItems = countResult?.count ?? 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    // Get paginated results
    const paginatedQuery = `${baseQuery} LIMIT ? OFFSET ?`;
    const items = await this.query<T>(paginatedQuery, [...params, pageSize, offset]);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages - 1,
      hasPreviousPage: page > 0
    };
  }

  // ==================== Event tracking ====================

  /**
   * Check if an event has already been applied
   */
  async isEventApplied(eventId: string): Promise<boolean> {
    const result = await this.queryOne<{ event_id: string }>(
      'SELECT event_id FROM applied_events WHERE event_id = ?',
      [eventId]
    );
    return result !== null;
  }

  /**
   * Mark an event as applied
   */
  async markEventApplied(eventId: string): Promise<void> {
    await this.run(
      'INSERT OR IGNORE INTO applied_events (event_id, applied_at) VALUES (?, ?)',
      [eventId, Date.now()]
    );
  }

  /**
   * Get list of applied event IDs after a timestamp
   */
  async getAppliedEventsAfter(timestamp: number): Promise<string[]> {
    const results = await this.query<{ event_id: string }>(
      'SELECT event_id FROM applied_events WHERE applied_at > ? ORDER BY applied_at',
      [timestamp]
    );
    return results.map(r => r.event_id);
  }

  // ==================== Sync state ====================

  /**
   * Get sync state for a device
   */
  async getSyncState(deviceId: string): Promise<SyncState | null> {
    const result = await this.queryOne<{ device_id: string; last_event_timestamp: number; synced_files_json: string }>(
      'SELECT device_id, last_event_timestamp, synced_files_json FROM sync_state WHERE device_id = ?',
      [deviceId]
    );

    if (!result) return null;

    return {
      deviceId: result.device_id,
      lastEventTimestamp: result.last_event_timestamp,
      fileTimestamps: result.synced_files_json ? JSON.parse(result.synced_files_json) : {}
    };
  }

  /**
   * Update sync state for a device
   */
  async updateSyncState(deviceId: string, lastEventTimestamp: number, fileTimestamps: Record<string, number>): Promise<void> {
    await this.run(
      `INSERT OR REPLACE INTO sync_state (device_id, last_event_timestamp, synced_files_json)
       VALUES (?, ?, ?)`,
      [deviceId, lastEventTimestamp, JSON.stringify(fileTimestamps)]
    );
  }

  // ==================== Data management ====================

  /**
   * Clear all data (for rebuilding from JSONL)
   */
  async clearAllData(): Promise<void> {
    await this.transaction(async () => {
      await this.exec(`
        DELETE FROM messages;
        DELETE FROM conversations;
        DELETE FROM memory_traces;
        DELETE FROM states;
        DELETE FROM sessions;
        DELETE FROM workspaces;
        DELETE FROM applied_events;
      `);
    });
  }

  /**
   * Update FTS indexes after bulk data changes
   */
  async rebuildFTSIndexes(): Promise<void> {
    await this.transaction(async () => {
      // Rebuild workspace FTS (FTS4 uses docid)
      await this.exec(`
        DELETE FROM workspace_fts;
        INSERT INTO workspace_fts(docid, id, name, description)
        SELECT rowid, id, name, description FROM workspaces;
      `);

      // Rebuild conversation FTS
      await this.exec(`
        DELETE FROM conversation_fts;
        INSERT INTO conversation_fts(docid, id, title)
        SELECT rowid, id, title FROM conversations;
      `);

      // Rebuild message FTS
      await this.exec(`
        DELETE FROM message_fts;
        INSERT INTO message_fts(docid, id, conversation_id, content, reasoning_content)
        SELECT rowid, id, conversation_id, content, reasoning_content FROM messages;
      `);
    });
  }

  /**
   * Vacuum the database to reclaim space
   */
  async vacuum(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.exec('VACUUM');
      await this.save(); // Vacuum requires immediate save
    } catch (error) {
      console.error('[SQLiteCacheManager] Vacuum failed:', error);
      throw error;
    }
  }

  // ==================== Full-text search ====================

  /**
   * Search workspaces using FTS4
   * Note: FTS4 doesn't have built-in ranking like FTS5, ordered by last_accessed instead
   */
  async searchWorkspaces(query: string, limit: number = 50): Promise<any[]> {
    return this.query(
      `SELECT w.* FROM workspaces w
       JOIN workspace_fts fts ON w.id = fts.id
       WHERE workspace_fts MATCH ?
       ORDER BY w.last_accessed DESC
       LIMIT ?`,
      [query, limit]
    );
  }

  /**
   * Search conversations using FTS4
   */
  async searchConversations(query: string, limit: number = 50): Promise<any[]> {
    return this.query(
      `SELECT c.* FROM conversations c
       JOIN conversation_fts fts ON c.id = fts.id
       WHERE conversation_fts MATCH ?
       ORDER BY c.updated DESC
       LIMIT ?`,
      [query, limit]
    );
  }

  /**
   * Search messages using FTS4
   */
  async searchMessages(query: string, limit: number = 50): Promise<any[]> {
    return this.query(
      `SELECT m.* FROM messages m
       JOIN message_fts fts ON m.id = fts.id
       WHERE message_fts MATCH ?
       ORDER BY m.timestamp DESC
       LIMIT ?`,
      [query, limit]
    );
  }

  /**
   * Search messages within a specific conversation using FTS4
   */
  async searchMessagesInConversation(conversationId: string, query: string, limit: number = 50): Promise<any[]> {
    return this.query(
      `SELECT m.* FROM messages m
       JOIN message_fts fts ON m.id = fts.id
       WHERE fts.conversation_id = ? AND message_fts MATCH ?
       ORDER BY m.timestamp DESC
       LIMIT ?`,
      [conversationId, query, limit]
    );
  }

  // ==================== Statistics ====================

  /**
   * Get database statistics
   */
  async getStatistics(): Promise<{
    workspaces: number;
    sessions: number;
    states: number;
    traces: number;
    conversations: number;
    messages: number;
    appliedEvents: number;
    dbSizeBytes: number;
  }> {
    const stats = await Promise.all([
      this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM workspaces'),
      this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM sessions'),
      this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM states'),
      this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM memory_traces'),
      this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM conversations'),
      this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM messages'),
      this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM applied_events'),
    ]);

    let dbSizeBytes = 0;
    if (this.db) {
      const data = this.db.export();
      dbSizeBytes = data.length;
    }

    return {
      workspaces: stats[0]?.count ?? 0,
      sessions: stats[1]?.count ?? 0,
      states: stats[2]?.count ?? 0,
      traces: stats[3]?.count ?? 0,
      conversations: stats[4]?.count ?? 0,
      messages: stats[5]?.count ?? 0,
      appliedEvents: stats[6]?.count ?? 0,
      dbSizeBytes
    };
  }

  // ==================== Utilities ====================

  /**
   * Check if database is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }

  /**
   * Get database path
   */
  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.isDirty;
  }

  // ==================== IStorageBackend interface methods ====================

  /**
   * Check if database is open and ready (IStorageBackend requirement)
   */
  isOpen(): boolean {
    return this.isReady();
  }

  /**
   * Get database path (IStorageBackend requirement)
   */
  getDatabasePath(): string | null {
    return this.dbPath;
  }

  /**
   * Get database statistics (IStorageBackend requirement)
   */
  async getStats(): Promise<DatabaseStats> {
    const stats = await this.getStatistics();

    // Count tables
    const tableCountResult = await this.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"
    );
    const tableCount = tableCountResult?.count ?? 0;

    return {
      fileSize: stats.dbSizeBytes,
      tableCount,
      totalRows: stats.workspaces + stats.sessions + stats.states + stats.traces +
                 stats.conversations + stats.messages,
      tableCounts: {
        workspaces: stats.workspaces,
        sessions: stats.sessions,
        states: stats.states,
        memory_traces: stats.traces,
        conversations: stats.conversations,
        messages: stats.messages,
        applied_events: stats.appliedEvents
      },
      walMode: false // sql.js doesn't support WAL mode
    };
  }
}
