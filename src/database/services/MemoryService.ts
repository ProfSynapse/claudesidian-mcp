/**
 * MemoryService - Refactored using SOLID principles and service composition
 * Acts as a coordinator/facade for memory-related operations
 */

import { Plugin } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';
import { MemoryTraceCollection } from '../collections/MemoryTraceCollection';
import { SessionCollection } from '../collections/SessionCollection';
import { SnapshotCollection } from '../collections/SnapshotCollection';
import { WorkspaceMemoryTrace, WorkspaceSession, WorkspaceStateSnapshot } from '../workspace-types';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { EmbeddingService } from './EmbeddingService';

import {
  MemoryTraceService,
  SessionService,
  SnapshotService
} from './memory';
import { CollectionManager } from '../providers/chroma/services/CollectionManager';
import { DirectoryService } from '../providers/chroma/services/DirectoryService';
import { ObsidianPathManager } from '../../core/ObsidianPathManager';

/**
 * Refactored MemoryService using composition pattern.
 * Maintains the same public interface while delegating to specialized services.
 * 
 * @remarks
 * This service now follows SOLID principles:
 * - SRP: Each composed service has a single responsibility
 * - OCP: New memory storage types can be added by extending services
 * - DIP: Uses dependency injection and composition
 */
export class MemoryService {
  // Composed services following Dependency Injection principle
  private memoryTraceService: MemoryTraceService;
  private sessionService: SessionService;
  private snapshotService: SnapshotService;
  private collectionManager: CollectionManager;

  /**
   * Legacy collection references for backward compatibility
   */
  private memoryTraces: MemoryTraceCollection;
  private sessions: SessionCollection;
  private snapshots: SnapshotCollection;

  /**
   * Plugin instance
   */
  private plugin: Plugin;

  /**
   * Vector store instance used by this service
   */
  private readonly vectorStore: IVectorStore;

  /**
   * Embedding service for generating embeddings
   */
  private embeddingService: EmbeddingService;

  /**
   * Plugin settings
   */
  private settings: any;

  /**
   * Create a new memory service
   * @param plugin Plugin instance
   * @param vectorStore Vector store instance
   * @param embeddingService Embedding service
   * @param settings Plugin settings
   */
  constructor(plugin: Plugin, vectorStore: IVectorStore, embeddingService: EmbeddingService, settings: any) {
    this.plugin = plugin;
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    this.settings = settings;

    // Initialize collection manager with proper dependencies
    const directoryService = new DirectoryService(this.plugin);
    // Extract ChromaClient from vectorStore - assuming ChromaVectorStore has client property
    const chromaClient = (vectorStore as any).client;
    if (!chromaClient) {
      throw new Error('ChromaClient not available in the provided vector store');
    }
    
    // Get persistence path from ChromaClient if available
    const persistentPath = (chromaClient as any).persistentPath || null;
    
    this.collectionManager = new CollectionManager(chromaClient, directoryService, persistentPath);
    
    // CRITICAL FIX: Inject ObsidianPathManager to prevent path duplication
    const pathManager = new ObsidianPathManager(this.plugin.app.vault, this.plugin.manifest);
    this.collectionManager.setPathManager(pathManager);

    // Create specialized collections
    this.memoryTraces = VectorStoreFactory.createMemoryTraceCollection(vectorStore);
    this.sessions = VectorStoreFactory.createSessionCollection(vectorStore, embeddingService);
    this.snapshots = VectorStoreFactory.createSnapshotCollection(vectorStore, embeddingService);

    // Initialize services with collections
    this.memoryTraceService = new MemoryTraceService(
      this.memoryTraces,
      embeddingService
    );

    this.sessionService = new SessionService(
      plugin,
      this.sessions
    );

    this.snapshotService = new SnapshotService(
      plugin,
      this.snapshots
    );

    // Set up cross-service dependencies to avoid circular imports
    this.memoryTraceService.setSessionService(this.sessionService);
    this.sessionService.setMemoryTraceService(this.memoryTraceService);
    this.sessionService.setSnapshotService(this.snapshotService);
    this.snapshotService.setMemoryTraceService(this.memoryTraceService);

    this.initializeServices();
  }

