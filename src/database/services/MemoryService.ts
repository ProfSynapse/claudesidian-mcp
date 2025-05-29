import { Plugin } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';
import { ICollectionService, CollectionMetadata, CollectionItems } from '../interfaces/ICollectionService';
import { CollectionService } from './CollectionService';
import { MemoryTraceCollection } from '../collections/MemoryTraceCollection';
import { SessionCollection } from '../collections/SessionCollection';
import { SnapshotCollection } from '../collections/SnapshotCollection';
import { WorkspaceMemoryTrace, WorkspaceSession, WorkspaceStateSnapshot } from '../workspace-types';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { EmbeddingService } from './EmbeddingService';
import { ChromaCollectionManager } from '../providers/chroma/ChromaCollectionManager';
import { getErrorMessage, handleOperationError } from '../../utils/errorUtils';
import { generateSessionId, createDefaultSessionData } from '../../utils/sessionUtils';
import { safeInitialize } from '../../utils/serviceUtils';
import { getOrCreateDefaultWorkspace } from '../../utils/workspaceUtils';
import { MemorySettings } from '../../types';

/**
 * Service for managing memory traces, sessions, snapshots, and ChromaDB collections
 */
export class MemoryService {
  /**
   * Vector store instance used by this service
   */
  private readonly vectorStore: IVectorStore;
  
  /**
   * Collections for memory-related data
   */
  private memoryTraces: MemoryTraceCollection;
  private sessions: SessionCollection;
  private snapshots: SnapshotCollection;
  
  /**
   * ChromaDB collection manager
   */
  private collectionManager: ChromaCollectionManager;
  
  /**
   * Collection service for generic collection operations
   */
  private collectionService: ICollectionService;
  
  /**
   * Plugin instance
   */
  private plugin: Plugin;
  
  /**
   * Embedding service for generating embeddings
   */
  private embeddingService: EmbeddingService;
  
  /**
   * Create a new memory service
   * @param plugin Plugin instance
   * @param vectorStore Vector store instance
   * @param embeddingService Embedding service
   */
  constructor(plugin: Plugin, vectorStore: IVectorStore, embeddingService: EmbeddingService) {
    this.plugin = plugin;
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    
    // Create collection manager for direct ChromaDB access
    this.collectionManager = new ChromaCollectionManager(vectorStore);
    
    // Create collection service for generic collection operations
    this.collectionService = new CollectionService(vectorStore, (plugin as any).eventManager);
    
    // Create specialized collections
    this.memoryTraces = VectorStoreFactory.createMemoryTraceCollection(vectorStore);
    this.sessions = VectorStoreFactory.createSessionCollection(vectorStore);
    this.snapshots = VectorStoreFactory.createSnapshotCollection(vectorStore);
  }
    /**
   * Initialize the memory service
   */
  async initialize(): Promise<void> {
    try {
      // Initialize each collection with proper error handling
      await safeInitialize(this.collectionService, "collection service");
      await safeInitialize(this.collectionManager, "collection manager");
      await safeInitialize(this.memoryTraces, "memory traces collection");
      await safeInitialize(this.sessions, "sessions collection");
      await safeInitialize(this.snapshots, "snapshots collection");
      
      console.log("Memory service collections initialized");
    } catch (error) {
      console.error("Failed to initialize MemoryService collections:", error);
      // Don't throw the error - let the plugin continue loading
    }
  }
    //#region ChromaDB Collection Management - Delegated to ChromaCollectionManager
  
  /**
   * Get the raw ChromaDB collection manager for direct collection operations
   * @returns ChromaCollectionManager instance
   */
  getCollectionManager(): ChromaCollectionManager {
    return this.collectionManager;
  }
  
  /**
   * Get the vector store instance
   * @returns The vector store used by this service
   */
  getVectorStore(): IVectorStore {
    return this.vectorStore;
  }
  
  //#endregion
  
  //#region Generic Collection Operations - Delegated to CollectionService
  
  /**
   * Check if a collection exists
   * @param name Collection name
   * @returns True if collection exists
   */
  async hasCollection(name: string): Promise<boolean> {
    return await this.collectionService.hasCollection(name);
  }

  /**
   * Create a new collection
   * @param name Collection name
   * @param metadata Optional metadata
   * @returns Created collection reference
   */
  async createCollection(name: string, metadata?: CollectionMetadata): Promise<any> {
    return await this.collectionService.createCollection(name, metadata);
  }

