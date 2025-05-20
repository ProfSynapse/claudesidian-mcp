import { Plugin } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';
import { MemoryTraceCollection } from '../collections/MemoryTraceCollection';
import { SessionCollection } from '../collections/SessionCollection';
import { SnapshotCollection } from '../collections/SnapshotCollection';
import { WorkspaceMemoryTrace, WorkspaceSession, WorkspaceStateSnapshot } from '../workspace-types';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { EmbeddingService } from './EmbeddingService';
import { ChromaCollectionManager } from '../providers/chroma/ChromaCollectionManager';
import { getErrorMessage } from '../../utils/errorUtils';
import { generateSessionId } from '../../utils/sessionUtils';

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
      // Initialize the collection manager
      await this.collectionManager.initialize().catch(error => {
        console.warn(`Failed to initialize collection manager: ${error.message}`);
      });
      
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
      
      console.log("Memory service collections initialized");
    } catch (error) {
      console.error("Failed to initialize MemoryService collections:", error);
      // Don't throw the error - let the plugin continue loading
    }
  }
  
  //#region ChromaDB Collection Management
  
  /**
   * Get the raw ChromaDB collection manager
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
  
  /**
   * Create a new collection in ChromaDB
   * @param name Collection name
   * @param metadata Optional collection metadata
   * @returns The created collection
   */
  async createCollection(name: string, metadata?: Record<string, any>): Promise<any> {
    return this.collectionManager.createCollection(name, metadata);
  }
  
  /**
   * Get a collection from ChromaDB
   * @param name Collection name
   * @returns The collection or null if not found
   */
  async getCollection(name: string): Promise<any> {
    return this.collectionManager.getCollection(name);
  }
  
  /**
   * Get or create a collection in ChromaDB
   * @param name Collection name
   * @param metadata Optional collection metadata
   * @returns The collection
   */
  async getOrCreateCollection(name: string, metadata?: Record<string, any>): Promise<any> {
    return this.collectionManager.getOrCreateCollection(name, metadata);
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
    return this.collectionManager.getCollectionDetails();
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
    return this.collectionManager.addItems(name, items);
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
  }): Promise<{
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  }> {
    return this.collectionManager.query(name, {
      queryEmbeddings: [queryEmbedding],
      nResults: options?.nResults || 10,
      where: options?.where,
      include: options?.include || ['embeddings', 'metadatas', 'documents', 'distances']
    });
  }
  
  /**
   * Get items from a collection in ChromaDB
   * @param name Collection name
   * @param ids IDs of items to get
   * @param include What to include in the response
   */
  async getItems(name: string, ids: string[], include?: string[]): Promise<any> {
    return this.collectionManager.getItems(name, { 
      ids,
      include: include || ['embeddings', 'metadatas', 'documents']
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
    return this.collectionManager.updateItems(name, items);
  }
  
  /**
   * Delete items from a collection in ChromaDB
   * @param name Collection name
   * @param ids IDs of items to delete
   */
  async deleteItems(name: string, ids: string[]): Promise<void> {
    return this.collectionManager.deleteItems(name, { ids });
  }
  
  /**
   * Get the number of items in a collection
   * @param name Collection name
   * @returns Number of items
   */
  async countItems(name: string): Promise<number> {
    return this.collectionManager.count(name);
  }
  
  //#endregion
  
  //#region Memory Traces
  
  /**
   * Store a memory trace
   * @param trace Memory trace data
   */
  async storeMemoryTrace(trace: Omit<WorkspaceMemoryTrace, 'id' | 'embedding'>): Promise<string> {
    // Generate embedding for the content
    const embedding = await this.embeddingService.getEmbedding(trace.content) || [];
    
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
      
      // Session doesn't exist and auto-create is enabled, create a new one
      console.log(`Auto-creating session with ID: ${id}`);
      
      // Try to get the default workspace
      let workspaceId: string;
      try {
        const plugin = this.plugin as any;
        const workspaceService = plugin.services?.workspaceService;
        
        if (workspaceService) {
          const workspaces = await workspaceService.getWorkspaces({ 
            sortBy: 'lastAccessed', 
            sortOrder: 'desc', 
          });
          
          if (workspaces && workspaces.length > 0) {
            workspaceId = workspaces[0].id;
          } else {
            // Create a default workspace if none exists
            const defaultWorkspace = await workspaceService.createWorkspace({
              name: 'Default Workspace',
              description: 'Automatically created default workspace',
              rootFolder: '/',
              hierarchyType: 'workspace',
              created: Date.now(),
              lastAccessed: Date.now(),
              childWorkspaces: [],
              path: [],
              relatedFolders: [],
              relevanceSettings: {
                folderProximityWeight: 0.5,
                recencyWeight: 0.7,
                frequencyWeight: 0.3
              },
              activityHistory: [],
              completionStatus: {},
              status: 'active'
            });
            workspaceId = defaultWorkspace.id;
          }
        } else {
          // No workspace service, use a default ID
          workspaceId = 'default-workspace';
        }
      } catch (error) {
        // Fallback to a default workspace ID
        console.warn(`Error getting default workspace: ${getErrorMessage(error)}`);
        workspaceId = 'default-workspace';
      }
      
      // Create a session object but pass the id parameter separately
      // Since createSession expects Omit<WorkspaceSession, "id">, we can't include id directly
      const sessionData = {
        workspaceId: workspaceId,
        name: `Session ${new Date().toLocaleString()}`,
        description: 'Auto-created session',
        startTime: Date.now(),
        isActive: true,
        toolCalls: 0
      };
      
      // The createSession method will handle the id correctly
      const newSession = await this.sessions.createSession({
        ...sessionData,
        id: id || generateSessionId() // This is handled properly by SessionCollection
      });
      
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
      console.error(`Failed to delete memory traces for session ${sessionId}:`, error);
      throw new Error(`Failed to delete memory traces: ${error instanceof Error ? error.message : String(error)}`);
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
}