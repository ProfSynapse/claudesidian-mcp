import { WorkspaceMemoryTrace } from '../../workspace-types';
import { MemoryTraceCollection } from '../../collections/MemoryTraceCollection';
import { EmbeddingService } from '../EmbeddingService';
import type { PendingToolCallCapture } from '../../../services/toolcall-capture/ToolCallCaptureService';

export interface MemoryTraceSearchOptions {
  workspaceId?: string;
  workspacePath?: string[];
  limit?: number;
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
 * Enhanced memory trace for tool call capture with complete JSON preservation
 * Extends WorkspaceMemoryTrace with tool call specific fields
 */
export interface ToolCallMemoryTrace extends WorkspaceMemoryTrace {
  // Tool call identification
  toolCallId: string;
  agent: string;
  mode: string;
  toolName: string;
  
  // Enhanced metadata with complete JSON preservation
  metadata: {
    // Tool call request data (complete JSON preservation)
    request: {
      originalParams: Record<string, any>;
      normalizedParams: Record<string, any>;
      workspaceContext?: {
        workspaceId: string;
        sessionId?: string;
        workspacePath?: string[];
      };
      source: 'mcp-client' | 'internal' | 'agent-trigger';
    };
    
    // Tool call response data (complete JSON preservation)
    response: {
      result: Record<string, any> | null;
      success: boolean;
      error?: {
        type: string;
        message: string;
        code?: string | number;
        stack?: string;
      };
      resultType?: string;
      resultSummary?: string;
      affectedResources?: string[];
    };
    
    // Legacy compatibility fields
    tool: string;
    params: any;
    result: any;
    relatedFiles: string[];
  };
  
  // Execution context
  executionContext: {
    timing: {
      startTimestamp: number;
      endTimestamp: number;
      executionTime: number;
    };
    environment: {
      pluginVersion: string;
      platform: string;
    };
    userContext: {
      sessionStart: number;
      sessionDuration: number;
      previousToolCalls: number;
    };
    performance: {
      importance: number;
      complexity: number;
      userEngagement: number;
    };
  };
  
  // Relationships
  relationships: {
    relatedFiles: string[];
    affectedResources: string[];
    sessionToolCalls: string[];
    workspaceContext: string[];
  };
  