  /**
   * Delete a collection
   * @param name Collection name
   */
  async deleteCollection(name: string): Promise<void> {
    return await this.collectionService.deleteCollection(name);
  }

  /**
   * List all collections
   * @returns Array of collection names
   */
  async listCollections(): Promise<string[]> {
    return await this.collectionService.listCollections();
  }

  /**
   * Get a collection by name
   * @param name Collection name
   * @returns Collection reference
   */
  async getCollection(name: string): Promise<any> {
    return await this.collectionService.getCollection(name);
  }

  /**
   * Count items in a collection
   * @param name Collection name
   * @returns Number of items
   */
  async countItems(name: string): Promise<number> {
    return await this.collectionService.countItems(name);
  }

  /**
   * Add items to a collection
   * @param name Collection name
   * @param items Items to add
   */
  async addItems(name: string, items: CollectionItems): Promise<void> {
    return await this.collectionService.addItems(name, items);
  }

  /**
   * Delete items from a collection
   * @param name Collection name
   * @param ids Item IDs to delete
   */
  async deleteItems(name: string, ids: string[]): Promise<void> {
    return await this.collectionService.deleteItems(name, ids);
  }

  //#endregion
  
  //#region Memory Traces
  
  /**
   * Store a memory trace
   * @param trace Memory trace data
   */
  async storeMemoryTrace(trace: Omit<WorkspaceMemoryTrace, 'id' | 'embedding'>): Promise<string> {
    // Check memory trace size limit before adding new trace
    await this.checkAndPruneMemoryTraces();
    
    // Only generate embeddings for memory traces if explicitly needed
    // Skip embeddings for automated file event traces to prevent excessive API usage
    let embedding: number[] = [];
    
    // Check if this is an automated file event trace
    const isFileEventTrace = trace.metadata?.tool === 'FileEventManager';
    
    // Only generate embeddings if:
    // 1. Embeddings are enabled globally
    // 2. This is not a file event trace OR it's an important file event (importance >= 0.8)
    if (this.embeddingService.areEmbeddingsEnabled() && 
        (!isFileEventTrace || trace.importance >= 0.8)) {
      embedding = await this.embeddingService.getEmbedding(trace.content) || [];
    }
    
    // Create the trace with embedding
    const newTrace = await this.memoryTraces.createMemoryTrace({
      ...trace,
      embedding
    });
    
    // Increment tool calls for the session if provided
    if (trace.sessionId) {
      await this.sessions.incrementToolCalls(trace.sessionId);
    }
    
    return newTrace.id;
  }
  
