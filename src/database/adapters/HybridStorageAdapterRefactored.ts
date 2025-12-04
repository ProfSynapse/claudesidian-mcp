/**
 * Location: src/database/adapters/HybridStorageAdapterRefactored.ts
 *
 * Hybrid Storage Adapter (Refactored) - Thin facade composing repositories
 *
 * This is the refactored version following SOLID principles:
 * - Single Responsibility: Only orchestration and lifecycle, no business logic
 * - Open/Closed: Extensible through new repositories without modifying this class
 * - Liskov Substitution: Can be swapped with any IStorageAdapter implementation
 * - Interface Segregation: Implements only IStorageAdapter interface
 * - Dependency Inversion: Depends on repository abstractions
 *
 * Responsibilities:
 * 1. Lifecycle management (initialize, close, sync)
 * 2. Dependency injection (create and wire repositories)
 * 3. Method delegation (pure delegation to repositories)
 *
 * Business logic is in:
 * - Repositories: Data access and persistence
 * - Services: Export, import, and other cross-cutting concerns
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
  WorkspaceMetadata, SessionMetadata, StateMetadata, StateData,
  ConversationMetadata, MessageData, MemoryTraceData,
  ExportFilter, ExportData, SyncResult
} from '../../types/storage/HybridStorageTypes';
import { RepositoryDependencies } from '../repositories/base/BaseRepository';

// Import repositories
import { ConversationRepository } from '../repositories/ConversationRepository';
import { MessageRepository } from '../repositories/MessageRepository';
// NOTE: Workspace/Session/State/Trace repositories will be imported once created
// import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
// import { SessionRepository } from '../repositories/SessionRepository';
// import { StateRepository } from '../repositories/StateRepository';
// import { TraceRepository } from '../repositories/TraceRepository';

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
  /** Query cache TTL in ms (default: 60000) */
  cacheTTL?: number;
  /** Query cache max size (default: 500) */
  cacheMaxSize?: number;
}

/**
 * Hybrid Storage Adapter (Refactored)
 *
 * Thin facade that composes repositories and handles lifecycle.
 * Reduced from 1,666 lines to ~300 lines by delegating to repositories.
 *
 * @example
 * ```typescript
 * const adapter = new HybridStorageAdapter({
 *   app: obsidianApp,
 *   basePath: '.nexus'
 * });
 *
 * await adapter.initialize();
 *
 * // All operations delegate to repositories
 * const conversations = await adapter.getConversations({ pageSize: 25 });
 * const messages = await adapter.getMessages(conversationId, { pageSize: 50 });
 *
 * await adapter.close();
 * ```
 */
export class HybridStorageAdapter implements IStorageAdapter {
  private app: App;
  private basePath: string;
  private initialized = false;

  // Infrastructure (owned by adapter)
  private jsonlWriter: JSONLWriter;
  private sqliteCache: SQLiteCacheManager;
  private syncCoordinator: SyncCoordinator;
  private queryCache: QueryCache;

  // Repositories (composed, not inherited)
  // private workspaceRepo: WorkspaceRepository;
  // private sessionRepo: SessionRepository;
  // private stateRepo: StateRepository;
  // private traceRepo: TraceRepository;
  private conversationRepo: ConversationRepository;
  private messageRepo: MessageRepository;

  // Services
  private exportService: ExportService;

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

    // Initialize repositories
    // TODO: Initialize workspace-related repositories when created
    // this.workspaceRepo = new WorkspaceRepository(deps);
    // this.sessionRepo = new SessionRepository(deps);
    // this.stateRepo = new StateRepository(deps);
    // this.traceRepo = new TraceRepository(deps);
    this.conversationRepo = new ConversationRepository(deps);
    this.messageRepo = new MessageRepository(deps);

