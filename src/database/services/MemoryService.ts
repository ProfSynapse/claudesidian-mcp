import { Plugin } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';
import { MemoryTraceCollection } from '../collections/MemoryTraceCollection';
import { SessionCollection } from '../collections/SessionCollection';
import { SnapshotCollection } from '../collections/SnapshotCollection';
import { WorkspaceMemoryTrace, WorkspaceSession, WorkspaceStateSnapshot } from '../workspace-types';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { EmbeddingService } from './EmbeddingService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service for managing memory traces, sessions, and snapshots
 */
export class MemoryService {
  /**
   * Vector store instance
   */
  private vectorStore: IVectorStore;
  
  /**
   * Collections for memory-related data
   */
  private memoryTraces: MemoryTraceCollection;
  private sessions: SessionCollection;
  private snapshots: SnapshotCollection;
  
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
    
    // Create collections
    this.memoryTraces = VectorStoreFactory.createMemoryTraceCollection(vectorStore);
    this.sessions = VectorStoreFactory.createSessionCollection(vectorStore);
    this.snapshots = VectorStoreFactory.createSnapshotCollection(vectorStore);
  }
  
  /**
   * Initialize the memory service
   */
  async initialize(): Promise<void> {
    try {
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
   * Get a session by ID
   * @param id Session ID
   */
  async getSession(id: string): Promise<WorkspaceSession | undefined> {
    return this.sessions.get(id);
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
   * Get memory traces for a specific session
   * @param sessionId Session ID
   * @param limit Maximum number of traces to return
   */
  async getSessionTraces(sessionId: string, limit?: number): Promise<WorkspaceMemoryTrace[]> {
    return this.memoryTraces.getTracesBySession(sessionId, limit);
  }
  
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
   * Get snapshots for a workspace
   * @param workspaceId Workspace ID
   * @param sessionId Optional session ID filter
   */
  async getSnapshots(workspaceId: string, sessionId?: string): Promise<WorkspaceStateSnapshot[]> {
    return this.snapshots.getSnapshotsByWorkspace(workspaceId, sessionId);
  }
  
  /**
   * Delete a snapshot
   * @param id Snapshot ID
   */
  async deleteSnapshot(id: string): Promise<void> {
    await this.snapshots.delete(id);
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
   * Create a context state snapshot
   * @param workspaceId Workspace ID
   * @param sessionId Session ID
   * @param name Snapshot name
   * @param description Optional snapshot description
   * @param context Optional context data
   */
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
}