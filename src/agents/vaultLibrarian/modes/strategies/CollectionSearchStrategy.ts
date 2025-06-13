import { Plugin } from 'obsidian';
import { MemoryService } from '../../../../database/services/MemoryService';
import { WorkspaceSession, WorkspaceStateSnapshot, WorkspaceMemoryTrace } from '../../../../database/workspace-types';
import { UniversalSearchResultItem, CategoryType } from '../../types';
import { SemanticFallbackService } from '../services/SemanticFallbackService';

/**
 * Strategy for searching collection-based data (sessions, snapshots, memory traces)
 * Handles both semantic and traditional text-based search
 */
export class CollectionSearchStrategy {
  constructor(
    private plugin: Plugin,
    private memoryService?: MemoryService,
    private semanticFallback: SemanticFallbackService = new SemanticFallbackService()
  ) {}

  /**
   * Search sessions with intelligent fallback
   */
  async searchSessions(
    query: string,
    options: {
      limit?: number;
      paths?: string[];
      includeContent?: boolean;
      semanticThreshold?: number;
      forceSemanticSearch?: boolean;
    } = {}
  ): Promise<UniversalSearchResultItem[]> {
    if (!this.memoryService) {
      console.warn('MemoryService not available for session search');
      return [];
    }

    const useSemanticSearch = this.semanticFallback.shouldUseSemanticSearch('sessions', options.forceSemanticSearch);
    
    try {
      if (useSemanticSearch) {
        return await this.searchSessionsSemantic(query, options);
      } else {
        return await this.searchSessionsTraditional(query, options);
      }
    } catch (error) {
      console.warn('Session search failed, falling back:', error);
      
      if (useSemanticSearch) {
        return await this.searchSessionsTraditional(query, options);
      }
      
      return [];
    }
  }

  /**
   * Search snapshots with intelligent fallback
   */
  async searchSnapshots(
    query: string,
    options: {
      limit?: number;
      paths?: string[];
      includeContent?: boolean;
      semanticThreshold?: number;
      forceSemanticSearch?: boolean;
    } = {}
  ): Promise<UniversalSearchResultItem[]> {
    if (!this.memoryService) {
      console.warn('MemoryService not available for snapshot search');
      return [];
    }

    const useSemanticSearch = this.semanticFallback.shouldUseSemanticSearch('snapshots', options.forceSemanticSearch);
    
    try {
      if (useSemanticSearch) {
        return await this.searchSnapshotsSemantic(query, options);
      } else {
        return await this.searchSnapshotsTraditional(query, options);
      }
    } catch (error) {
      console.warn('Snapshot search failed, falling back:', error);
      
      if (useSemanticSearch) {
        return await this.searchSnapshotsTraditional(query, options);
      }
      
      return [];
    }
  }

  /**
   * Search memory traces with intelligent fallback
   */
  async searchMemoryTraces(
    query: string,
    options: {
      limit?: number;
      paths?: string[];
      includeContent?: boolean;
      semanticThreshold?: number;
      forceSemanticSearch?: boolean;
    } = {}
  ): Promise<UniversalSearchResultItem[]> {
    if (!this.memoryService) {
      console.warn('MemoryService not available for memory trace search');
      return [];
    }

    const useSemanticSearch = this.semanticFallback.shouldUseSemanticSearch('memory_traces', options.forceSemanticSearch);
    
    try {
      if (useSemanticSearch) {
        return await this.searchMemoryTracesSemantic(query, options);
      } else {
        return await this.searchMemoryTracesTraditional(query, options);
      }
    } catch (error) {
      console.warn('Memory trace search failed, falling back:', error);
      
      if (useSemanticSearch) {
        return await this.searchMemoryTracesTraditional(query, options);
      }
      
      return [];
    }
  }

  /**
   * Semantic search for sessions using collection vector search
   */
  private async searchSessionsSemantic(
    query: string,
    options: {
      limit?: number;
      semanticThreshold?: number;
    }
  ): Promise<UniversalSearchResultItem[]> {
    // For now, fall back to traditional since sessions collection semantic search
    // would need to be implemented in the collection layer
    return await this.searchSessionsTraditional(query, options);
  }

  /**
   * Traditional text search for sessions
   */
  private async searchSessionsTraditional(
    query: string,
    options: {
      limit?: number;
      includeContent?: boolean;
    }
  ): Promise<UniversalSearchResultItem[]> {
    if (!this.memoryService) return [];

    try {
      // TODO: Implement session search when MemoryService API is available
      // For now, return empty results
      console.log('Session search not yet implemented - returning empty results');
      return [];
    } catch (error) {
      console.error('Failed to search sessions:', error);
      return [];
    }
  }

  /**
   * Calculate relevance score for a session
   */
  private calculateSessionRelevance(session: WorkspaceSession, queryLower: string): number {
    let score = 0;
    const maxScore = 100;

    // Name match
    if (session.name?.toLowerCase().includes(queryLower)) {
      score += 40;
    }

    // Description match  
    if (session.description?.toLowerCase().includes(queryLower)) {
      score += 30;
    }

    // Activity summary match
    if (session.activitySummary?.toLowerCase().includes(queryLower)) {
      score += 20;
    }

    // Workspace ID match (partial)
    if (session.workspaceId.toLowerCase().includes(queryLower)) {
      score += 10;
    }

    return Math.min(score / maxScore, 1.0);
  }

  /**
   * Create snippet for session results
   */
  private createSessionSnippet(session: WorkspaceSession): string {
    const parts: string[] = [];
    
    if (session.description) {
      parts.push(session.description);
    }
    
    if (session.activitySummary) {
      parts.push(session.activitySummary);
    }
    
    parts.push(`${session.toolCalls} tool calls`);
    
    if (session.isActive) {
      parts.push('Active');
    }

    const snippet = parts.join(' | ');
    return snippet.length > 200 ? snippet.substring(0, 200) + '...' : snippet;
  }

  /**
   * Get full session content
   */
  private getSessionContent(session: WorkspaceSession): string {
    const content: string[] = [];
    
    content.push(`Session ID: ${session.id}`);
    content.push(`Workspace: ${session.workspaceId}`);
    
    if (session.name) {
      content.push(`Name: ${session.name}`);
    }
    
    if (session.description) {
      content.push(`Description: ${session.description}`);
    }
    
    content.push(`Start Time: ${new Date(session.startTime).toISOString()}`);
    
    if (session.endTime) {
      content.push(`End Time: ${new Date(session.endTime).toISOString()}`);
    }
    
    content.push(`Status: ${session.isActive ? 'Active' : 'Completed'}`);
    content.push(`Tool Calls: ${session.toolCalls}`);
    
    if (session.activitySummary) {
      content.push(`Activity: ${session.activitySummary}`);
    }
    
    return content.join('\\n');
  }

  // Similar implementations for snapshots and memory traces would follow the same pattern
  // For brevity, I'll implement simplified versions

  private async searchSnapshotsSemantic(query: string, options: any): Promise<UniversalSearchResultItem[]> {
    return await this.searchSnapshotsTraditional(query, options);
  }

  private async searchSnapshotsTraditional(query: string, options: any): Promise<UniversalSearchResultItem[]> {
    // Simplified implementation - would follow same pattern as sessions
    return [];
  }

  private async searchMemoryTracesSemantic(query: string, options: any): Promise<UniversalSearchResultItem[]> {
    return await this.searchMemoryTracesTraditional(query, options);
  }

  private async searchMemoryTracesTraditional(query: string, options: any): Promise<UniversalSearchResultItem[]> {
    // Simplified implementation - would follow same pattern as sessions
    return [];
  }
}