/**
 * Location: src/database/adapters/HybridStorageAdapter.ts
 *
 * Hybrid Storage Adapter - Thin Facade Following SOLID Principles
 *
 * This adapter coordinates JSONL (source of truth) + SQLite (cache) by:
 * 1. Owning infrastructure (JSONLWriter, SQLiteCache, SyncCoordinator, QueryCache)
 * 2. Delegating all entity operations to focused repositories
 * 3. Managing lifecycle (initialize, close, sync)
 *
 * SOLID Compliance:
 * - S: Only orchestration/lifecycle, no business logic
 * - O: Extensible through new repositories
 * - L: Implements IStorageAdapter
 * - I: Clean interface segregation
 * - D: Depends on repository abstractions
 *
 * Related Files:
 * - src/database/repositories/* - Entity repositories
 * - src/database/services/* - Business services
 * - src/database/interfaces/IStorageAdapter.ts - Interface definition
 */

import { App } from 'obsidian';
import { IStorageAdapter, QueryOptions, ImportOptions } from '../interfaces/IStorageAdapter';
import { JSONLWriter } from '../storage/JSONLWriter';
import { SQLiteCacheManager } from '../storage/SQLiteCacheManager';
import { SyncCoordinator } from '../sync/SyncCoordinator';
import { QueryCache } from '../optimizations/QueryCache';
import { PaginatedResult, PaginationParams } from '../../types/pagination/PaginationTypes';
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
  SyncResult
} from '../../types/storage/HybridStorageTypes';
import { RepositoryDependencies } from '../repositories/base/BaseRepository';
import { LegacyMigrator } from '../migration/LegacyMigrator';

// Import all repositories
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { SessionRepository } from '../repositories/SessionRepository';
import { StateRepository } from '../repositories/StateRepository';
import { TraceRepository } from '../repositories/TraceRepository';
import { ConversationRepository } from '../repositories/ConversationRepository';
import { MessageRepository } from '../repositories/MessageRepository';

// Import services
import { ExportService } from '../services/ExportService';

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
  /** Query cache TTL in ms (default: 60000) */
  cacheTTL?: number;
  /** Query cache max size (default: 500) */
  cacheMaxSize?: number;
}

/**
 * Hybrid Storage Adapter
 *
 * Thin facade that composes repositories and handles lifecycle.
 * Reduced from 1,696 lines to ~350 lines by delegating to repositories.
 */
export class HybridStorageAdapter implements IStorageAdapter {
  private app: App;
  private basePath: string;
  private initialized = false;
  private syncInterval?: NodeJS.Timeout;

  // Infrastructure (owned by adapter)
  private jsonlWriter: JSONLWriter;
  private sqliteCache: SQLiteCacheManager;
  private syncCoordinator: SyncCoordinator;
  private queryCache: QueryCache;

  // Repositories (composed)
  private workspaceRepo!: WorkspaceRepository;
  private sessionRepo!: SessionRepository;
  private stateRepo!: StateRepository;
  private traceRepo!: TraceRepository;
  private conversationRepo!: ConversationRepository;
  private messageRepo!: MessageRepository;

  // Services
  private exportService!: ExportService;

  constructor(options: HybridStorageAdapterOptions) {
    this.app = options.app;
    this.basePath = options.basePath ?? '.nexus';

    // Initialize infrastructure
    this.jsonlWriter = new JSONLWriter({
      app: this.app,
      basePath: this.basePath
    });

    this.sqliteCache = new SQLiteCacheManager({
      app: this.app,
      dbPath: `${this.basePath}/cache.db`,
      autoSaveInterval: 30000
    });

    this.syncCoordinator = new SyncCoordinator(
      this.jsonlWriter,
      this.sqliteCache
    );

    this.queryCache = new QueryCache({
      defaultTTL: options.cacheTTL ?? 60000,
      maxSize: options.cacheMaxSize ?? 500
    });

    // Create repository dependencies
    const deps: RepositoryDependencies = {
      jsonlWriter: this.jsonlWriter,
      sqliteCache: this.sqliteCache,
      queryCache: this.queryCache
    };

    // Initialize all repositories
    this.workspaceRepo = new WorkspaceRepository(deps);
    this.sessionRepo = new SessionRepository(deps);
    this.stateRepo = new StateRepository(deps);
    this.traceRepo = new TraceRepository(deps);
    this.conversationRepo = new ConversationRepository(deps);
    this.messageRepo = new MessageRepository(deps);

    // Initialize services
    this.exportService = new ExportService({
      app: this.app,
      conversationRepo: this.conversationRepo,
      messageRepo: this.messageRepo,
      workspaceRepo: this.workspaceRepo,
      sessionRepo: this.sessionRepo,
      stateRepo: this.stateRepo,
      traceRepo: this.traceRepo
    });
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

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
        console.log('[HybridStorageAdapter] Running legacy migration...');
        const migrationResult = await migrator.migrate();
        if (!migrationResult.success) {
          console.warn('[HybridStorageAdapter] Migration had issues:', migrationResult.errors);
        }
      }

