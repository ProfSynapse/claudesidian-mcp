import { WorkspaceMemoryTrace } from '../../workspace-types';
import { MemoryTraceCollection } from '../../collections/MemoryTraceCollection';
import { EmbeddingService } from '../EmbeddingService';
import { DatabaseMaintenanceService } from './DatabaseMaintenanceService';

export interface MemoryTraceSearchOptions {
  workspaceId?: string;
  workspacePath?: string[];
  limit?: number;
  threshold?: number;
  sessionId?: string;
}

export interface ActivityTraceData {
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

/**
 * Service responsible for managing memory traces.
 * Handles creation, retrieval, searching, and deletion of memory traces
 * with intelligent embedding generation and session management.
 * 
 * @remarks
 * This service follows the Single Responsibility Principle by focusing
 * solely on memory trace operations. It provides smart embedding generation
 * that skips embeddings for automated file events to prevent excessive API usage.
 */
export class MemoryTraceService {
  /**
   * Creates a new MemoryTraceService instance
   * @param memoryTraces - Memory traces collection
   * @param embeddingService - Service for generating embeddings
   * @param maintenanceService - Service for database maintenance
   * @param sessionService - Service for session management (for incrementing tool calls)
   */
  constructor(
    private readonly memoryTraces: MemoryTraceCollection,
    private readonly embeddingService: EmbeddingService,
    private readonly maintenanceService: DatabaseMaintenanceService,
    private sessionService?: any // Will be injected later to avoid circular dependency
  ) {}

  /**
   * Set the session service for updating session statistics
   * @param sessionService - Session service instance
   */
  setSessionService(sessionService: any): void {
    this.sessionService = sessionService;
  }

  /**
   * Store a memory trace with intelligent embedding generation.
   * Automatically enforces database size limits before storing.
   * 
   * @param trace - Memory trace data (excluding id and embedding)
   * @returns Promise resolving to the ID of the created trace
   * 
   * @remarks
   * This method:
   * - Enforces database size limits before storing
   * - Intelligently generates embeddings only when needed
   * - Skips embeddings for automated file events (unless importance >= 0.8)
   * - Updates session tool call counts when sessionId is provided
   * 
   * @example
   * ```typescript
   * const traceId = await memoryTraceService.storeMemoryTrace({
   *   workspaceId: 'workspace-123',
   *   content: 'User asked about project structure',
   *   contextLevel: 'workspace',
   *   activityType: 'question',
   *   importance: 0.7
   * });
   * ```
   */
  async storeMemoryTrace(trace: Omit<WorkspaceMemoryTrace, 'id' | 'embedding'>): Promise<string> {
    // Enforce database size limits before adding new data
    await this.maintenanceService.enforceDbSizeLimit();
    
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
    if (trace.sessionId && this.sessionService) {
      await this.sessionService.incrementToolCalls(trace.sessionId);
    }
    
    return newTrace.id;
  }

  /**
   * Get memory traces for a specific workspace
   * @param workspaceId - Workspace identifier
   * @param limit - Maximum number of traces to return
   * @returns Promise resolving to array of memory traces
   */
  async getMemoryTraces(workspaceId: string, limit?: number): Promise<WorkspaceMemoryTrace[]> {
    return this.memoryTraces.getTracesByWorkspace(workspaceId, limit);
  }

  /**
   * Search memory traces by text similarity using embedding-based search
   * @param query - Query text to search for
   * @param options - Search options and filters
   * @returns Promise resolving to array of traces with similarity scores
   * 
   * @example
   * ```typescript
   * const results = await memoryTraceService.searchMemoryTraces(
   *   'How to handle user authentication?',
   *   { workspaceId: 'workspace-123', limit: 10, threshold: 0.7 }
   * );
   * ```
   */
  async searchMemoryTraces(query: string, options?: MemoryTraceSearchOptions): Promise<Array<{
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
   * Search memory traces using a pre-computed embedding vector
   * @param embedding - Query embedding vector
   * @param options - Search options and filters
   * @returns Promise resolving to array of traces with similarity scores
   */
  async searchMemoryTracesByEmbedding(embedding: number[], options?: MemoryTraceSearchOptions): Promise<Array<{
    trace: WorkspaceMemoryTrace;
    similarity: number;
  }>> {
    return this.memoryTraces.searchTraces(embedding, options);
  }

  /**
   * Get memory traces for a specific session
   * @param sessionId - Session identifier
   * @param limit - Maximum number of traces to return
   * @returns Promise resolving to array of memory traces
   */
  async getSessionTraces(sessionId: string, limit?: number): Promise<WorkspaceMemoryTrace[]> {
    return this.memoryTraces.getTracesBySession(sessionId, limit);
  }

  /**
   * Delete all memory traces associated with a specific session
   * @param sessionId - Session identifier
   * @returns Promise resolving to the number of traces deleted
   * @throws Error if deletion fails
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
   * Record an activity trace for tool interactions and user activities.
   * This is a convenience method for storing structured activity data.
   * 
   * @param workspaceId - Workspace identifier
   * @param traceData - Activity trace data with type, content, and metadata
   * @returns Promise resolving to the ID of the created trace
   * 
   * @example
   * ```typescript
   * const traceId = await memoryTraceService.recordActivityTrace('workspace-123', {
   *   type: 'question',
   *   content: 'User asked about API endpoints',
   *   metadata: {
   *     tool: 'ChatInterface',
   *     params: { query: 'API endpoints' },
   *     result: { response: 'Found 5 endpoints' },
   *     relatedFiles: ['api/routes.ts']
   *   },
   *   sessionId: 'session-456'
   * });
   * ```
   */
  async recordActivityTrace(
    workspaceId: string,
    traceData: ActivityTraceData
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
   * Get the underlying memory traces collection
   * @returns Memory traces collection instance
   * @deprecated Use the service methods instead of accessing collection directly
   */
  getCollection(): MemoryTraceCollection {
    return this.memoryTraces;
  }
}