  /**
   * Initialize services based on current settings
   */
  private async initializeServices(): Promise<void> {
    try {
      // Initialize the collection manager
      await this.collectionManager.refreshCollections();

      // Initialize each collection separately to better handle individual failures
      await this.memoryTraces.initialize().catch(error => {
        console.warn(`Failed to initialize memory traces collection: ${error.message}`);
      });

      await this.sessions.initialize().catch(error => {
        console.warn(`Failed to initialize sessions collection: ${error.message}`);
      });

      await this.snapshots.initialize().catch(error => {
        console.warn(`Failed to initialize snapshots collection: ${error.message}`);
      });

    } catch (error) {
      console.error("Failed to initialize MemoryService collections:", error);
      // Don't throw the error - let the plugin continue loading
    }
  }

  /**
   * Initialize the memory service
   */
  async initialize(): Promise<void> {
    await this.initializeServices();
  }


  //#region ChromaDB Collection Management (delegated to CollectionManager)

  /**
   * Get the raw ChromaDB collection manager
   * @returns CollectionManager instance
   */
  getCollectionManager() {
    return this.collectionManager;
  }

  /**
   * Get the vector store instance
   * @returns The vector store used by this service
   */
  getVectorStore(): IVectorStore {
    return this.vectorStore;
  }

  /**
   * Create a new collection in ChromaDB
   * @param name Collection name
   * @param metadata Optional collection metadata
   * @returns The created collection
   */
  async createCollection(name: string, metadata?: Record<string, any>): Promise<any> {
    await this.collectionManager.createCollection(name, metadata);
    return await this.collectionManager.getOrCreateCollection(name);
  }

  /**
   * Get a collection from ChromaDB
   * @param name Collection name
   * @returns The collection or null if not found
   */
  async getCollection(name: string): Promise<any> {
    const hasCollection = await this.collectionManager.hasCollection(name);
    if (!hasCollection) {
      return null;
    }
    return await this.collectionManager.getOrCreateCollection(name);
  }

  /**
   * Get or create a collection in ChromaDB
   * @param name Collection name
   * @param metadata Optional collection metadata
   * @returns The collection
   */
  async getOrCreateCollection(name: string, metadata?: Record<string, any>): Promise<any> {
    const hasCollection = await this.collectionManager.hasCollection(name);
    if (!hasCollection && metadata) {
      await this.collectionManager.createCollection(name, metadata);
    }
    return await this.collectionManager.getOrCreateCollection(name);
  }

  /**
   * Check if a collection exists in ChromaDB
   * @param name Collection name
   * @returns Whether the collection exists
   */
  async hasCollection(name: string): Promise<boolean> {
    return this.collectionManager.hasCollection(name);
  }

  /**
   * List all collections in ChromaDB
   * @returns Array of collection names
   */
  async listCollections(): Promise<string[]> {
    return this.collectionManager.listCollections();
  }

  /**
   * Get detailed information about all collections
   * @returns Array of collection details
   */
  async getCollectionDetails(): Promise<Array<{ name: string; metadata?: Record<string, any> }>> {
    const collections = await this.collectionManager.listCollections();
    const details = [];
    for (const name of collections) {
      try {
        const collection = await this.collectionManager.getOrCreateCollection(name);
        const metadata = collection.metadata || {};
        details.push({ name, metadata });
      } catch (error) {
        console.warn(`Failed to get details for collection ${name}:`, error);
        details.push({ name });
      }
    }
    return details;
  }

  /**
   * Delete a collection from ChromaDB
   * @param name Collection name
   */
  async deleteCollection(name: string): Promise<void> {
    return this.collectionManager.deleteCollection(name);
  }

  /**
   * Add items to a collection in ChromaDB
   * @param name Collection name
   * @param items Items to add
   */
  async addItems(name: string, items: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    const collection = await this.collectionManager.getOrCreateCollection(name);
    await collection.add(items);
  }

