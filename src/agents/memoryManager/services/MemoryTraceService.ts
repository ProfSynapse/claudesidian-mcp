/**
 * src/database/services/memory/MemoryTraceService.ts
 * 
 * Service responsible for managing memory traces.
 * Handles creation, retrieval, searching, and deletion of memory traces
 * with intelligent embedding generation and session management.
 * 
 * This refactored service uses extracted services for specific responsibilities:
 * - ToolCallTraceProcessor: Complex tool call processing and metadata generation
 * - TraceSearchService: Search operations and filtering
 * 
 * @remarks
 * This service follows the Single Responsibility Principle by focusing
 * on core memory trace operations while delegating specialized tasks.
 */

import { WorkspaceMemoryTrace } from '../../../database/workspace-types';
import { MemoryTraceCollection } from '../../../database/collections/MemoryTraceCollection';
import { EmbeddingService } from '../../../database/services/core/EmbeddingService';
import type { PendingToolCallCapture } from '../../../services/toolcall-capture/ToolCallCaptureService';
import { ToolCallTraceProcessor } from './ToolCallTraceProcessor';
import { TraceSearchService } from './TraceSearchService';
import { 
  MemoryTraceSearchOptions, 
  ActivityTraceData, 
  ToolCallMemoryTrace,
  MemoryTraceSearchResult
} from '../../../types/memory/TraceTypes';

// Re-export types for backward compatibility
export type { MemoryTraceSearchOptions, ActivityTraceData, ToolCallMemoryTrace } from '../../../types/memory/TraceTypes';

/**
 * Service responsible for managing memory traces.
 * Handles creation, retrieval, searching, and deletion of memory traces
 * with intelligent embedding generation and session management.
 * 
 * This refactored service uses extracted services for specific responsibilities:
 * - ToolCallTraceProcessor: Complex tool call processing and metadata generation
 * - TraceSearchService: Search operations and filtering
 * 
 * @remarks
 * This service follows the Single Responsibility Principle by focusing
 * on core memory trace operations while delegating specialized tasks.
 */
export class MemoryTraceService {
  private readonly toolCallProcessor: ToolCallTraceProcessor;
  private readonly searchService: TraceSearchService;
  
  /**
   * Creates a new MemoryTraceService instance
   * @param memoryTraces - Memory traces collection
   * @param embeddingService - Service for generating embeddings
   * @param sessionService - Service for session management (for incrementing tool calls)
   */
  constructor(
    private readonly memoryTraces: MemoryTraceCollection,
    private readonly embeddingService: EmbeddingService,
    private sessionService?: any // Will be injected later to avoid circular dependency
  ) {
    // Initialize extracted services
    this.toolCallProcessor = new ToolCallTraceProcessor();
    this.searchService = new TraceSearchService(memoryTraces, embeddingService);
  }

  /**
   * Set the session service for updating session statistics
   * @param sessionService - Session service instance
   */
  setSessionService(sessionService: any): void {
    this.sessionService = sessionService;
  }

  /**
   * Store a memory trace with intelligent embedding generation.
   * 
   * @param trace - Memory trace data (excluding id and embedding)
   * @returns Promise resolving to the ID of the created trace
   * 
   * @remarks
   * This method:
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
    return this.searchService.getMemoryTraces(workspaceId, limit);
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
   *   { workspaceId: 'workspace-123', limit: 10 }
   * );
   * ```
   */
  async searchMemoryTraces(query: string, options?: MemoryTraceSearchOptions): Promise<MemoryTraceSearchResult[]> {
    return this.searchService.searchMemoryTraces(query, options);
  }

  /**
   * Search memory traces using a pre-computed embedding vector
   * @param embedding - Query embedding vector
   * @param options - Search options and filters
   * @returns Promise resolving to array of traces with similarity scores
   */
  async searchMemoryTracesByEmbedding(embedding: number[], options?: MemoryTraceSearchOptions): Promise<MemoryTraceSearchResult[]> {
    return this.searchService.searchMemoryTracesByEmbedding(embedding, options);
  }

  /**
   * Get memory traces for a specific session
   * @param sessionId - Session identifier
   * @param limit - Maximum number of traces to return
   * @returns Promise resolving to array of memory traces
   */
  async getSessionTraces(sessionId: string, limit?: number): Promise<WorkspaceMemoryTrace[]> {
    return this.searchService.getSessionTraces(sessionId, limit);
  }

  /**
   * Delete all memory traces associated with a specific session
   * @param sessionId - Session identifier
   * @returns Promise resolving to the number of traces deleted
   * @throws Error if deletion fails
   */
  async deleteMemoryTracesBySession(sessionId: string): Promise<number> {
    return this.searchService.deleteMemoryTracesBySession(sessionId);
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
   * Store a tool call trace with complete JSON preservation and enhanced metadata.
   * This method is called by ToolCallCaptureService to store captured tool calls.
   * 
   * @param pendingCapture - Complete tool call capture data
   * @returns Promise resolving to the ID of the created trace
   * 
   * @remarks
   * This method:
   * - Preserves complete JSON objects for request and response
   * - Generates intelligent embeddings based on tool call importance
   * - Creates enhanced metadata with execution context
   * - Maintains relationships and search optimization data
   * 
   * @example
   * ```typescript
   * const traceId = await memoryTraceService.storeToolCallTrace(pendingCapture);
   * ```
   */
  async storeToolCallTrace(pendingCapture: PendingToolCallCapture): Promise<string> {
    try {
      // Process the tool call through the specialized processor
      const context = await this.toolCallProcessor.processToolCallTrace(pendingCapture);
      
      // Generate embedding if needed
      let embedding: number[] = [];
      if (this.embeddingService.areEmbeddingsEnabled() && context.shouldEmbed) {
        embedding = await this.embeddingService.getEmbedding(context.embeddingContent) || [];
      }
      
      // Build the complete tool call trace
      const toolCallTrace = this.toolCallProcessor.buildToolCallTrace(context, embedding);
      
      // Store the tool call trace
      const newTrace = await this.memoryTraces.createMemoryTrace(toolCallTrace);
      
      // Increment tool calls for the session if provided
      if (context.sessionContext.sessionId && this.sessionService) {
        await this.sessionService.incrementToolCalls?.(context.sessionContext.sessionId);
      }
      
      return newTrace.id;
      
    } catch (error) {
      console.error('[MemoryTraceService] Failed to store tool call trace:', error);
      throw new Error(`Failed to store tool call trace: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Search for traces by content similarity (without requiring embeddings)
   * @param searchTerm - Term to search for in trace content
   * @param options - Search options
   * @returns Promise resolving to matching traces
   */
  async searchTracesByContent(searchTerm: string, options?: MemoryTraceSearchOptions): Promise<WorkspaceMemoryTrace[]> {
    return this.searchService.searchTracesByContent(searchTerm, options);
  }
  
  /**
   * Get trace statistics for a workspace or session
   * @param workspaceId - Workspace identifier
   * @param sessionId - Optional session identifier to filter further
   * @returns Promise resolving to trace statistics
   */
  async getTraceStatistics(workspaceId: string, sessionId?: string): Promise<{
    totalTraces: number;
    activityTypes: Record<string, number>;
    importanceDistribution: Record<string, number>;
    recentTraces: number;
    oldestTrace?: Date;
    newestTrace?: Date;
  }> {
    return this.searchService.getTraceStatistics(workspaceId, sessionId);
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