/**
 * src/database/services/memory/TraceSearchService.ts
 * 
 * Service responsible for search operations on memory traces.
 * Extracted from MemoryTraceService.ts to provide focused search functionality.
 * 
 * This service handles:
 * - Text-based search using embeddings
 * - Embedding-based search operations
 * - Search result processing and filtering
 * - Search optimization and caching
 */

import { WorkspaceMemoryTrace } from '../../workspace-types';
import { MemoryTraceCollection } from '../../collections/MemoryTraceCollection';
import { EmbeddingService } from '../EmbeddingService';
import { MemoryTraceSearchOptions, MemoryTraceSearchResult } from '../../../types/memory/TraceTypes';

/**
 * Service for performing search operations on memory traces
 */
export class TraceSearchService {
  
  /**
   * Creates a new TraceSearchService instance
   * @param memoryTraces - Memory traces collection for database operations
   * @param embeddingService - Service for generating search embeddings
   */
  constructor(
    private readonly memoryTraces: MemoryTraceCollection,
    private readonly embeddingService: EmbeddingService
  ) {}
  
  /**
   * Search memory traces by text similarity using embedding-based search
   * @param query - Query text to search for
   * @param options - Search options and filters
   * @returns Promise resolving to array of traces with similarity scores
   * 
   * @example
   * ```typescript
   * const results = await traceSearchService.searchMemoryTraces(
   *   'How to handle user authentication?',
   *   { workspaceId: 'workspace-123', limit: 10 }
   * );
   * ```
   */
  async searchMemoryTraces(query: string, options?: MemoryTraceSearchOptions): Promise<MemoryTraceSearchResult[]> {
    try {
      // Generate embedding for the query
      const embedding = await this.embeddingService.getEmbedding(query);
      
      if (!embedding) {
        console.warn('[TraceSearchService] Failed to generate embedding for query, returning empty results');
        return [];
      }
      
      // Search traces by similarity
      return this.searchMemoryTracesByEmbedding(embedding, options);
    } catch (error) {
      console.error('[TraceSearchService] Error during text-based search:', error);
      throw new Error(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Search memory traces using a pre-computed embedding vector
   * @param embedding - Query embedding vector
   * @param options - Search options and filters
   * @returns Promise resolving to array of traces with similarity scores
   */
  async searchMemoryTracesByEmbedding(embedding: number[], options?: MemoryTraceSearchOptions): Promise<MemoryTraceSearchResult[]> {
    try {
      if (!embedding || embedding.length === 0) {
        console.warn('[TraceSearchService] Empty embedding provided, returning empty results');
        return [];
      }
      
      // Search traces by similarity using collection method
      const results = await this.memoryTraces.searchTraces(embedding, options);
      
      // Process and optimize results
      return this.processSearchResults(results, options);
    } catch (error) {
      console.error('[TraceSearchService] Error during embedding-based search:', error);
      throw new Error(`Embedding search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get memory traces for a specific workspace
   * @param workspaceId - Workspace identifier
   * @param limit - Maximum number of traces to return
   * @returns Promise resolving to array of memory traces
   */
  async getMemoryTraces(workspaceId: string, limit?: number): Promise<WorkspaceMemoryTrace[]> {
    try {
      if (!workspaceId.trim()) {
        throw new Error('Workspace ID cannot be empty');
      }
      
      return await this.memoryTraces.getTracesByWorkspace(workspaceId, limit);
    } catch (error) {
      console.error(`[TraceSearchService] Error getting traces for workspace ${workspaceId}:`, error);
      throw new Error(`Failed to get workspace traces: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get memory traces for a specific session
   * @param sessionId - Session identifier
   * @param limit - Maximum number of traces to return
   * @returns Promise resolving to array of memory traces
   */
  async getSessionTraces(sessionId: string, limit?: number): Promise<WorkspaceMemoryTrace[]> {
    try {
      if (!sessionId.trim()) {
        throw new Error('Session ID cannot be empty');
      }
      
      return await this.memoryTraces.getTracesBySession(sessionId, limit);
    } catch (error) {
      console.error(`[TraceSearchService] Error getting traces for session ${sessionId}:`, error);
      throw new Error(`Failed to get session traces: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Delete all memory traces associated with a specific session
   * @param sessionId - Session identifier
   * @returns Promise resolving to the number of traces deleted
   * @throws Error if deletion fails
   */
  async deleteMemoryTracesBySession(sessionId: string): Promise<number> {
    try {
      if (!sessionId.trim()) {
        throw new Error('Session ID cannot be empty');
      }
      
      // Get all traces for this session
      const traces = await this.memoryTraces.getTracesBySession(sessionId);
      
      if (traces.length === 0) {
        console.info(`[TraceSearchService] No traces found for session ${sessionId}`);
        return 0;
      }
      
      // Delete each trace
      const deletePromises = traces.map(trace => this.memoryTraces.delete(trace.id));
      await Promise.all(deletePromises);
      
      console.info(`[TraceSearchService] Successfully deleted ${traces.length} traces for session ${sessionId}`);
      return traces.length;
    } catch (error) {
      console.error(`[TraceSearchService] Failed to delete memory traces for session ${sessionId}:`, error);
      throw new Error(`Failed to delete memory traces: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Search for traces by content similarity (without requiring embeddings)
   * @param searchTerm - Term to search for in trace content
   * @param options - Search options
   * @returns Promise resolving to matching traces
   */
  async searchTracesByContent(searchTerm: string, options?: MemoryTraceSearchOptions): Promise<WorkspaceMemoryTrace[]> {
    try {
      if (!searchTerm.trim()) {
        return [];
      }
      
      // Get traces from workspace/session filters first if provided
      let candidateTraces: WorkspaceMemoryTrace[];
      
      if (options?.workspaceId) {
        candidateTraces = await this.getMemoryTraces(options.workspaceId, options.limit);
      } else if (options?.sessionId) {
        candidateTraces = await this.getSessionTraces(options.sessionId, options.limit);
      } else {
        // Without workspace/session filter, we need a different approach
        // For now, return empty array as this would be inefficient
        console.warn('[TraceSearchService] Content search requires workspaceId or sessionId filter');
        return [];
      }
      
      // Filter traces by content match
      const searchTermLower = searchTerm.toLowerCase();
      const matchingTraces = candidateTraces.filter(trace =>
        trace.content.toLowerCase().includes(searchTermLower) ||
        trace.tags.some(tag => tag.toLowerCase().includes(searchTermLower)) ||
        (trace.metadata?.tool && trace.metadata.tool.toLowerCase().includes(searchTermLower))
      );
      
      // Sort by relevance (approximate based on content match position)
      return matchingTraces.sort((a, b) => {
        const aIndex = a.content.toLowerCase().indexOf(searchTermLower);
        const bIndex = b.content.toLowerCase().indexOf(searchTermLower);
        
        // Prefer matches earlier in content
        if (aIndex !== bIndex) {
          return aIndex - bIndex;
        }
        
        // Then prefer more recent traces
        return b.timestamp - a.timestamp;
      });
      
    } catch (error) {
      console.error('[TraceSearchService] Error during content search:', error);
      throw new Error(`Content search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    try {
      const traces = sessionId 
        ? await this.getSessionTraces(sessionId)
        : await this.getMemoryTraces(workspaceId);
      
      if (traces.length === 0) {
        return {
          totalTraces: 0,
          activityTypes: {},
          importanceDistribution: {},
          recentTraces: 0
        };
      }
      
      // Calculate statistics
      const activityTypes: Record<string, number> = {};
      const importanceDistribution: Record<string, number> = { low: 0, medium: 0, high: 0 };
      let oldestTrace = new Date(traces[0].timestamp);
      let newestTrace = new Date(traces[0].timestamp);
      
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      let recentTraces = 0;
      
      for (const trace of traces) {
        // Activity types
        activityTypes[trace.activityType] = (activityTypes[trace.activityType] || 0) + 1;
        
        // Importance distribution
        if (trace.importance < 0.4) importanceDistribution.low++;
        else if (trace.importance < 0.7) importanceDistribution.medium++;
        else importanceDistribution.high++;
        
        // Date tracking
        const traceDate = new Date(trace.timestamp);
        if (traceDate < oldestTrace) oldestTrace = traceDate;
        if (traceDate > newestTrace) newestTrace = traceDate;
        
        // Recent traces
        if (trace.timestamp > oneDayAgo) recentTraces++;
      }
      
      return {
        totalTraces: traces.length,
        activityTypes,
        importanceDistribution,
        recentTraces,
        oldestTrace,
        newestTrace
      };
      
    } catch (error) {
      console.error('[TraceSearchService] Error getting trace statistics:', error);
      throw new Error(`Failed to get trace statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Process and optimize search results
   * @private
   */
  private processSearchResults(
    results: MemoryTraceSearchResult[], 
    options?: MemoryTraceSearchOptions
  ): MemoryTraceSearchResult[] {
    if (results.length === 0) {
      return results;
    }
    
    // Apply additional filtering if needed
    let processedResults = results;
    
    // Apply session filtering if specified (collection search might not have this filter)
    if (options?.sessionId) {
      processedResults = processedResults.filter(result => 
        result.trace.sessionId === options.sessionId
      );
    }
    
    // Apply workspace path filtering if specified
    if (options?.workspacePath && options.workspacePath.length > 0) {
      processedResults = processedResults.filter(result => 
        options.workspacePath!.some(path => 
          result.trace.workspacePath.includes(path)
        )
      );
    }
    
    // Sort by similarity score (descending)
    processedResults.sort((a, b) => b.similarity - a.similarity);
    
    // Apply limit if specified
    if (options?.limit && processedResults.length > options.limit) {
      processedResults = processedResults.slice(0, options.limit);
    }
    
    return processedResults;
  }
}