  /**
   * Query a collection in ChromaDB
   * @param name Collection name
   * @param queryEmbedding Query embedding
   * @param options Query options
   */
  async query(name: string, queryEmbedding: number[], options?: {
    nResults?: number;
    where?: Record<string, any>;
    include?: string[];
  }) {
    const collection = await this.collectionManager.getOrCreateCollection(name);
    return await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: options?.nResults || 10,
      where: options?.where,
      include: (options?.include as any) || ['embeddings', 'metadatas', 'documents', 'distances']
    });
  }

  /**
   * Get items from a collection in ChromaDB
   * @param name Collection name
   * @param ids IDs of items to get
   * @param include What to include in the response
   */
  async getItems(name: string, ids: string[], include?: string[]): Promise<any> {
    const collection = await this.collectionManager.getOrCreateCollection(name);
    return await collection.get({
      ids,
      include: (include as any) || ['embeddings', 'metadatas', 'documents']
    });
  }

  /**
   * Update items in a collection in ChromaDB
   * @param name Collection name
   * @param items Items to update
   */
  async updateItems(name: string, items: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    const collection = await this.collectionManager.getOrCreateCollection(name);
    await collection.update(items);
  }

  /**
   * Delete items from a collection in ChromaDB
   * @param name Collection name
   * @param ids IDs of items to delete
   */
  async deleteItems(name: string, ids: string[]): Promise<void> {
    const collection = await this.collectionManager.getOrCreateCollection(name);
    await collection.delete({ ids });
  }

  /**
   * Get the number of items in a collection
   * @param name Collection name
   * @returns Number of items
   */
  async countItems(name: string): Promise<number> {
    const collection = await this.collectionManager.getOrCreateCollection(name);
    return await collection.count();
  }

  //#endregion

  //#region Memory Traces (delegated to MemoryTraceService)

  /**
   * Store a memory trace
   * @param trace Memory trace data
   */
  async storeMemoryTrace(trace: Omit<WorkspaceMemoryTrace, 'id' | 'embedding'>): Promise<string> {
    return this.memoryTraceService.storeMemoryTrace(trace);
  }

  /**
   * Get memory traces for a workspace
   * @param workspaceId Workspace ID
   * @param limit Maximum number of traces to return
   */
  async getMemoryTraces(workspaceId: string, limit?: number): Promise<WorkspaceMemoryTrace[]> {
    return this.memoryTraceService.getMemoryTraces(workspaceId, limit);
  }

  /**
   * Search memory traces by similarity
   * @param query Query text
   * @param options Search options
   */
  async searchMemoryTraces(query: string, options?: {
    workspaceId?: string;
    workspacePath?: string[];
    limit?: number;
    sessionId?: string;
  }) {
    return this.memoryTraceService.searchMemoryTraces(query, options);
  }

  /**
   * Search memory traces by embedding
   * @param embedding Query embedding
   * @param options Search options
   */
  async searchMemoryTracesByEmbedding(embedding: number[], options?: {
    workspaceId?: string;
    workspacePath?: string[];
    limit?: number;
    sessionId?: string;
  }) {
    return this.memoryTraceService.searchMemoryTracesByEmbedding(embedding, options);
  }

  /**
   * Get memory traces for a specific session
   * @param sessionId Session ID
   * @param limit Maximum number of traces to return
   */
  async getSessionTraces(sessionId: string, limit?: number): Promise<WorkspaceMemoryTrace[]> {
    return this.memoryTraceService.getSessionTraces(sessionId, limit);
  }

  /**
   * Delete memory traces by session ID
   * @param sessionId Session ID
   * @returns Number of traces deleted
   */
  async deleteMemoryTracesBySession(sessionId: string): Promise<number> {
    return this.memoryTraceService.deleteMemoryTracesBySession(sessionId);
  }

  /**
   * Record activity trace - activity recording method
   * @param workspaceId Workspace ID
   * @param traceData Trace data
   */
  async recordActivityTrace(workspaceId: string, traceData: {
    type: 'project_plan' | 'question' | 'checkpoint' | 'completion' | 'research';
    content: string;
    metadata: {
      tool: string;
      params: any;
      result: any;
      relatedFiles: string[];
    };
    sessionId?: string;
  }): Promise<string> {
    return this.memoryTraceService.recordActivityTrace(workspaceId, traceData);
  }

  //#endregion

  //#region Sessions (delegated to SessionService)

  /**
   * Create a new session
   * @param session Session data
   */
  async createSession(session: Omit<WorkspaceSession, 'id'>): Promise<WorkspaceSession> {
    return this.sessionService.createSession(session);
  }

  /**
   * Update an existing session
   * @param id Session ID
   * @param updates Partial session data to update
   */
  async updateSession(id: string, updates: Partial<WorkspaceSession>): Promise<void> {
    return this.sessionService.updateSession(id, updates);
  }

  /**
   * Get a session by ID, auto-creating it if it doesn't exist
   * @param id Session ID
   * @param autoCreate Whether to auto-create the session if it doesn't exist
   * @returns The session, either existing or newly created
   */
  async getSession(id: string, autoCreate = true): Promise<WorkspaceSession | undefined> {
    return this.sessionService.getSession(id, autoCreate);
  }

  /**
   * Get sessions for a workspace
   * @param workspaceId Workspace ID
   * @param activeOnly Whether to only return active sessions
   */
  async getSessions(workspaceId: string, activeOnly?: boolean): Promise<WorkspaceSession[]> {
    return this.sessionService.getSessions(workspaceId, activeOnly);
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<WorkspaceSession[]> {
    return this.sessionService.getActiveSessions();
  }

  /**
   * End an active session
   * @param id Session ID
   * @param summary Optional session summary
   */
  async endSession(id: string, summary?: string): Promise<void> {
    return this.sessionService.endSession(id, summary);
  }

  /**
   * Get all sessions (optionally filtered by active status)
   * @param activeOnly Whether to only return active sessions
   * @returns Array of sessions
   */
  async getAllSessions(activeOnly = false): Promise<WorkspaceSession[]> {
    return this.sessionService.getAllSessions(activeOnly);
  }

  /**
   * Delete a session and optionally its associated data
   * @param sessionId Session ID
   * @param options Deletion options
   * @returns Number of items deleted
   */
  async deleteSession(sessionId: string, options?: {
    deleteMemoryTraces?: boolean;
    deleteSnapshots?: boolean;
  }) {
    return this.sessionService.deleteSession(sessionId, options);
  }

  //#endregion

  //#region Snapshots (delegated to SnapshotService)

  /**
   * Create a workspace state snapshot
   * @param snapshot Snapshot data
   */
  async createSnapshot(snapshot: Omit<WorkspaceStateSnapshot, 'id'>): Promise<WorkspaceStateSnapshot> {
    return this.snapshotService.createSnapshot(snapshot);
  }

  /**
   * Get a snapshot by ID
   * @param id Snapshot ID
   */
  async getSnapshot(id: string): Promise<WorkspaceStateSnapshot | undefined> {
    return this.snapshotService.getSnapshot(id);
  }

  /**
   * Get snapshots for a workspace or session
   * @param workspaceId Optional workspace ID filter
   * @param sessionId Optional session ID filter
   * @returns Array of workspace state snapshots
   */
  async getSnapshots(workspaceId?: string, sessionId?: string): Promise<WorkspaceStateSnapshot[]> {
    return this.snapshotService.getSnapshots(workspaceId, sessionId);
  }

  /**
   * Get snapshots for a specific session
   * @param sessionId Session ID
   * @returns Array of workspace state snapshots
   */
  async getSnapshotsBySession(sessionId: string): Promise<WorkspaceStateSnapshot[]> {
    return this.snapshotService.getSnapshotsBySession(sessionId);
  }

  /**
   * Delete a snapshot
   * @param id Snapshot ID
   */
  async deleteSnapshot(id: string): Promise<void> {
    return this.snapshotService.deleteSnapshot(id);
  }

  /**
   * Update an existing snapshot
   * @param id Snapshot ID
   * @param updates Updates to apply
   */
  async updateSnapshot(id: string, updates: Partial<WorkspaceStateSnapshot>): Promise<void> {
    return this.snapshotService.updateSnapshot(id, updates);
  }

  /**
   * Create a context state snapshot
   * @param workspaceId Workspace ID
   * @param sessionId Session ID
   * @param name Snapshot name
   * @param description Optional snapshot description
   * @param context Optional context data
   */
  async createContextSnapshot(
    workspaceId: string,
    sessionId: string,
    name: string,
    description?: string,
    context?: {
      workspace?: any;
      recentTraces?: string[];
      contextFiles?: string[];
      metadata?: Record<string, any>;
    }
  ): Promise<string> {
    return this.snapshotService.createContextSnapshot(workspaceId, sessionId, name, description, context);
  }

  /**
   * Restore a state snapshot to the current context
   * @param stateId ID of the state to restore
   * @returns Information about the restored state
   */
  async restoreStateSnapshot(stateId: string) {
    return this.snapshotService.restoreStateSnapshot(stateId);
  }

  //#endregion
}