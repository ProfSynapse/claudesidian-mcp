import { Plugin } from 'obsidian';
import { WorkspaceService } from '../../../../database/services/WorkspaceService';
import { ProjectWorkspace } from '../../../../database/workspace-types';
import { UniversalSearchResultItem } from '../../types';
import { SemanticFallbackService } from '../services/SemanticFallbackService';

/**
 * Strategy for searching workspaces using semantic and/or traditional search
 */
export class WorkspaceSearchStrategy {
  constructor(
    private plugin: Plugin,
    private workspaceService?: WorkspaceService,
    private semanticFallback: SemanticFallbackService = new SemanticFallbackService()
  ) {}

  /**
   * Search workspaces with intelligent fallback
   */
  async search(
    query: string,
    options: {
      limit?: number;
      paths?: string[];
      includeContent?: boolean;
      semanticThreshold?: number;
      forceSemanticSearch?: boolean;
    } = {}
  ): Promise<UniversalSearchResultItem[]> {
    if (!this.workspaceService) {
      console.warn('WorkspaceService not available for workspace search');
      return [];
    }

    const useSemanticSearch = this.semanticFallback.shouldUseSemanticSearch('workspaces', options.forceSemanticSearch);
    
    try {
      if (useSemanticSearch) {
        return await this.searchSemantic(query, options);
      } else {
        return await this.searchTraditional(query, options);
      }
    } catch (error) {
      console.warn('Workspace search failed, falling back:', error);
      
      // If semantic search failed, try traditional
      if (useSemanticSearch) {
        return await this.searchTraditional(query, options);
      }
      
      // If traditional search failed, return empty results
      return [];
    }
  }

  /**
   * Semantic search using workspace collection vector search
   */
  private async searchSemantic(
    query: string,
    options: {
      limit?: number;
      paths?: string[];
      includeContent?: boolean;
      semanticThreshold?: number;
    }
  ): Promise<UniversalSearchResultItem[]> {
    if (!this.workspaceService) {
      throw new Error('WorkspaceService not available for semantic search');
    }

    // Try to use vector search on workspace collection if available
    // For now, fall back to traditional search since we don't have direct vector search on workspaces
    // This would be enhanced when workspace collection supports vector search
    return await this.searchTraditional(query, options);
  }

  /**
   * Traditional search through workspace text content
   */
  private async searchTraditional(
    query: string,
    options: {
      limit?: number;
      paths?: string[];
      includeContent?: boolean;
    }
  ): Promise<UniversalSearchResultItem[]> {
    if (!this.workspaceService) {
      throw new Error('WorkspaceService not available for traditional search');
    }

    try {
      // Get all workspaces
      const workspaces = await this.workspaceService.getWorkspaces();
      const results: UniversalSearchResultItem[] = [];
      const queryLower = query.toLowerCase();

      for (const workspace of workspaces) {
        const score = this.calculateWorkspaceRelevance(workspace, queryLower);
        
        if (score > 0) {
          // Apply path filtering if specified
          if (options.paths && options.paths.length > 0) {
            const workspacePath = workspace.rootFolder || workspace.path?.join('/') || '';
            const matchesPath = options.paths.some(path => 
              workspacePath.startsWith(path) || 
              workspace.path?.some(p => p.startsWith(path))
            );
            
            if (!matchesPath) continue;
          }

          results.push({
            id: workspace.id,
            title: workspace.name,
            snippet: this.createWorkspaceSnippet(workspace, query),
            score,
            searchMethod: 'fuzzy' as const,
            metadata: {
              workspaceId: workspace.id,
              hierarchyType: workspace.hierarchyType,
              status: workspace.status,
              rootFolder: workspace.rootFolder,
              created: workspace.created,
              lastAccessed: workspace.lastAccessed,
              childCount: workspace.childWorkspaces?.length || 0
            },
            content: options.includeContent ? this.getWorkspaceContent(workspace) : undefined
          });
        }
      }

      // Sort by score and limit results
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, options.limit || 10);
    } catch (error) {
      console.error('Failed to search workspaces:', error);
      return [];
    }
  }

  /**
   * Calculate relevance score for a workspace
   */
  private calculateWorkspaceRelevance(workspace: ProjectWorkspace, queryLower: string): number {
    let score = 0;
    const maxScore = 100;

    // Name match (highest weight)
    if (workspace.name.toLowerCase().includes(queryLower)) {
      score += 40;
      if (workspace.name.toLowerCase() === queryLower) {
        score += 20; // Exact match bonus
      }
    }

    // Description match
    if (workspace.description?.toLowerCase().includes(queryLower)) {
      score += 20;
    }

    // Project plan match
    if (workspace.projectPlan?.toLowerCase().includes(queryLower)) {
      score += 15;
    }

    // Root folder/path match
    if (workspace.rootFolder?.toLowerCase().includes(queryLower)) {
      score += 10;
    }
    if (workspace.path?.some(p => p.toLowerCase().includes(queryLower))) {
      score += 10;
    }

    // Checkpoint descriptions match
    if (workspace.checkpoints?.some(cp => cp.description.toLowerCase().includes(queryLower))) {
      score += 5;
    }

    // Normalize score to 0-1 range
    return Math.min(score / maxScore, 1.0);
  }

  /**
   * Create a snippet for workspace search results
   */
  private createWorkspaceSnippet(workspace: ProjectWorkspace, query: string): string {
    const parts: string[] = [];
    
    if (workspace.description) {
      parts.push(workspace.description);
    }
    
    if (workspace.projectPlan) {
      parts.push(`Plan: ${workspace.projectPlan}`);
    }
    
    if (workspace.status) {
      parts.push(`Status: ${workspace.status}`);
    }
    
    const snippet = parts.join(' | ');
    return snippet.length > 200 ? snippet.substring(0, 200) + '...' : snippet;
  }

  /**
   * Get full workspace content for search results
   */
  private getWorkspaceContent(workspace: ProjectWorkspace): string {
    const content: string[] = [];
    
    content.push(`Name: ${workspace.name}`);
    
    if (workspace.description) {
      content.push(`Description: ${workspace.description}`);
    }
    
    if (workspace.projectPlan) {
      content.push(`Project Plan: ${workspace.projectPlan}`);
    }
    
    content.push(`Type: ${workspace.hierarchyType}`);
    content.push(`Status: ${workspace.status}`);
    content.push(`Root Folder: ${workspace.rootFolder}`);
    
    if (workspace.path && workspace.path.length > 0) {
      content.push(`Path: ${workspace.path.join(' / ')}`);
    }
    
    if (workspace.checkpoints && workspace.checkpoints.length > 0) {
      content.push('Checkpoints:');
      workspace.checkpoints.forEach((cp, index) => {
        content.push(`  ${index + 1}. ${cp.description} (${cp.completed ? 'Complete' : 'Pending'})`);
      });
    }
    
    return content.join('\\n');
  }
}