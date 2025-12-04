/**
 * Location: src/database/adapters/HybridStorageAdapter.ts
 *
 * Hybrid Storage Adapter - Coordinates JSONL (source of truth) + SQLite (cache)
 *
 * This adapter implements IStorageAdapter by:
 * 1. **Writes**: Append events to JSONL files, then immediately update SQLite cache
 * 2. **Reads**: Query from SQLite cache (fast, paginated)
 * 3. **Sync**: Use SyncCoordinator to sync JSONL → SQLite on startup and periodically
 *
 * Architecture:
 * - JSONL files are the source of truth (synced via Obsidian Sync)
 * - SQLite is a materialized view cache for fast queries
 * - All writes go to both JSONL and SQLite
 * - QueryCache layer for expensive reads
 *
 * Related Files:
 * - src/database/interfaces/IStorageAdapter.ts - Interface definition
 * - src/database/storage/JSONLWriter.ts - JSONL append operations
 * - src/database/storage/SQLiteCacheManager.ts - SQLite cache manager
 * - src/database/sync/SyncCoordinator.ts - Syncs JSONL to SQLite
 * - src/database/optimizations/QueryCache.ts - Query caching layer
 */

import { App } from 'obsidian';
import { v4 as uuidv4 } from 'uuid';
import { IStorageAdapter, QueryOptions, ImportOptions } from '../interfaces/IStorageAdapter';
import { JSONLWriter } from '../storage/JSONLWriter';
import { SQLiteCacheManager } from '../storage/SQLiteCacheManager';
import { SyncCoordinator } from '../sync/SyncCoordinator';
import { QueryCache } from '../optimizations/QueryCache';
import { PaginatedResult, PaginationParams, calculatePaginationMetadata } from '../../types/pagination/PaginationTypes';
import {
  WorkspaceMetadata,
  SessionMetadata,
  StateMetadata,
  StateData,
  ConversationMetadata,
  MessageData,
  MemoryTraceData,
  ExportFilter,
  ExportData,
  SyncResult,
  ToolCall
} from '../../types/storage/HybridStorageTypes';
import {
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
import { LegacyMigrator } from '../migration/LegacyMigrator';

/**
 * Configuration options for HybridStorageAdapter
 */
export interface HybridStorageAdapterOptions {
  /** Obsidian app instance */
  app: App;
  /** Base path for storage (default: '.nexus') */
  basePath?: string;
  /** Auto-sync on initialization (default: true) */
  autoSync?: boolean;
  /** Periodic sync interval in ms (default: 0 - no periodic sync) */
  syncInterval?: number;
  /** Query cache TTL in ms (default: 60000 - 1 minute) */
  cacheTTL?: number;
  /** Max query cache size (default: 500) */
  cacheMaxSize?: number;
}

/**
 * Hybrid Storage Adapter
 *
 * Coordinates between JSONL (source of truth) and SQLite (cache) for optimal
 * performance and sync compatibility.
 *
 * @example Basic usage
 * ```typescript
 * const adapter = new HybridStorageAdapter({
 *   app: obsidianApp,
 *   basePath: '.nexus',
 *   autoSync: true
 * });
 *
 * await adapter.initialize();
 *
 * // Create workspace (writes to JSONL + SQLite)
 * const wsId = await adapter.createWorkspace({
 *   name: 'My Project',
 *   rootFolder: '/projects/my-project',
 *   created: Date.now(),
 *   lastAccessed: Date.now(),
 *   isActive: true
 * });
 *
 * // Get workspace (reads from SQLite cache)
 * const workspace = await adapter.getWorkspace(wsId);
 *
 * // Cleanup
 * await adapter.close();
 * ```
 */
export class HybridStorageAdapter implements IStorageAdapter {
  private app: App;
  private basePath: string;
  private jsonlWriter: JSONLWriter;
  private sqliteCache: SQLiteCacheManager;
  private syncCoordinator: SyncCoordinator;
  private queryCache: QueryCache;
  private initialized: boolean = false;
  private syncInterval?: NodeJS.Timeout;

  constructor(options: HybridStorageAdapterOptions) {
    this.app = options.app;
    this.basePath = options.basePath ?? '.nexus';

    // Initialize components
    this.jsonlWriter = new JSONLWriter({
      app: options.app,
      basePath: this.basePath
    });

    this.sqliteCache = new SQLiteCacheManager({
      app: options.app,
      dbPath: `${this.basePath}/cache.db`,
      autoSaveInterval: 30000 // Auto-save every 30 seconds
    });

    this.syncCoordinator = new SyncCoordinator(
      this.jsonlWriter,
      this.sqliteCache
    );

    this.queryCache = new QueryCache({
      defaultTTL: options.cacheTTL ?? 60000,
      maxSize: options.cacheMaxSize ?? 500
    });
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  /**
   * Initialize the storage adapter
   *
   * 1. Initialize SQLite backend
   * 2. Ensure JSONL directories exist
   * 3. Perform initial sync (rebuild cache if needed)
   * 4. Start periodic sync if configured
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('[HybridStorageAdapter] Already initialized');
      return;
    }

    try {
      // 1. Initialize SQLite cache
      await this.sqliteCache.initialize();

      // 2. Ensure JSONL directories exist
      await this.jsonlWriter.ensureDirectory('workspaces');
      await this.jsonlWriter.ensureDirectory('conversations');

      // 3. Check for and run legacy migration if needed
      const migrator = new LegacyMigrator(this.app);
      const migrationNeeded = await migrator.isMigrationNeeded();

      if (migrationNeeded) {
        const migrationResult = await migrator.migrate();
        if (!migrationResult.success) {
          console.warn('[HybridStorageAdapter] Migration had issues:', migrationResult.errors);
        }
      }

      // 4. Perform initial sync (rebuild cache from JSONL)
      const syncState = await this.sqliteCache.getSyncState(this.jsonlWriter.getDeviceId());
      if (!syncState || migrationNeeded) {
        await this.syncCoordinator.fullRebuild();
      } else {
        await this.syncCoordinator.sync();
      }

      this.initialized = true;

      // 5. Start periodic sync if configured
      // Note: Periodic sync is disabled by default - manual sync only
      // This prevents excessive I/O during normal operations

    } catch (error) {
      console.error('[HybridStorageAdapter] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Close the storage adapter and release resources
   *
   * 1. Stop periodic sync timer
   * 2. Clear query cache
   * 3. Close SQLite backend
   */
  async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      // Stop sync timer
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = undefined;
      }

      // Clear query cache
      this.queryCache.clear();

      // Close SQLite
      await this.sqliteCache.close();

      this.initialized = false;
    } catch (error) {
      console.error('[HybridStorageAdapter] Error during close:', error);
      throw error;
    }
  }

  /**
   * Synchronize SQLite cache with JSONL source of truth
   *
   * Applies new events from JSONL files to SQLite cache.
   * Invalidates query cache on completion.
   */
  async sync(): Promise<SyncResult> {
    try {
      const result = await this.syncCoordinator.sync();

      // Invalidate all query cache on sync
      this.queryCache.clear();

      return result;
    } catch (error) {
      console.error('[HybridStorageAdapter] Sync failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // Workspace Operations
  // ============================================================================

  /**
   * Get a single workspace by ID
   */
  async getWorkspace(id: string): Promise<WorkspaceMetadata | null> {
    this.ensureInitialized();

    return this.queryCache.cachedQuery(
      QueryCache.workspaceKey(id),
      async () => {
        const result = await this.sqliteCache.queryOne<any>(
          'SELECT * FROM workspaces WHERE id = ?',
          [id]
        );
        return result ? this.rowToWorkspace(result) : null;
      }
    );
  }

  /**
   * Get all workspaces with pagination and filtering
   */
  async getWorkspaces(options?: QueryOptions): Promise<PaginatedResult<WorkspaceMetadata>> {
    this.ensureInitialized();

    const page = options?.page ?? 0;
    const pageSize = Math.min(options?.pageSize ?? 25, 200);
    const sortBy = options?.sortBy ?? 'last_accessed';
    const sortOrder = options?.sortOrder ?? 'desc';

    // Build query
    let whereClause = '';
    const params: any[] = [];

    if (options?.filter) {
      const filters: string[] = [];
      if (options.filter.isActive !== undefined) {
        filters.push('is_active = ?');
        params.push(options.filter.isActive ? 1 : 0);
      }
      if (filters.length > 0) {
        whereClause = `WHERE ${filters.join(' AND ')}`;
      }
    }

    // Count query
    const countResult = await this.sqliteCache.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM workspaces ${whereClause}`,
      params
    );
    const totalItems = countResult?.count ?? 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    // Data query
    const dataParams = [...params, pageSize, page * pageSize];
    const rows = await this.sqliteCache.query<any>(
      `SELECT * FROM workspaces ${whereClause}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT ? OFFSET ?`,
      dataParams
    );

    return {
      items: rows.map(r => this.rowToWorkspace(r)),
      ...calculatePaginationMetadata(page, pageSize, totalItems)
    };
  }

  /**
   * Create a new workspace
   *
   * 1. Write event to JSONL
   * 2. Update SQLite cache
   * 3. Invalidate query cache
   */
  async createWorkspace(workspace: Omit<WorkspaceMetadata, 'id'>): Promise<string> {
    this.ensureInitialized();

    const id = uuidv4();
    const now = Date.now();

    try {
      // 1. Write event to JSONL
      await this.jsonlWriter.appendEvent<WorkspaceCreatedEvent>(
        `workspaces/ws_${id}.jsonl`,
        {
          type: 'workspace_created',
          data: {
            id,
            name: workspace.name,
            description: workspace.description,
            rootFolder: workspace.rootFolder,
            created: workspace.created ?? now,
            dedicatedAgentId: workspace.dedicatedAgentId
          }
        }
      );

      // 2. Update SQLite cache
      await this.sqliteCache.run(
        `INSERT INTO workspaces (id, name, description, root_folder, created, last_accessed, is_active, dedicated_agent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          workspace.name,
          workspace.description ?? null,
          workspace.rootFolder,
          workspace.created ?? now,
          workspace.lastAccessed ?? now,
          workspace.isActive ? 1 : 0,
          workspace.dedicatedAgentId ?? null
        ]
      );

      // 3. Invalidate cache
      this.queryCache.invalidateByType('workspace');

      return id;

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to create workspace:', error);
      throw error;
    }
  }

  /**
   * Update an existing workspace
   *
   * 1. Write event to JSONL
   * 2. Update SQLite cache
   * 3. Invalidate query cache
   */
  async updateWorkspace(id: string, updates: Partial<WorkspaceMetadata>): Promise<void> {
    this.ensureInitialized();

    try {
      // 1. Write event to JSONL
      await this.jsonlWriter.appendEvent<WorkspaceUpdatedEvent>(
        `workspaces/ws_${id}.jsonl`,
        {
          type: 'workspace_updated',
          workspaceId: id,
          data: {
            name: updates.name,
            description: updates.description,
            rootFolder: updates.rootFolder,
            lastAccessed: updates.lastAccessed ?? Date.now(),
            isActive: updates.isActive
          }
        }
      );

      // 2. Update SQLite cache
      const setClauses: string[] = [];
      const params: any[] = [];

      if (updates.name !== undefined) { setClauses.push('name = ?'); params.push(updates.name); }
      if (updates.description !== undefined) { setClauses.push('description = ?'); params.push(updates.description); }
      if (updates.rootFolder !== undefined) { setClauses.push('root_folder = ?'); params.push(updates.rootFolder); }
      if (updates.isActive !== undefined) { setClauses.push('is_active = ?'); params.push(updates.isActive ? 1 : 0); }
      if (updates.dedicatedAgentId !== undefined) { setClauses.push('dedicated_agent_id = ?'); params.push(updates.dedicatedAgentId); }

      setClauses.push('last_accessed = ?');
      params.push(updates.lastAccessed ?? Date.now());

      params.push(id);

      await this.sqliteCache.run(
        `UPDATE workspaces SET ${setClauses.join(', ')} WHERE id = ?`,
        params
      );

      // 3. Invalidate cache
      this.queryCache.invalidateKey(QueryCache.workspaceKey(id));
      this.queryCache.invalidateByType('workspace');

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to update workspace:', error);
      throw error;
    }
  }

  /**
   * Delete a workspace
   *
   * 1. Write event to JSONL
   * 2. Delete from SQLite (cascades to sessions, states, traces)
   * 3. Invalidate query cache
   */
  async deleteWorkspace(id: string): Promise<void> {
    this.ensureInitialized();

    try {
      // 1. Write event to JSONL
      await this.jsonlWriter.appendEvent<WorkspaceDeletedEvent>(
        `workspaces/ws_${id}.jsonl`,
        {
          type: 'workspace_deleted',
          workspaceId: id
        }
      );

      // 2. Delete from SQLite (cascades via foreign keys)
      await this.sqliteCache.run('DELETE FROM workspaces WHERE id = ?', [id]);

      // 3. Invalidate cache
      this.queryCache.invalidateByType('workspace');
      this.queryCache.invalidateByType('session');
      this.queryCache.invalidateByType('state');

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to delete workspace:', error);
      throw error;
    }
  }

  /**
   * Search workspaces by name or description using FTS
   */
  async searchWorkspaces(query: string): Promise<WorkspaceMetadata[]> {
    this.ensureInitialized();

    const rows = await this.sqliteCache.searchWorkspaces(query);
    return rows.map(r => this.rowToWorkspace(r));
  }

  // ============================================================================
  // Session Operations
  // ============================================================================

  /**
   * Get sessions for a workspace with pagination
   */
  async getSessions(
    workspaceId: string,
    options?: PaginationParams
  ): Promise<PaginatedResult<SessionMetadata>> {
    this.ensureInitialized();

    const page = options?.page ?? 0;
    const pageSize = Math.min(options?.pageSize ?? 25, 200);

    // Count query
    const countResult = await this.sqliteCache.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM sessions WHERE workspace_id = ?',
      [workspaceId]
    );
    const totalItems = countResult?.count ?? 0;

    // Data query
    const rows = await this.sqliteCache.query<any>(
      `SELECT * FROM sessions WHERE workspace_id = ?
       ORDER BY start_time DESC
       LIMIT ? OFFSET ?`,
      [workspaceId, pageSize, page * pageSize]
    );

    return {
      items: rows.map(r => this.rowToSession(r)),
      ...calculatePaginationMetadata(page, pageSize, totalItems)
    };
  }

  /**
   * Get a single session by ID
   */
  async getSession(id: string): Promise<SessionMetadata | null> {
    this.ensureInitialized();

    const result = await this.sqliteCache.queryOne<any>(
      'SELECT * FROM sessions WHERE id = ?',
      [id]
    );
    return result ? this.rowToSession(result) : null;
  }

  /**
   * Create a new session
   */
  async createSession(
    workspaceId: string,
    session: Omit<SessionMetadata, 'id' | 'workspaceId'>
  ): Promise<string> {
    this.ensureInitialized();

    const id = uuidv4();

    try {
      // 1. Write event to JSONL
      await this.jsonlWriter.appendEvent<SessionCreatedEvent>(
        `workspaces/ws_${workspaceId}.jsonl`,
        {
          type: 'session_created',
          workspaceId,
          data: {
            id,
            name: session.name,
            description: session.description,
            startTime: session.startTime
          }
        }
      );

      // 2. Update SQLite cache
      await this.sqliteCache.run(
        `INSERT INTO sessions (id, workspace_id, name, description, start_time, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          workspaceId,
          session.name,
          session.description ?? null,
          session.startTime,
          session.isActive ? 1 : 0
        ]
      );

      // 3. Invalidate cache
      this.queryCache.invalidateByType('session');

      return id;

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Update an existing session
   */
  async updateSession(
    workspaceId: string,
    sessionId: string,
    updates: Partial<SessionMetadata>
  ): Promise<void> {
    this.ensureInitialized();

    try {
      // 1. Write event to JSONL
      await this.jsonlWriter.appendEvent<SessionUpdatedEvent>(
        `workspaces/ws_${workspaceId}.jsonl`,
        {
          type: 'session_updated',
          workspaceId,
          sessionId,
          data: {
            name: updates.name,
            description: updates.description,
            endTime: updates.endTime,
            isActive: updates.isActive
          }
        }
      );

      // 2. Update SQLite cache
      const setClauses: string[] = [];
      const params: any[] = [];

      if (updates.name !== undefined) { setClauses.push('name = ?'); params.push(updates.name); }
      if (updates.description !== undefined) { setClauses.push('description = ?'); params.push(updates.description); }
      if (updates.endTime !== undefined) { setClauses.push('end_time = ?'); params.push(updates.endTime); }
      if (updates.isActive !== undefined) { setClauses.push('is_active = ?'); params.push(updates.isActive ? 1 : 0); }

      if (setClauses.length > 0) {
        params.push(sessionId);
        await this.sqliteCache.run(
          `UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ?`,
          params
        );
      }

      // 3. Invalidate cache
      this.queryCache.invalidateByType('session');

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to update session:', error);
      throw error;
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.ensureInitialized();

    try {
      // Note: No specific delete event in StorageEvents.ts - sessions are soft-deleted via update
      // For hard delete, we just remove from SQLite cache
      await this.sqliteCache.run('DELETE FROM sessions WHERE id = ?', [sessionId]);

      // Invalidate cache
      this.queryCache.invalidateByType('session');
      this.queryCache.invalidateByType('state');

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to delete session:', error);
      throw error;
    }
  }

  // ============================================================================
  // State Operations
  // ============================================================================

  /**
   * Get states for a workspace or session with pagination
   */
  async getStates(
    workspaceId: string,
    sessionId?: string,
    options?: PaginationParams
  ): Promise<PaginatedResult<StateMetadata>> {
    this.ensureInitialized();

    const page = options?.page ?? 0;
    const pageSize = Math.min(options?.pageSize ?? 25, 200);

    // Build query
    const whereClause = sessionId
      ? 'WHERE workspace_id = ? AND session_id = ?'
      : 'WHERE workspace_id = ?';
    const queryParams = sessionId ? [workspaceId, sessionId] : [workspaceId];

    // Count query
    const countResult = await this.sqliteCache.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM states ${whereClause}`,
      queryParams
    );
    const totalItems = countResult?.count ?? 0;

    // Data query
    const rows = await this.sqliteCache.query<any>(
      `SELECT * FROM states ${whereClause}
       ORDER BY created DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, pageSize, page * pageSize]
    );

    return {
      items: rows.map(r => this.rowToState(r)),
      ...calculatePaginationMetadata(page, pageSize, totalItems)
    };
  }

  /**
   * Get a single state by ID (includes full content)
   */
  async getState(id: string): Promise<StateData | null> {
    this.ensureInitialized();

    const result = await this.sqliteCache.queryOne<any>(
      'SELECT * FROM states WHERE id = ?',
      [id]
    );

    if (!result) return null;

    const metadata = this.rowToState(result);
    const content = result.state_json ? JSON.parse(result.state_json) : {};

    return {
      ...metadata,
      content
    };
  }

  /**
   * Save a new state or update existing
   */
  async saveState(
    workspaceId: string,
    sessionId: string,
    state: Omit<StateData, 'id' | 'workspaceId' | 'sessionId'>
  ): Promise<string> {
    this.ensureInitialized();

    const id = uuidv4();
    const now = Date.now();

    try {
      // 1. Write event to JSONL
      await this.jsonlWriter.appendEvent<StateSavedEvent>(
        `workspaces/ws_${workspaceId}.jsonl`,
        {
          type: 'state_saved',
          workspaceId,
          sessionId,
          data: {
            id,
            name: state.name,
            description: state.description,
            created: state.created ?? now,
            stateJson: JSON.stringify(state.content),
            tags: state.tags
          }
        }
      );

      // 2. Update SQLite cache
      await this.sqliteCache.run(
        `INSERT OR REPLACE INTO states (id, session_id, workspace_id, name, description, created, state_json, tags_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          sessionId,
          workspaceId,
          state.name,
          state.description ?? null,
          state.created ?? now,
          JSON.stringify(state.content),
          state.tags ? JSON.stringify(state.tags) : null
        ]
      );

      // 3. Invalidate cache
      this.queryCache.invalidateByType('state');

      return id;

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to save state:', error);
      throw error;
    }
  }

  /**
   * Delete a state
   */
  async deleteState(id: string): Promise<void> {
    this.ensureInitialized();

    try {
      // Get state info for JSONL event
      const state = await this.sqliteCache.queryOne<any>('SELECT * FROM states WHERE id = ?', [id]);
      if (!state) return;

      // 1. Write event to JSONL
      await this.jsonlWriter.appendEvent<StateDeletedEvent>(
        `workspaces/ws_${state.workspace_id}.jsonl`,
        {
          type: 'state_deleted',
          workspaceId: state.workspace_id,
          sessionId: state.session_id,
          stateId: id
        }
      );

      // 2. Delete from SQLite
      await this.sqliteCache.run('DELETE FROM states WHERE id = ?', [id]);

      // 3. Invalidate cache
      this.queryCache.invalidateByType('state');

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to delete state:', error);
      throw error;
    }
  }

  /**
   * Count states for a workspace or session
   */
  async countStates(workspaceId: string, sessionId?: string): Promise<number> {
    this.ensureInitialized();

    const whereClause = sessionId
      ? 'WHERE workspace_id = ? AND session_id = ?'
      : 'WHERE workspace_id = ?';
    const queryParams = sessionId ? [workspaceId, sessionId] : [workspaceId];

    const result = await this.sqliteCache.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM states ${whereClause}`,
      queryParams
    );

    return result?.count ?? 0;
  }

  // ============================================================================
  // Memory Trace Operations
  // ============================================================================

  /**
   * Get memory traces for a workspace or session with pagination
   */
  async getTraces(
    workspaceId: string,
    sessionId?: string,
    options?: PaginationParams
  ): Promise<PaginatedResult<MemoryTraceData>> {
    this.ensureInitialized();

    const page = options?.page ?? 0;
    const pageSize = Math.min(options?.pageSize ?? 25, 200);

    // Build query
    const whereClause = sessionId
      ? 'WHERE workspace_id = ? AND session_id = ?'
      : 'WHERE workspace_id = ?';
    const queryParams = sessionId ? [workspaceId, sessionId] : [workspaceId];

    // Count query
    const countResult = await this.sqliteCache.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM memory_traces ${whereClause}`,
      queryParams
    );
    const totalItems = countResult?.count ?? 0;

    // Data query
    const rows = await this.sqliteCache.query<any>(
      `SELECT * FROM memory_traces ${whereClause}
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, pageSize, page * pageSize]
    );

    return {
      items: rows.map(r => this.rowToTrace(r)),
      ...calculatePaginationMetadata(page, pageSize, totalItems)
    };
  }

  /**
   * Add a new memory trace
   */
  async addTrace(
    workspaceId: string,
    sessionId: string,
    trace: Omit<MemoryTraceData, 'id' | 'workspaceId' | 'sessionId'>
  ): Promise<string> {
    this.ensureInitialized();

    const id = uuidv4();

    try {
      // 1. Write event to JSONL
      await this.jsonlWriter.appendEvent<TraceAddedEvent>(
        `workspaces/ws_${workspaceId}.jsonl`,
        {
          type: 'trace_added',
          workspaceId,
          sessionId,
          data: {
            id,
            content: trace.content,
            traceType: trace.type,
            metadataJson: trace.metadata ? JSON.stringify(trace.metadata) : undefined
          }
        }
      );

      // 2. Update SQLite cache
      await this.sqliteCache.run(
        `INSERT INTO memory_traces (id, session_id, workspace_id, timestamp, trace_type, content, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          sessionId,
          workspaceId,
          trace.timestamp,
          trace.type ?? null,
          trace.content,
          trace.metadata ? JSON.stringify(trace.metadata) : null
        ]
      );

      return id;

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to add trace:', error);
      throw error;
    }
  }

  /**
   * Search memory traces by content
   */
  async searchTraces(
    workspaceId: string,
    query: string,
    sessionId?: string
  ): Promise<MemoryTraceData[]> {
    this.ensureInitialized();

    // Simple LIKE search (FTS not available for traces)
    const whereClause = sessionId
      ? 'WHERE workspace_id = ? AND session_id = ? AND content LIKE ?'
      : 'WHERE workspace_id = ? AND content LIKE ?';
    const queryParams = sessionId
      ? [workspaceId, sessionId, `%${query}%`]
      : [workspaceId, `%${query}%`];

    const rows = await this.sqliteCache.query<any>(
      `SELECT * FROM memory_traces ${whereClause}
       ORDER BY timestamp DESC
       LIMIT 50`,
      queryParams
    );

    return rows.map(r => this.rowToTrace(r));
  }

  // ============================================================================
  // Conversation Operations
  // ============================================================================

  /**
   * Get a single conversation by ID
   */
  async getConversation(id: string): Promise<ConversationMetadata | null> {
    this.ensureInitialized();

    return this.queryCache.cachedQuery(
      QueryCache.conversationKey(id),
      async () => {
        const result = await this.sqliteCache.queryOne<any>(
          'SELECT * FROM conversations WHERE id = ?',
          [id]
        );
        return result ? this.rowToConversation(result) : null;
      }
    );
  }

  /**
   * Get all conversations with pagination and filtering
   */
  async getConversations(options?: QueryOptions): Promise<PaginatedResult<ConversationMetadata>> {
    this.ensureInitialized();

    const page = options?.page ?? 0;
    const pageSize = Math.min(options?.pageSize ?? 25, 200);
    const sortBy = options?.sortBy ?? 'updated';
    const sortOrder = options?.sortOrder ?? 'desc';

    // Build query
    let whereClause = '';
    const params: any[] = [];

    if (options?.filter) {
      const filters: string[] = [];
      if (options.filter.vaultName) {
        filters.push('vault_name = ?');
        params.push(options.filter.vaultName);
      }
      if (filters.length > 0) {
        whereClause = `WHERE ${filters.join(' AND ')}`;
      }
    }

    // Count query
    const countResult = await this.sqliteCache.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM conversations ${whereClause}`,
      params
    );
    const totalItems = countResult?.count ?? 0;

    // Data query
    const dataParams = [...params, pageSize, page * pageSize];
    const rows = await this.sqliteCache.query<any>(
      `SELECT * FROM conversations ${whereClause}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT ? OFFSET ?`,
      dataParams
    );

    return {
      items: rows.map(r => this.rowToConversation(r)),
      ...calculatePaginationMetadata(page, pageSize, totalItems)
    };
  }

  /**
   * Create a new conversation
   */
  async createConversation(params: Omit<ConversationMetadata, 'id' | 'messageCount'>): Promise<string> {
    this.ensureInitialized();

    const id = uuidv4();
    const now = Date.now();

    try {
      // 1. Write event to JSONL
      await this.jsonlWriter.appendEvent<ConversationCreatedEvent>(
        `conversations/conv_${id}.jsonl`,
        {
          type: 'metadata',
          data: {
            id,
            title: params.title,
            created: params.created ?? now,
            vault: params.vaultName
          }
        }
      );

      // 2. Update SQLite cache
      await this.sqliteCache.run(
        `INSERT INTO conversations (id, title, created, updated, vault_name, message_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          params.title,
          params.created ?? now,
          params.updated ?? now,
          params.vaultName,
          0
        ]
      );

      // 3. Invalidate cache
      this.queryCache.invalidateByType('conversation');

      return id;

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to create conversation:', error);
      throw error;
    }
  }

  /**
   * Update an existing conversation
   */
  async updateConversation(id: string, updates: Partial<ConversationMetadata>): Promise<void> {
    this.ensureInitialized();

    try {
      // 1. Write event to JSONL
      await this.jsonlWriter.appendEvent<ConversationUpdatedEvent>(
        `conversations/conv_${id}.jsonl`,
        {
          type: 'conversation_updated',
          conversationId: id,
          data: {
            title: updates.title,
            updated: updates.updated ?? Date.now()
          }
        }
      );

      // 2. Update SQLite cache
      const setClauses: string[] = [];
      const params: any[] = [];

      if (updates.title !== undefined) { setClauses.push('title = ?'); params.push(updates.title); }
      setClauses.push('updated = ?');
      params.push(updates.updated ?? Date.now());

      params.push(id);

      await this.sqliteCache.run(
        `UPDATE conversations SET ${setClauses.join(', ')} WHERE id = ?`,
        params
      );

      // 3. Invalidate cache
      this.queryCache.invalidateKey(QueryCache.conversationKey(id));
      this.queryCache.invalidateByType('conversation');

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to update conversation:', error);
      throw error;
    }
  }

  /**
   * Delete a conversation and all its messages
   */
  async deleteConversation(id: string): Promise<void> {
    this.ensureInitialized();

    try {
      // No specific delete event in StorageEvents.ts for conversations
      // Just remove from SQLite cache (cascades to messages via foreign keys)
      await this.sqliteCache.run('DELETE FROM conversations WHERE id = ?', [id]);

      // Invalidate cache
      this.queryCache.invalidateByType('conversation');
      this.queryCache.invalidateByType('message');

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to delete conversation:', error);
      throw error;
    }
  }

  /**
   * Search conversations by title or content using FTS
   */
  async searchConversations(query: string): Promise<ConversationMetadata[]> {
    this.ensureInitialized();

    const rows = await this.sqliteCache.searchConversations(query);
    return rows.map(r => this.rowToConversation(r));
  }

  // ============================================================================
  // Message Operations
  // ============================================================================

  /**
   * Get messages for a conversation with pagination
   */
  async getMessages(
    conversationId: string,
    options?: PaginationParams
  ): Promise<PaginatedResult<MessageData>> {
    this.ensureInitialized();

    const page = options?.page ?? 0;
    const pageSize = Math.min(options?.pageSize ?? 50, 200);

    // Count query
    const countResult = await this.sqliteCache.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?',
      [conversationId]
    );
    const totalItems = countResult?.count ?? 0;

    // Data query (ordered by sequence number)
    const rows = await this.sqliteCache.query<any>(
      `SELECT * FROM messages WHERE conversation_id = ?
       ORDER BY sequence_number ASC
       LIMIT ? OFFSET ?`,
      [conversationId, pageSize, page * pageSize]
    );

    return {
      items: rows.map(r => this.rowToMessage(r)),
      ...calculatePaginationMetadata(page, pageSize, totalItems)
    };
  }

  /**
   * Add a new message to a conversation
   */
  async addMessage(
    conversationId: string,
    message: Omit<MessageData, 'id' | 'conversationId' | 'sequenceNumber'> & { id?: string }
  ): Promise<string> {
    this.ensureInitialized();

    const id = message.id || uuidv4();

    try {
      // Get next sequence number
      const maxSeqResult = await this.sqliteCache.queryOne<{ max_seq: number }>(
        'SELECT MAX(sequence_number) as max_seq FROM messages WHERE conversation_id = ?',
        [conversationId]
      );
      const sequenceNumber = (maxSeqResult?.max_seq ?? -1) + 1;

      // 1. Write event to JSONL
      await this.jsonlWriter.appendEvent<MessageEvent>(
        `conversations/conv_${conversationId}.jsonl`,
        {
          type: 'message',
          conversationId,
          data: {
            id,
            role: message.role,
            content: message.content,
            tool_calls: message.toolCalls?.map(tc => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.function.name, arguments: tc.function.arguments }
            })),
            tool_call_id: message.toolCallId,
            state: message.state,
            sequenceNumber
          }
        }
      );

      // 2. Update SQLite cache
      await this.sqliteCache.run(
        `INSERT INTO messages (id, conversation_id, role, content, timestamp, state, tool_calls_json, tool_call_id, sequence_number, reasoning_content)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          conversationId,
          message.role,
          message.content,
          message.timestamp,
          message.state ?? 'complete',
          message.toolCalls ? JSON.stringify(message.toolCalls) : null,
          message.toolCallId ?? null,
          sequenceNumber,
          message.reasoning ?? null
        ]
      );

      // Update message count
      await this.sqliteCache.run(
        'UPDATE conversations SET message_count = message_count + 1, updated = ? WHERE id = ?',
        [message.timestamp, conversationId]
      );

      // 3. Invalidate cache
      this.queryCache.invalidateByType('message');
      this.queryCache.invalidateKey(QueryCache.conversationKey(conversationId));

      return id;

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to add message:', error);
      throw error;
    }
  }

  /**
   * Update an existing message
   */
  async updateMessage(
    conversationId: string,
    messageId: string,
    updates: Partial<MessageData>
  ): Promise<void> {
    this.ensureInitialized();

    try {
      // 1. Write event to JSONL
      await this.jsonlWriter.appendEvent<MessageUpdatedEvent>(
        `conversations/conv_${conversationId}.jsonl`,
        {
          type: 'message_updated',
          conversationId,
          messageId,
          data: {
            content: updates.content ?? undefined,
            state: updates.state,
            reasoning: updates.reasoning
          }
        }
      );

      // 2. Update SQLite cache
      const setClauses: string[] = [];
      const params: any[] = [];

      if (updates.content !== undefined) { setClauses.push('content = ?'); params.push(updates.content); }
      if (updates.state !== undefined) { setClauses.push('state = ?'); params.push(updates.state); }
      if (updates.reasoning !== undefined) { setClauses.push('reasoning_content = ?'); params.push(updates.reasoning); }

      if (setClauses.length > 0) {
        params.push(messageId);
        await this.sqliteCache.run(
          `UPDATE messages SET ${setClauses.join(', ')} WHERE id = ?`,
          params
        );
      }

      // 3. Invalidate cache
      this.queryCache.invalidateByType('message');

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to update message:', error);
      throw error;
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    this.ensureInitialized();

    try {
      // No specific delete event for messages - just remove from SQLite
      await this.sqliteCache.run('DELETE FROM messages WHERE id = ?', [messageId]);

      // Update message count
      await this.sqliteCache.run(
        'UPDATE conversations SET message_count = message_count - 1 WHERE id = ?',
        [conversationId]
      );

      // Invalidate cache
      this.queryCache.invalidateByType('message');
      this.queryCache.invalidateKey(QueryCache.conversationKey(conversationId));

    } catch (error) {
      console.error('[HybridStorageAdapter] Failed to delete message:', error);
      throw error;
    }
  }

  // ============================================================================
  // Export Operations
  // ============================================================================

  /**
   * Export conversations in OpenAI fine-tuning format
   */
  async exportConversationsForFineTuning(filter?: ExportFilter): Promise<string> {
    this.ensureInitialized();

    // Build query with filters
    let whereClause = '';
    const params: any[] = [];

    if (filter) {
      const filters: string[] = [];
      if (filter.startDate) {
        filters.push('created >= ?');
        params.push(filter.startDate);
      }
      if (filter.endDate) {
        filters.push('created <= ?');
        params.push(filter.endDate);
      }
      if (filter.conversationIds && filter.conversationIds.length > 0) {
        filters.push(`id IN (${filter.conversationIds.map(() => '?').join(', ')})`);
        params.push(...filter.conversationIds);
      }
      if (filters.length > 0) {
        whereClause = `WHERE ${filters.join(' AND ')}`;
      }
    }

    // Get conversations
    const conversations = await this.sqliteCache.query<any>(
      `SELECT * FROM conversations ${whereClause} ORDER BY created`,
      params
    );

    // Export to JSONL file
    const exportPath = `${this.basePath}/exports/finetune_${Date.now()}.jsonl`;
    let exportContent = '';

    for (const conv of conversations) {
      // Get messages for this conversation
      const messages = await this.sqliteCache.query<any>(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY sequence_number',
        [conv.id]
      );

      // Filter messages based on export filter
      const filteredMessages = messages.filter(msg => {
        if (filter?.includeSystem === false && msg.role === 'system') return false;
        if (filter?.includeTools === false && msg.role === 'tool') return false;
        return true;
      });

      // Format in OpenAI fine-tuning format
      const exportEntry = {
        messages: filteredMessages.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        }))
      };

      exportContent += JSON.stringify(exportEntry) + '\n';
    }

    // Ensure export directory exists
    await this.jsonlWriter.ensureDirectory('exports');

    // Write export file
    const file = this.app.vault.getAbstractFileByPath(exportPath);
    if (file) {
      await this.app.vault.modify(file as any, exportContent);
    } else {
      await this.app.vault.create(exportPath, exportContent);
    }

    return exportPath;
  }

  /**
   * Export all data for backup or migration
   */
  async exportAllData(): Promise<ExportData> {
    this.ensureInitialized();

    // Export workspaces
    const workspaceRows = await this.sqliteCache.query<any>('SELECT * FROM workspaces');
    const workspaces = await Promise.all(
      workspaceRows.map(async (ws) => {
        // Get sessions
        const sessionRows = await this.sqliteCache.query<any>(
          'SELECT * FROM sessions WHERE workspace_id = ?',
          [ws.id]
        );

        // Get states
        const stateRows = await this.sqliteCache.query<any>(
          'SELECT * FROM states WHERE workspace_id = ?',
          [ws.id]
        );

        // Get traces
        const traceRows = await this.sqliteCache.query<any>(
          'SELECT * FROM memory_traces WHERE workspace_id = ?',
          [ws.id]
        );

        return {
          metadata: this.rowToWorkspace(ws),
          sessions: sessionRows.map(s => this.rowToSession(s)),
          states: stateRows.map(s => {
            const meta = this.rowToState(s);
            return {
              ...meta,
              content: s.state_json ? JSON.parse(s.state_json) : {}
            };
          }),
          traces: traceRows.map(t => this.rowToTrace(t))
        };
      })
    );

    // Export conversations
    const conversationRows = await this.sqliteCache.query<any>('SELECT * FROM conversations');
    const conversations = await Promise.all(
      conversationRows.map(async (conv) => {
        const messageRows = await this.sqliteCache.query<any>(
          'SELECT * FROM messages WHERE conversation_id = ? ORDER BY sequence_number',
          [conv.id]
        );

        return {
          metadata: this.rowToConversation(conv),
          messages: messageRows.map(m => this.rowToMessage(m))
        };
      })
    );

    return {
      version: '1.0.0',
      exportedAt: Date.now(),
      deviceId: this.jsonlWriter.getDeviceId(),
      workspaces,
      conversations
    };
  }

  /**
   * Import data from an export
   */
  async importData(data: ExportData, options?: ImportOptions): Promise<void> {
    this.ensureInitialized();

    const mode = options?.mode ?? 'merge';
    const conflictResolution = options?.conflictResolution ?? 'skip';

    // If replace mode, clear all data first
    if (mode === 'replace') {
      await this.sqliteCache.clearAllData();
    }

    // Import workspaces
    for (const ws of data.workspaces) {
      // Check if workspace exists
      const existing = await this.getWorkspace(ws.metadata.id);

      if (existing && conflictResolution === 'skip') {
        continue; // Skip existing
      }

      // Import workspace
      if (!existing || conflictResolution === 'overwrite') {
        // Create or update workspace
        if (!existing) {
          await this.createWorkspace(ws.metadata);
        } else {
          await this.updateWorkspace(ws.metadata.id, ws.metadata);
        }

        // Import sessions
        for (const session of ws.sessions) {
          await this.createSession(ws.metadata.id, session);
        }

        // Import states
        for (const state of ws.states) {
          await this.saveState(ws.metadata.id, state.sessionId, state);
        }

        // Import traces
        for (const trace of ws.traces) {
          await this.addTrace(ws.metadata.id, trace.sessionId, trace);
        }
      }
    }

    // Import conversations
    for (const conv of data.conversations) {
      const existing = await this.getConversation(conv.metadata.id);

      if (existing && conflictResolution === 'skip') {
        continue;
      }

      if (!existing || conflictResolution === 'overwrite') {
        // Create conversation
        if (!existing) {
          await this.createConversation(conv.metadata);
        }

        // Import messages
        for (const message of conv.messages) {
          await this.addMessage(conv.metadata.id, message);
        }
      }
    }

    // Rebuild FTS indexes
    await this.sqliteCache.rebuildFTSIndexes();
  }

  // ============================================================================
  // Helper Methods - Row to Type Conversions
  // ============================================================================

  private rowToWorkspace(row: any): WorkspaceMetadata {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      rootFolder: row.root_folder,
      created: row.created,
      lastAccessed: row.last_accessed,
      isActive: row.is_active === 1,
      dedicatedAgentId: row.dedicated_agent_id ?? undefined
    };
  }

  private rowToSession(row: any): SessionMetadata {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      description: row.description ?? undefined,
      startTime: row.start_time,
      endTime: row.end_time ?? undefined,
      isActive: row.is_active === 1
    };
  }

  private rowToState(row: any): StateMetadata {
    return {
      id: row.id,
      sessionId: row.session_id,
      workspaceId: row.workspace_id,
      name: row.name,
      description: row.description ?? undefined,
      created: row.created,
      tags: row.tags_json ? JSON.parse(row.tags_json) : undefined
    };
  }

  private rowToConversation(row: any): ConversationMetadata {
    return {
      id: row.id,
      title: row.title,
      created: row.created,
      updated: row.updated,
      vaultName: row.vault_name,
      messageCount: row.message_count
    };
  }

  private rowToMessage(row: any): MessageData {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      state: row.state ?? 'complete',
      sequenceNumber: row.sequence_number,
      toolCalls: row.tool_calls_json ? JSON.parse(row.tool_calls_json) : undefined,
      toolCallId: row.tool_call_id ?? undefined,
      reasoning: row.reasoning_content ?? undefined
    };
  }

  private rowToTrace(row: any): MemoryTraceData {
    return {
      id: row.id,
      sessionId: row.session_id,
      workspaceId: row.workspace_id,
      timestamp: row.timestamp,
      type: row.trace_type ?? undefined,
      content: row.content,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('HybridStorageAdapter not initialized. Call initialize() first.');
    }
  }
}