  // Search optimization
  searchOptimization: {
    embeddingContent: {
      primary: string;
      keywords: string[];
      entities: string[];
    };
    categories: {
      functionalCategory: string;
      domainCategory: string;
      complexityCategory: string;
      impactCategory: string;
    };
    searchTags: string[];
    searchScoring: {
      recencyScore: number;
      frequencyScore: number;
      successScore: number;
      impactScore: number;
      userEngagementScore: number;
    };
    indexingHints: {
      shouldEmbed: boolean;
      embeddingPriority: 'high' | 'medium' | 'low';
      cacheStrategy: 'session' | 'workspace' | 'global';
      searchFrequency: 'frequent' | 'occasional' | 'rare';
    };
  };
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
   * @param sessionService - Service for session management (for incrementing tool calls)
   */
  constructor(
    private readonly memoryTraces: MemoryTraceCollection,
    private readonly embeddingService: EmbeddingService,
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
   *   { workspaceId: 'workspace-123', limit: 10 }
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
      const request = pendingCapture.request;
      const response = pendingCapture.response;
      const sessionContext = pendingCapture.sessionContext;
      
      if (!response) {
        throw new Error('Cannot store tool call trace without response data');
      }
      
      // Generate embedding content from tool call data
      const embeddingContent = this.generateToolCallEmbeddingContent(request, response);
      
      // Generate embedding if enabled and important
      let embedding: number[] = [];
      const shouldEmbed = this.shouldGenerateEmbedding(request, response);
      
      if (this.embeddingService.areEmbeddingsEnabled() && shouldEmbed) {
        embedding = await this.embeddingService.getEmbedding(embeddingContent) || [];
      } else {
      }
      
      // Extract relationships
      const relationships = this.extractToolCallRelationships(request, response);
      
      // Calculate performance metrics
      const performanceMetrics = this.calculateToolCallPerformanceMetrics(request, response);
      
      // Generate search optimization data
      const searchOptimization = this.generateSearchOptimization(request, response, embeddingContent, shouldEmbed);
      
      // Create enhanced tool call memory trace
      const toolCallTrace: ToolCallMemoryTrace = {
        // Base memory trace fields
        id: '', // Will be generated by collection
        workspaceId: sessionContext.workspaceId,
        workspacePath: sessionContext.workspacePath || [sessionContext.workspaceId],
        contextLevel: 'workspace',
        activityType: 'research', // Tool calls are generally research/discovery activities
        content: embeddingContent,
        embedding: embedding,
        sessionId: sessionContext.sessionId,
        timestamp: request.timestamp,
        importance: performanceMetrics.importance,
        tags: this.generateToolCallTags(request, response),
        
        // Tool call specific fields
        toolCallId: request.toolCallId,
        agent: request.agent,
        mode: request.mode,
        toolName: `${request.agent}.${request.mode}`,
        
        // Enhanced metadata with complete JSON preservation
        metadata: {
          request: {
            originalParams: request.params,
            normalizedParams: request.params, // Could be enhanced with validation
            workspaceContext: request.workspaceContext,
            source: request.source
          },
          response: {
            result: response.result,
            success: response.success,
            error: response.error,
            resultType: response.resultType || this.inferResultType(response.result),
            resultSummary: response.resultSummary || this.generateResultSummary(response),
            affectedResources: response.affectedResources || relationships.affectedResources
          },
          
          // Legacy compatibility
          tool: `${request.agent}.${request.mode}`,
          params: request.params,
          result: response.result,
          relatedFiles: relationships.relatedFiles
        },
        
        // Execution context
        executionContext: {
          timing: {
            startTimestamp: request.timestamp,
            endTimestamp: response.timestamp,
            executionTime: response.executionTime
          },
          environment: {
            pluginVersion: '1.0.0', // Would be extracted from plugin
            platform: process.platform || 'unknown'
          },
          userContext: {
            sessionStart: sessionContext.sessionCreated ? request.timestamp : 0,
            sessionDuration: response.timestamp - request.timestamp,
            previousToolCalls: 0 // Would be extracted from session
          },
          performance: performanceMetrics
        },
        
        // Relationships
        relationships: relationships,
        
        // Search optimization
        searchOptimization: searchOptimization
      };
      
      // Store the tool call trace
      const newTrace = await this.memoryTraces.createMemoryTrace(toolCallTrace);
      
      // Increment tool calls for the session if provided
      if (sessionContext.sessionId && this.sessionService) {
        await this.sessionService.incrementToolCalls?.(sessionContext.sessionId);
      }
      
      return newTrace.id;
      
    } catch (error) {
      console.error('[MemoryTraceService] Failed to store tool call trace:', error);
      throw new Error(`Failed to store tool call trace: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Generate embedding content from tool call data
   * @private
   */
  private generateToolCallEmbeddingContent(request: any, response: any): string {
    const parts = [
      `Tool: ${request.agent}.${request.mode}`,
      `Action: ${this.generateActionDescription(request, response)}`,
      `Workspace: ${request.workspaceContext?.workspaceId || 'unknown'}`,
      `Status: ${response.success ? 'SUCCESS' : 'FAILED'}`,
      `Parameters: ${this.summarizeParameters(request.params)}`,
      `Result: ${this.summarizeResult(response.result)}`,
      `Time: ${new Date(request.timestamp).toISOString()}`
    ];
    
    return parts.filter(part => part.trim().length > 0).join('\n');
  }
  
  /**
   * Determine if embedding should be generated for this tool call
   * @private
   */
  private shouldGenerateEmbedding(request: any, response: any): boolean {
    // Always embed failed operations for debugging
    if (!response.success) return true;
    
    // High-value agents always get embeddings
    const highValueAgents = ['contentManager', 'memoryManager', 'vaultLibrarian', 'agentManager'];
    if (highValueAgents.includes(request.agent)) return true;
    
    // Long execution times indicate important operations
    if (response.executionTime > 5000) return true;
    
    // Complex operations with multiple resources
    if (request.params?.paths && Array.isArray(request.params.paths) && request.params.paths.length > 1) {
      return true;
    }
    
    // Batch operations
    if (request.params?.operations && Array.isArray(request.params.operations)) {
      return true;
    }
    
    // Default: Skip simple operations
    const skipModes = ['healthCheck', 'getStatus', 'listModes'];
    return !skipModes.includes(request.mode);
  }
  
  /**
   * Extract relationships from tool call data
   * @private
   */
  private extractToolCallRelationships(request: any, response: any): any {
    const relatedFiles: string[] = [];
    const affectedResources: string[] = [];
    
    // Extract file paths from parameters
    if (request.params?.filePath) relatedFiles.push(request.params.filePath);
    if (request.params?.paths && Array.isArray(request.params.paths)) {
      relatedFiles.push(...request.params.paths);
    }
    if (request.params?.operations && Array.isArray(request.params.operations)) {
      for (const op of request.params.operations) {
        if (op.filePath) relatedFiles.push(op.filePath);
        if (op.paths) relatedFiles.push(...op.paths);
      }
    }
    
    // Extract affected resources from response
    if (response.affectedResources && Array.isArray(response.affectedResources)) {
      affectedResources.push(...response.affectedResources);
    }
    
    return {
      relatedFiles: Array.from(new Set(relatedFiles)), // Remove duplicates
      affectedResources: Array.from(new Set(affectedResources)),
      sessionToolCalls: [], // Would be populated from session context
      workspaceContext: request.workspaceContext?.workspacePath || []
    };
  }
  
  /**
   * Calculate performance metrics for tool call
   * @private
   */
  private calculateToolCallPerformanceMetrics(request: any, response: any): any {
    let importance = 0.5; // Base importance
    
    // Failed operations are more important for debugging
    if (!response.success) importance += 0.3;
    
    // Long execution times indicate complexity
    if (response.executionTime > 1000) importance += 0.2;
    if (response.executionTime > 5000) importance += 0.3;
    
    // High-value agents get higher importance
    const highValueAgents = ['contentManager', 'memoryManager', 'vaultLibrarian', 'agentManager'];
    if (highValueAgents.includes(request.agent)) importance += 0.2;
    
    // Multi-file operations are more complex
    const fileCount = this.countAffectedFiles(request.params);
    if (fileCount > 1) importance += 0.1;
    if (fileCount > 5) importance += 0.2;
    
    return {
      importance: Math.min(importance, 1.0),
      complexity: this.calculateComplexity(request, response),
      userEngagement: 0.5 // Would be calculated based on actual user interaction
    };
  }
  
  /**
   * Generate search optimization data
   * @private
   */
  private generateSearchOptimization(request: any, response: any, embeddingContent: string, shouldEmbed: boolean): any {
    return {
      embeddingContent: {
        primary: embeddingContent,
        keywords: this.extractKeywords(request, response),
        entities: this.extractEntities(request, response)
      },
      categories: {
        functionalCategory: this.categorizeTool(request.agent, request.mode),
        domainCategory: this.categorizeDomain(request, response),
        complexityCategory: this.categorizeComplexity(request, response),
        impactCategory: this.categorizeImpact(request, response)
      },
      searchTags: this.generateToolCallTags(request, response),
      searchScoring: {
        recencyScore: 1.0, // New tool calls get max recency
        frequencyScore: 0.5,
        successScore: response.success ? 1.0 : 0.0,
        impactScore: this.calculateToolCallPerformanceMetrics(request, response).importance,
        userEngagementScore: 0.5
      },
      indexingHints: {
        shouldEmbed: shouldEmbed,
        embeddingPriority: this.calculateToolCallPerformanceMetrics(request, response).importance > 0.7 ? 'high' : 'medium',
        cacheStrategy: 'session',
        searchFrequency: 'occasional'
      }
    };
  }
  
  /**
   * Generate tags for tool call trace
   * @private
   */
  private generateToolCallTags(request: any, response: any): string[] {
    const tags = [
      'tool-call',
      request.agent,
      request.mode,
      `${request.agent}.${request.mode}`,
      response.success ? 'success' : 'error'
    ];
    
    // Add source tag
    tags.push(request.source);
    
    // Add execution time category
    if (response.executionTime > 5000) tags.push('slow-execution');
    else if (response.executionTime < 100) tags.push('fast-execution');
    
    // Add complexity tags
    const fileCount = this.countAffectedFiles(request.params);
    if (fileCount > 1) tags.push('multi-file');
    if (fileCount > 10) tags.push('bulk-operation');
    
    return tags;
  }
  
  // Helper methods
  private generateActionDescription(request: any, response: any): string {
    return `${request.agent} ${request.mode} operation ${response.success ? 'completed' : 'failed'}`;
  }
  
  private summarizeParameters(params: any): string {
    if (!params || typeof params !== 'object') return 'none';
    const keys = Object.keys(params);
    return keys.length > 0 ? `${keys.length} parameters (${keys.slice(0, 3).join(', ')})` : 'none';
  }
  
  private summarizeResult(result: any): string {
    if (!result) return 'no result';
    if (typeof result === 'string') return result.length > 100 ? `${result.substring(0, 100)}...` : result;
    if (typeof result === 'object') return `object with ${Object.keys(result).length} properties`;
    return String(result);
  }
  
  private inferResultType(result: any): string {
    if (result === null || result === undefined) return 'null';
    if (Array.isArray(result)) return 'array';
    return typeof result;
  }
  
  private generateResultSummary(response: any): string {
    if (!response.success && response.error) {
      return `Error: ${response.error.message}`;
    }
    return this.summarizeResult(response.result);
  }
  
  private countAffectedFiles(params: any): number {
    let count = 0;
    if (params?.filePath) count++;
    if (params?.paths && Array.isArray(params.paths)) count += params.paths.length;
    if (params?.operations && Array.isArray(params.operations)) {
      for (const op of params.operations) {
        if (op.filePath) count++;
        if (op.paths && Array.isArray(op.paths)) count += op.paths.length;
      }
    }
    return count;
  }
  
  private calculateComplexity(request: any, response: any): number {
    let complexity = 0.5;
    complexity += Math.min(response.executionTime / 10000, 0.3); // Execution time factor
    complexity += Math.min(this.countAffectedFiles(request.params) / 10, 0.2); // File count factor
    return Math.min(complexity, 1.0);
  }
  
  private extractKeywords(request: any, response: any): string[] {
    const keywords = [request.agent, request.mode];
    if (request.workspaceContext?.workspaceId) keywords.push(request.workspaceContext.workspaceId);
    return keywords;
  }
  
  private extractEntities(request: any, response: any): string[] {
    const entities: string[] = [];
    // Extract file paths as entities
    const relatedFiles = this.extractToolCallRelationships(request, response).relatedFiles;
    entities.push(...relatedFiles.map((path: string) => path.split('/').pop() || path));
    return entities;
  }
  
  private categorizeTool(agent: string, mode: string): string {
    const categories: Record<string, string> = {
      'contentManager': 'content-management',
      'vaultManager': 'file-management',
      'vaultLibrarian': 'search-discovery',
      'memoryManager': 'memory-state',
      'agentManager': 'ai-automation',
      'commandManager': 'system-control'
    };
    return categories[agent] || 'general';
  }
  
  private categorizeDomain(request: any, response: any): string {
    // Analyze the operation to determine domain
    if (request.mode.includes('search') || request.mode.includes('find')) return 'search';
    if (request.mode.includes('create') || request.mode.includes('write')) return 'creation';
    if (request.mode.includes('update') || request.mode.includes('edit')) return 'modification';
    if (request.mode.includes('delete') || request.mode.includes('remove')) return 'deletion';
    if (request.mode.includes('read') || request.mode.includes('get')) return 'retrieval';
    return 'general';
  }
  
  private categorizeComplexity(request: any, response: any): string {
    const complexity = this.calculateComplexity(request, response);
    if (complexity > 0.8) return 'high';
    if (complexity > 0.5) return 'medium';
    return 'low';
  }
  
  private categorizeImpact(request: any, response: any): string {
    const fileCount = this.countAffectedFiles(request.params);
    if (fileCount > 10) return 'high';
    if (fileCount > 1) return 'medium';
    if (!response.success) return 'medium'; // Errors have medium impact for debugging
    return 'low';
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