  /**
   * Get memory traces for a workspace
   * @param workspaceId Workspace ID
   * @param limit Maximum number of traces to return
   */
  async getMemoryTraces(workspaceId: string, limit?: number): Promise<WorkspaceMemoryTrace[]> {
    return this.memoryTraces.getTracesByWorkspace(workspaceId, limit);
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
    threshold?: number;
    sessionId?: string;
  }): Promise<Array<{
    trace: WorkspaceMemoryTrace;
    similarity: number;
  }>> {
    // Generate embedding for the query
    const embedding = await this.embeddingService.getEmbedding(query);
    
    if (!embedding) {
      return [];
    }
    
    // Search traces by similarity
    return this.memoryTraces.searchTraces(embedding, options);
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
    threshold?: number;
    sessionId?: string;
  }): Promise<Array<{
    trace: WorkspaceMemoryTrace;
    similarity: number;
  }>> {
    return this.memoryTraces.searchTraces(embedding, options);
  }
  
  //#endregion
  
  //#region Sessions
  
  /**
   * Create a new session
   * @param session Session data
   */
  async createSession(session: Omit<WorkspaceSession, 'id'>): Promise<WorkspaceSession> {
    return this.sessions.createSession(session);
  }
  
  /**
   * Update an existing session
   * @param id Session ID
   * @param updates Partial session data to update
   */
  async updateSession(id: string, updates: Partial<WorkspaceSession>): Promise<void> {
    await this.sessions.update(id, updates);
  }
    /**
   * Get workspace service from plugin
   * @returns WorkspaceService instance or undefined if not available
   */
  private getWorkspaceService() {
    const plugin = this.plugin as any;
    return plugin.services?.workspaceService;
  }

  /**
   * Get a session by ID, auto-creating it if it doesn't exist
   * @param id Session ID
   * @param autoCreate Whether to auto-create the session if it doesn't exist
   * @returns The session, either existing or newly created
   */
  async getSession(id: string, autoCreate: boolean = true): Promise<WorkspaceSession | undefined> {
    try {
      // Try to get the existing session
      const session = await this.sessions.get(id);
      
      // If session exists, return it
      if (session) {
        return session;
      }
      
      // If auto-create is disabled or no ID was provided, return undefined
      if (!autoCreate || !id) {
        return undefined;
      }
      
      console.log(`Auto-creating session with ID: ${id}`);
      
      // Get workspace ID using the utility function
      let workspaceId: string;
      const workspaceService = this.getWorkspaceService();
      
      if (workspaceService) {
        workspaceId = await getOrCreateDefaultWorkspace(workspaceService);
      } else {
        // No workspace service, use a default ID
        workspaceId = 'default-workspace';
      }
        // Create a session object
      const sessionData = createDefaultSessionData(workspaceId, id);
      
      // The createSession method will handle the id correctly
      const newSession = await this.sessions.createSession(sessionData);
      
      return newSession;
    } catch (error) {
      console.error(`Error in getSession: ${getErrorMessage(error)}`);
      return undefined;
    }
  }
  
  /**
   * Get sessions for a workspace
   * @param workspaceId Workspace ID
   * @param activeOnly Whether to only return active sessions
   */
  async getSessions(workspaceId: string, activeOnly?: boolean): Promise<WorkspaceSession[]> {
    return this.sessions.getSessionsByWorkspace(workspaceId, activeOnly);
  }
  
  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<WorkspaceSession[]> {
    return this.sessions.getActiveSessions();
  }
  
  /**
   * End an active session
   * @param id Session ID
   * @param summary Optional session summary
   */
  async endSession(id: string, summary?: string): Promise<void> {
    await this.sessions.endSession(id, summary);
  }
  
  /**
   * Get all sessions (optionally filtered by active status)
   * @param activeOnly Whether to only return active sessions
   * @returns Array of sessions
   */
  async getAllSessions(activeOnly: boolean = false): Promise<WorkspaceSession[]> {
    if (activeOnly) {
      return this.sessions.getActiveSessions();
    }
    
    // Get all sessions without filtering
    return this.sessions.getAll({});
  }
  
  /**
   * Get memory traces for a specific session
   * @param sessionId Session ID
   * @param limit Maximum number of traces to return
   */
  async getSessionTraces(sessionId: string, limit?: number): Promise<WorkspaceMemoryTrace[]> {
    return this.memoryTraces.getTracesBySession(sessionId, limit);
  }
    /**
   * Delete memory traces by session ID
   * @param sessionId Session ID
   * @returns Number of traces deleted
   */
  async deleteMemoryTracesBySession(sessionId: string): Promise<number> {
    try {
      // Get all traces for this session
      const traces = await this.memoryTraces.getTracesBySession(sessionId);
      
      // Delete each trace
      const deletePromises = traces.map(trace => this.memoryTraces.delete(trace.id));
      await Promise.all(deletePromises);
      
      return traces.length;
    } catch (error) {
      handleOperationError('delete memory traces for session', sessionId, error);
    }
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
  }): Promise<{
    session: boolean;
    tracesDeleted: number;
    snapshotsDeleted: number;
  }> {
    try {
      // Get the session to verify it exists
      const session = await this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session with ID ${sessionId} not found`);
      }

      // Track deletion stats
      let tracesDeleted = 0;
      let snapshotsDeleted = 0;

      // If requested, delete associated memory traces
      if (options?.deleteMemoryTraces) {
        tracesDeleted = await this.deleteMemoryTracesBySession(sessionId);
      }

      // If requested, delete associated snapshots
      if (options?.deleteSnapshots) {
        // Get snapshots for this session
        const snapshots = await this.snapshots.getSnapshotsBySession(sessionId);
        
        // Delete each snapshot
        const deletePromises = snapshots.map(snapshot => this.snapshots.delete(snapshot.id));
        await Promise.all(deletePromises);
        
        snapshotsDeleted = snapshots.length;
      }

      // Delete the session itself
      await this.sessions.delete(sessionId);

      return {
        session: true,
        tracesDeleted,
        snapshotsDeleted
      };
    } catch (error) {
      console.error(`Failed to delete session ${sessionId}:`, error);
      throw new Error(`Failed to delete session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  //#endregion
  
  //#region Snapshots
  
  /**
   * Create a workspace state snapshot
   * @param snapshot Snapshot data
   */
  async createSnapshot(snapshot: Omit<WorkspaceStateSnapshot, 'id'>): Promise<WorkspaceStateSnapshot> {
    return this.snapshots.createSnapshot(snapshot);
  }
  
  /**
   * Get a snapshot by ID
   * @param id Snapshot ID
   */
  async getSnapshot(id: string): Promise<WorkspaceStateSnapshot | undefined> {
    return this.snapshots.get(id);
  }
  
  /**
   * Get snapshots for a workspace or session
   * @param workspaceId Optional workspace ID filter
   * @param sessionId Optional session ID filter
   * @returns Array of workspace state snapshots
   */
  async getSnapshots(workspaceId?: string, sessionId?: string): Promise<WorkspaceStateSnapshot[]> {
    try {
      if (sessionId) {
        // If sessionId is provided, prioritize that
        const sessionSnapshots = await this.snapshots.getSnapshotsBySession(sessionId);
        
        // If workspaceId is also provided, filter the results
        if (workspaceId) {
          return sessionSnapshots.filter(snapshot => snapshot.workspaceId === workspaceId);
        }
        
        return sessionSnapshots;
      } else if (workspaceId) {
        // If only workspaceId is provided, use the existing method
        return this.snapshots.getSnapshotsByWorkspace(workspaceId);
      } else {
        // If neither is provided, return all snapshots (with reasonable limits)
        return this.snapshots.getAll({ 
          sortBy: 'timestamp',
          sortOrder: 'desc',
          limit: 100 
        });
      }
    } catch (error) {
      console.error('Error retrieving snapshots:', error);
      // Return empty array instead of throwing to avoid breaking UI
      return [];
    }
  }

  /**
   * Get snapshots for a specific session
   * @param sessionId Session ID
   * @returns Array of workspace state snapshots
   */
  async getSnapshotsBySession(sessionId: string): Promise<WorkspaceStateSnapshot[]> {
    try {
      return this.snapshots.getSnapshotsBySession(sessionId);
    } catch (error) {
      console.error(`Error retrieving snapshots for session ${sessionId}:`, error);
      // Return empty array instead of throwing to avoid breaking UI
      return [];
    }
  }
  
  /**
   * Delete a snapshot
   * @param id Snapshot ID
   */
  async deleteSnapshot(id: string): Promise<void> {
    await this.snapshots.delete(id);
  }
  
  /**
   * Update an existing snapshot
   * @param id Snapshot ID
   * @param updates Updates to apply
   */
  async updateSnapshot(id: string, updates: Partial<WorkspaceStateSnapshot>): Promise<void> {
    try {
      await this.snapshots.update(id, updates);
    } catch (error) {
      console.error(`Failed to update snapshot ${id}:`, error);
      throw new Error(`Failed to update snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    // Get workspace data
    const workspace = (context?.workspace) || 
      await this.plugin.app.plugins.getPlugin('claudesidian-mcp')?.services?.workspaceService?.getWorkspace(workspaceId);
    
    if (!workspace) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }
    
    // Get recent traces if not provided
    const recentTraces = context?.recentTraces || 
      (await this.getMemoryTraces(workspaceId, 20)).map(t => t.id);
    
    // Create snapshot
    const snapshot = await this.createSnapshot({
      workspaceId,
      sessionId,
      timestamp: Date.now(),
      name,
      description,
      state: {
        workspace,
        recentTraces,
        contextFiles: context?.contextFiles || [],
        metadata: context?.metadata || {}
      }
    });
    
    return snapshot.id;
  }
  
  /**
   * Restore a state snapshot to the current context
   * @param stateId ID of the state to restore
   * @param targetSessionId Optional target session ID to restore into (if not provided, uses active session)
   * @returns Information about the restored state
   */
  async restoreStateSnapshot(stateId: string): Promise<{
    stateId: string;
    name: string;
    workspaceId: string;
    sessionId: string;
    sessionName?: string;
    timestamp: number;
    recentTraces: string[];
    contextFiles: string[];
    workspace: any;
    metadata: Record<string, any>;
  }> {
    try {
      // Get the state snapshot
      const snapshot = await this.getSnapshot(stateId);
      if (!snapshot) {
        throw new Error(`State snapshot with ID ${stateId} not found`);
      }

      // Get information about the source session
      let sessionName: string | undefined;
      try {
        const sourceSession = await this.getSession(snapshot.sessionId);
        if (sourceSession) {
          sessionName = sourceSession.name;
        }
      } catch (error) {
        console.warn(`Failed to retrieve source session name: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Return the state data
      return {
        stateId: snapshot.id,
        name: snapshot.name,
        workspaceId: snapshot.workspaceId,
        sessionId: snapshot.sessionId,
        sessionName,
        timestamp: snapshot.timestamp,
        recentTraces: snapshot.state.recentTraces,
        contextFiles: snapshot.state.contextFiles,
        workspace: snapshot.state.workspace,
        metadata: snapshot.state.metadata
      };
    } catch (error) {
      console.error(`Failed to restore state snapshot ${stateId}:`, error);
      throw new Error(`Failed to restore state snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  //#endregion
  
  /**
   * Record activity trace - activity recording method
   * @param workspaceId Workspace ID
   * @param traceData Trace data
   */
  async recordActivityTrace(
    workspaceId: string,
    traceData: {
      type: 'project_plan' | 'question' | 'checkpoint' | 'completion' | 'research';
      content: string;
      metadata: {
        tool: string;
        params: any;
        result: any;
        relatedFiles: string[];
      };
      sessionId?: string;
    }
  ): Promise<string> {
    return await this.storeMemoryTrace({
      workspaceId,
      workspacePath: [workspaceId],
      contextLevel: 'workspace',
      activityType: traceData.type,
      content: traceData.content,
      metadata: traceData.metadata,
      sessionId: traceData.sessionId || '',
      timestamp: Date.now(),
      importance: 0.6,
      tags: ['tool-activity', traceData.type]
    });
  }

  /**
   * Check memory trace size and prune if necessary
   * Only affects memory traces, not file embeddings
   */
  private async checkAndPruneMemoryTraces(): Promise<void> {
    try {
      // Get memory settings from plugin
      const memorySettings = (this.plugin as any).settings?.settings?.memory as MemorySettings;
      if (!memorySettings) {
        return;
      }

      // Skip if pruning strategy is manual
      if (memorySettings.pruningStrategy === 'manual') {
        return;
      }

      // Get current memory trace collection size
      const diagnostics = await this.vectorStore.getDiagnostics();
      const memoryTraceCollection = diagnostics.collections?.find(
        (c: any) => c.name === 'memory_traces'
      );

      if (!memoryTraceCollection) {
        return;
      }

      // Calculate size in MB (rough estimate: 1 embedding ≈ 6KB)
      const estimatedSizeMB = (memoryTraceCollection.itemCount * 6) / 1024;

      // Check if we've exceeded the limit
      if (estimatedSizeMB < memorySettings.maxDbSize) {
        return;
      }

      console.log(`Memory trace size (${estimatedSizeMB.toFixed(2)} MB) exceeds limit (${memorySettings.maxDbSize} MB). Pruning...`);

      // Calculate how many traces to delete (remove 10% to create some headroom)
      const tracesToDelete = Math.ceil(memoryTraceCollection.itemCount * 0.1);

      if (memorySettings.pruningStrategy === 'oldest') {
        // Get oldest traces
        const allTraces = await this.memoryTraces.getAll({
          sortBy: 'timestamp',
          sortOrder: 'asc',
          limit: tracesToDelete
        });

        // Delete oldest traces
        for (const trace of allTraces) {
          await this.memoryTraces.delete(trace.id);
        }

        console.log(`Pruned ${allTraces.length} oldest memory traces`);
      } else if (memorySettings.pruningStrategy === 'least-used') {
        // Get traces sorted by importance (least important first)
        const allTraces = await this.memoryTraces.getAll({
          sortBy: 'importance',
          sortOrder: 'asc',
          limit: tracesToDelete
        });

        // Delete least important traces
        for (const trace of allTraces) {
          await this.memoryTraces.delete(trace.id);
        }

        console.log(`Pruned ${allTraces.length} least-used memory traces`);
      }
    } catch (error) {
      console.error('Error checking/pruning memory traces:', error);
      // Don't throw - we don't want to prevent storing new traces
    }
  }
}