      // 4. Perform initial sync (rebuild cache from JSONL)
      const syncState = await this.sqliteCache.getSyncState(this.jsonlWriter.getDeviceId());
      if (!syncState || migrationNeeded) {
        console.log('[HybridStorageAdapter] Performing full rebuild...');
        await this.syncCoordinator.fullRebuild();
      } else {
        console.log('[HybridStorageAdapter] Performing incremental sync...');
        await this.syncCoordinator.sync();
      }

      this.initialized = true;
      console.log('[HybridStorageAdapter] Initialized successfully');

    } catch (error) {
      console.error('[HybridStorageAdapter] Initialization failed:', error);
      throw error;
    }
  }

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
      console.log('[HybridStorageAdapter] Closed successfully');

    } catch (error) {
      console.error('[HybridStorageAdapter] Error during close:', error);
      throw error;
    }
  }

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
  // Workspace Operations - Delegate to WorkspaceRepository
  // ============================================================================

  getWorkspace = (id: string): Promise<WorkspaceMetadata | null> => {
    this.ensureInitialized();
    return this.workspaceRepo.getById(id);
  };

  getWorkspaces = (options?: QueryOptions): Promise<PaginatedResult<WorkspaceMetadata>> => {
    this.ensureInitialized();
    return this.workspaceRepo.getWorkspaces(options);
  };

  createWorkspace = (workspace: Omit<WorkspaceMetadata, 'id'>): Promise<string> => {
    this.ensureInitialized();
    return this.workspaceRepo.create(workspace);
  };

  updateWorkspace = (id: string, updates: Partial<WorkspaceMetadata>): Promise<void> => {
    this.ensureInitialized();
    return this.workspaceRepo.update(id, updates);
  };

  deleteWorkspace = (id: string): Promise<void> => {
    this.ensureInitialized();
    return this.workspaceRepo.delete(id);
  };

  searchWorkspaces = (query: string): Promise<WorkspaceMetadata[]> => {
    this.ensureInitialized();
    return this.workspaceRepo.search(query);
  };

  // ============================================================================
  // Session Operations - Delegate to SessionRepository
  // ============================================================================

  getSession = (id: string): Promise<SessionMetadata | null> => {
    this.ensureInitialized();
    return this.sessionRepo.getById(id);
  };

  getSessions = (workspaceId: string, options?: PaginationParams): Promise<PaginatedResult<SessionMetadata>> => {
    this.ensureInitialized();
    return this.sessionRepo.getByWorkspaceId(workspaceId, options);
  };

  createSession = (workspaceId: string, session: Omit<SessionMetadata, 'id' | 'workspaceId'>): Promise<string> => {
    this.ensureInitialized();
    return this.sessionRepo.create({ ...session, workspaceId });
  };

  updateSession = (workspaceId: string, sessionId: string, updates: Partial<SessionMetadata>): Promise<void> => {
    this.ensureInitialized();
    // Extract fields that are valid for UpdateSessionData (includes required workspaceId)
    const { name, description, endTime, isActive } = updates;
    return this.sessionRepo.update(sessionId, { name, description, endTime, isActive, workspaceId });
  };

  deleteSession = (sessionId: string): Promise<void> => {
    this.ensureInitialized();
    return this.sessionRepo.delete(sessionId);
  };

  // ============================================================================
  // State Operations - Delegate to StateRepository
  // ============================================================================

  getState = (id: string): Promise<StateData | null> => {
    this.ensureInitialized();
    return this.stateRepo.getStateData(id);
  };

  getStates = (
    workspaceId: string,
    sessionId?: string,
    options?: PaginationParams
  ): Promise<PaginatedResult<StateMetadata>> => {
    this.ensureInitialized();
    return this.stateRepo.getStates(workspaceId, sessionId, options);
  };

  saveState = (
    workspaceId: string,
    sessionId: string,
    state: Omit<StateData, 'id' | 'workspaceId' | 'sessionId'>
  ): Promise<string> => {
    this.ensureInitialized();
    return this.stateRepo.saveState(workspaceId, sessionId, state);
  };

  deleteState = (id: string): Promise<void> => {
    this.ensureInitialized();
    return this.stateRepo.delete(id);
  };

  countStates = (workspaceId: string, sessionId?: string): Promise<number> => {
    this.ensureInitialized();
    return this.stateRepo.countStates(workspaceId, sessionId);
  };

  // ============================================================================
  // Trace Operations - Delegate to TraceRepository
  // ============================================================================

  getTraces = (
    workspaceId: string,
    sessionId?: string,
    options?: PaginationParams
  ): Promise<PaginatedResult<MemoryTraceData>> => {
    this.ensureInitialized();
    return this.traceRepo.getTraces(workspaceId, sessionId, options);
  };

  addTrace = (
    workspaceId: string,
    sessionId: string,
    trace: Omit<MemoryTraceData, 'id' | 'workspaceId' | 'sessionId'>
  ): Promise<string> => {
    this.ensureInitialized();
    return this.traceRepo.addTrace(workspaceId, sessionId, trace);
  };

  searchTraces = async (
    workspaceId: string,
    query: string,
    sessionId?: string
  ): Promise<MemoryTraceData[]> => {
    this.ensureInitialized();
    // Repository returns paginated, but interface expects array
    const result = await this.traceRepo.searchTraces(workspaceId, query, sessionId);
    return result.items;
  };

  // ============================================================================
  // Conversation Operations - Delegate to ConversationRepository
  // ============================================================================

  getConversation = (id: string): Promise<ConversationMetadata | null> => {
    this.ensureInitialized();
    return this.conversationRepo.getById(id);
  };

  getConversations = (options?: QueryOptions): Promise<PaginatedResult<ConversationMetadata>> => {
    this.ensureInitialized();
    return this.conversationRepo.getConversations(options);
  };

  createConversation = (params: Omit<ConversationMetadata, 'id' | 'messageCount'>): Promise<string> => {
    this.ensureInitialized();
    return this.conversationRepo.create(params);
  };

  updateConversation = (id: string, updates: Partial<ConversationMetadata>): Promise<void> => {
    this.ensureInitialized();
    return this.conversationRepo.update(id, updates);
  };

  deleteConversation = (id: string): Promise<void> => {
    this.ensureInitialized();
    return this.conversationRepo.delete(id);
  };

  searchConversations = (query: string): Promise<ConversationMetadata[]> => {
    this.ensureInitialized();
    return this.conversationRepo.search(query);
  };

  // ============================================================================
  // Message Operations - Delegate to MessageRepository
  // ============================================================================

  getMessages = (
    conversationId: string,
    options?: PaginationParams
  ): Promise<PaginatedResult<MessageData>> => {
    this.ensureInitialized();
    return this.messageRepo.getMessages(conversationId, options);
  };

  addMessage = (
    conversationId: string,
    message: Omit<MessageData, 'id' | 'conversationId' | 'sequenceNumber'> & { id?: string }
  ): Promise<string> => {
    this.ensureInitialized();
    return this.messageRepo.addMessage(conversationId, message);
  };

  updateMessage = (
    _conversationId: string,
    messageId: string,
    updates: Partial<MessageData>
  ): Promise<void> => {
    this.ensureInitialized();
    return this.messageRepo.update(messageId, updates);
  };

  deleteMessage = (conversationId: string, messageId: string): Promise<void> => {
    this.ensureInitialized();
    return this.messageRepo.deleteMessage(conversationId, messageId);
  };

  // ============================================================================
  // Export/Import Operations - Delegate to ExportService
  // ============================================================================

  exportConversationsForFineTuning = (filter?: ExportFilter): Promise<string> => {
    this.ensureInitialized();
    return this.exportService.exportForFineTuning(filter);
  };

  exportAllData = (): Promise<ExportData> => {
    this.ensureInitialized();
    return this.exportService.exportAllData();
  };

  async importData(_data: ExportData, _options?: ImportOptions): Promise<void> {
    this.ensureInitialized();
    // TODO: Implement importData in ExportService
    throw new Error('importData not yet implemented');
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