    // Initialize services
    this.exportService = new ExportService({
      app: this.app,
      conversationRepo: this.conversationRepo,
      messageRepo: this.messageRepo
      // TODO: Add workspace repos when available
      // workspaceRepo: this.workspaceRepo,
      // sessionRepo: this.sessionRepo,
      // stateRepo: this.stateRepo,
      // traceRepo: this.traceRepo
    });
  }

  // ============================================================================
  // Lifecycle - adapter's own responsibility
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('[HybridStorageAdapter] Already initialized');
      return;
    }

    console.log('[HybridStorageAdapter] Initializing...');

    try {
      // 1. Initialize SQLite cache
      await this.sqliteCache.initialize();

      // 2. Ensure JSONL directories exist
      await this.jsonlWriter.ensureDirectory('workspaces');
      await this.jsonlWriter.ensureDirectory('conversations');

      // 3. Perform initial sync
      const syncState = await this.sqliteCache.getSyncState(this.jsonlWriter.getDeviceId());
      if (!syncState) {
        console.log('[HybridStorageAdapter] No sync state found, rebuilding cache...');
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

    console.log('[HybridStorageAdapter] Closing...');

    try {
      this.queryCache.clear();
      await this.sqliteCache.close();
      this.initialized = false;
      console.log('[HybridStorageAdapter] Closed successfully');

    } catch (error) {
      console.error('[HybridStorageAdapter] Error during close:', error);
      throw error;
    }
  }

  async sync(): Promise<SyncResult> {
    console.log('[HybridStorageAdapter] Starting sync...');

    try {
      const result = await this.syncCoordinator.sync();
      this.queryCache.clear();
      console.log('[HybridStorageAdapter] Sync complete:', result);
      return result;

    } catch (error) {
      console.error('[HybridStorageAdapter] Sync failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // Workspace Operations - TODO: Delegate to WorkspaceRepository when created
  // ============================================================================

  async getWorkspace(id: string): Promise<WorkspaceMetadata | null> {
    this.ensureInitialized();
    throw new Error('WorkspaceRepository not yet implemented');
    // return this.workspaceRepo.getById(id);
  }

  async getWorkspaces(options?: QueryOptions): Promise<PaginatedResult<WorkspaceMetadata>> {
    this.ensureInitialized();
    throw new Error('WorkspaceRepository not yet implemented');
    // return this.workspaceRepo.getWorkspaces(options);
  }

  async createWorkspace(data: Omit<WorkspaceMetadata, 'id'>): Promise<string> {
    this.ensureInitialized();
    throw new Error('WorkspaceRepository not yet implemented');
    // return this.workspaceRepo.create(data);
  }

  async updateWorkspace(id: string, data: Partial<WorkspaceMetadata>): Promise<void> {
    this.ensureInitialized();
    throw new Error('WorkspaceRepository not yet implemented');
    // return this.workspaceRepo.update(id, data);
  }

  async deleteWorkspace(id: string): Promise<void> {
    this.ensureInitialized();
    throw new Error('WorkspaceRepository not yet implemented');
    // return this.workspaceRepo.delete(id);
  }

  async searchWorkspaces(query: string): Promise<WorkspaceMetadata[]> {
    this.ensureInitialized();
    throw new Error('WorkspaceRepository not yet implemented');
    // return this.workspaceRepo.search(query);
  }

  // ============================================================================
  // Session Operations - TODO: Delegate to SessionRepository when created
  // ============================================================================

  async getSession(id: string): Promise<SessionMetadata | null> {
    this.ensureInitialized();
    throw new Error('SessionRepository not yet implemented');
    // return this.sessionRepo.getById(id);
  }

  async getSessions(workspaceId: string, options?: PaginationParams): Promise<PaginatedResult<SessionMetadata>> {
    this.ensureInitialized();
    throw new Error('SessionRepository not yet implemented');
    // return this.sessionRepo.getByWorkspaceId(workspaceId, options);
  }

  async createSession(workspaceId: string, data: Omit<SessionMetadata, 'id' | 'workspaceId'>): Promise<string> {
    this.ensureInitialized();
    throw new Error('SessionRepository not yet implemented');
    // return this.sessionRepo.createForWorkspace(workspaceId, data);
  }

  async updateSession(workspaceId: string, sessionId: string, data: Partial<SessionMetadata>): Promise<void> {
    this.ensureInitialized();
    throw new Error('SessionRepository not yet implemented');
    // return this.sessionRepo.update(sessionId, data);
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.ensureInitialized();
    throw new Error('SessionRepository not yet implemented');
    // return this.sessionRepo.delete(sessionId);
  }

  // ============================================================================
  // State Operations - TODO: Delegate to StateRepository when created
  // ============================================================================

  async getState(id: string): Promise<StateData | null> {
    this.ensureInitialized();
    throw new Error('StateRepository not yet implemented');
    // return this.stateRepo.getStateData(id);
  }

  async getStates(workspaceId: string, sessionId?: string, options?: PaginationParams): Promise<PaginatedResult<StateMetadata>> {
    this.ensureInitialized();
    throw new Error('StateRepository not yet implemented');
    // return this.stateRepo.getStates(workspaceId, sessionId, options);
  }

  async saveState(workspaceId: string, sessionId: string, data: Omit<StateData, 'id' | 'workspaceId' | 'sessionId'>): Promise<string> {
    this.ensureInitialized();
    throw new Error('StateRepository not yet implemented');
    // return this.stateRepo.saveState(workspaceId, sessionId, data);
  }

  async deleteState(id: string): Promise<void> {
    this.ensureInitialized();
    throw new Error('StateRepository not yet implemented');
    // return this.stateRepo.delete(id);
  }

  async countStates(workspaceId: string, sessionId?: string): Promise<number> {
    this.ensureInitialized();
    throw new Error('StateRepository not yet implemented');
    // return this.stateRepo.countStates(workspaceId, sessionId);
  }

  // ============================================================================
  // Trace Operations - TODO: Delegate to TraceRepository when created
  // ============================================================================

  async getTraces(workspaceId: string, sessionId?: string, options?: PaginationParams): Promise<PaginatedResult<MemoryTraceData>> {
    this.ensureInitialized();
    throw new Error('TraceRepository not yet implemented');
    // return this.traceRepo.getTraces(workspaceId, sessionId, options);
  }

  async addTrace(workspaceId: string, sessionId: string, data: Omit<MemoryTraceData, 'id' | 'workspaceId' | 'sessionId'>): Promise<string> {
    this.ensureInitialized();
    throw new Error('TraceRepository not yet implemented');
    // return this.traceRepo.addTrace(workspaceId, sessionId, data);
  }

  async searchTraces(workspaceId: string, query: string, sessionId?: string): Promise<MemoryTraceData[]> {
    this.ensureInitialized();
    throw new Error('TraceRepository not yet implemented');
    // return this.traceRepo.searchTraces(workspaceId, query, sessionId);
  }

  // ============================================================================
  // Conversation Operations - Delegate to ConversationRepository
  // ============================================================================

  getConversation = (id: string) => {
    this.ensureInitialized();
    return this.conversationRepo.getById(id);
  };

  getConversations = (options?: QueryOptions) => {
    this.ensureInitialized();
    return this.conversationRepo.getConversations(options);
  };

  createConversation = (data: Omit<ConversationMetadata, 'id' | 'messageCount'>) => {
    this.ensureInitialized();
    return this.conversationRepo.create(data);
  };

  updateConversation = (id: string, data: Partial<ConversationMetadata>) => {
    this.ensureInitialized();
    return this.conversationRepo.update(id, data);
  };

  deleteConversation = (id: string) => {
    this.ensureInitialized();
    return this.conversationRepo.delete(id);
  };

  searchConversations = (query: string) => {
    this.ensureInitialized();
    return this.conversationRepo.search(query);
  };

  // ============================================================================
  // Message Operations - Delegate to MessageRepository
  // ============================================================================

  getMessages = (conversationId: string, options?: PaginationParams) => {
    this.ensureInitialized();
    return this.messageRepo.getMessages(conversationId, options);
  };

  addMessage = (conversationId: string, data: Omit<MessageData, 'id' | 'conversationId' | 'sequenceNumber'> & { id?: string }) => {
    this.ensureInitialized();
    return this.messageRepo.addMessage(conversationId, data);
  };

  updateMessage = (conversationId: string, messageId: string, data: Partial<MessageData>) => {
    this.ensureInitialized();
    return this.messageRepo.update(messageId, data);
  };

  deleteMessage = (conversationId: string, messageId: string) => {
    this.ensureInitialized();
    return this.messageRepo.deleteMessage(conversationId, messageId);
  };

  // ============================================================================
  // Export/Import Operations - Delegate to ExportService
  // ============================================================================

  exportConversationsForFineTuning = (filter?: ExportFilter) => {
    this.ensureInitialized();
    return this.exportService.exportForFineTuning(filter);
  };

  exportAllData = () => {
    this.ensureInitialized();
    return this.exportService.exportAllData();
  };

  async importData(data: ExportData, options?: ImportOptions): Promise<void> {
    this.ensureInitialized();
    // TODO: Implement import service
    throw new Error('Import not yet implemented');
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
