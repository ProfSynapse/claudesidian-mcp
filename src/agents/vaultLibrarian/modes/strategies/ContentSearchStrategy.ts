import { Plugin, TFile } from 'obsidian';
import { SemanticSearchService } from '../../../../database/services/SemanticSearchService';
import { EmbeddingService } from '../../../../database/services/EmbeddingService';
import { UniversalSearchResultItem, GraphBoostOptions } from '../../types';
import { SemanticFallbackService } from '../services/SemanticFallbackService';

/**
 * Strategy for searching file content using semantic and/or traditional search
 * Updated to use SemanticSearchService instead of ChromaSearchService
 */
export class ContentSearchStrategy {
  constructor(
    private plugin: Plugin,
    private semanticSearchService?: SemanticSearchService,
    private embeddingService?: EmbeddingService,
    private semanticFallback: SemanticFallbackService = new SemanticFallbackService(embeddingService)
  ) {}

  /**
   * Search file content with intelligent fallback
   */
  async search(
    query: string,
    options: {
      limit?: number;
      paths?: string[];
      includeContent?: boolean;
      semanticThreshold?: number;
      forceSemanticSearch?: boolean;
      graphBoost?: GraphBoostOptions;
    } = {}
  ): Promise<UniversalSearchResultItem[]> {
    const useSemanticSearch = this.semanticFallback.shouldUseSemanticSearch('content', options.forceSemanticSearch);
    
    try {
      if (useSemanticSearch && this.semanticSearchService) {
        return await this.searchSemantic(query, options);
      } else {
        return await this.searchTraditional(query, options);
      }
    } catch (error) {
      console.warn('Content search failed, falling back:', error);
      
      // If semantic search failed, try traditional
      if (useSemanticSearch) {
        return await this.searchTraditional(query, options);
      }
      
      // If traditional search failed, return empty results
      return [];
    }
  }

  /**
   * Semantic search using vector similarity
   */
  private async searchSemantic(
    query: string,
    options: {
      limit?: number;
      paths?: string[];
      includeContent?: boolean;
      semanticThreshold?: number;
      graphBoost?: GraphBoostOptions;
    }
  ): Promise<UniversalSearchResultItem[]> {
    if (!this.semanticSearchService) {
      throw new Error('Semantic search service not available for semantic search');
    }

    // Use semanticSearch to support graph boost
    const searchResult = await this.semanticSearchService.semanticSearch(query, {
      limit: options.limit || 10,
      threshold: options.semanticThreshold || 0.7,
      useGraphBoost: options.graphBoost?.useGraphBoost,
      graphBoostFactor: options.graphBoost?.graphBoostFactor
    });

    const searchResults = searchResult.success && searchResult.matches ? 
      searchResult.matches.map(match => ({
        file: {
          filePath: match.filePath,
          id: match.metadata?.fileId || '',
          timestamp: match.metadata?.timestamp || Date.now()
        },
        similarity: match.similarity
      })) : [];

    const results: UniversalSearchResultItem[] = [];
    for (const result of searchResults) {
      const item: UniversalSearchResultItem = {
        id: result.file.filePath,
        title: this.getFileTitle(result.file.filePath),
        snippet: this.createSnippet(result.file.filePath, query), // Use filePath for now
        score: result.similarity || 0,
        searchMethod: 'semantic' as const,
        metadata: {
          filePath: result.file.filePath,
          similarity: result.similarity,
          fileId: result.file.id,
          timestamp: result.file.timestamp
        }
      };
      
      if (options.includeContent) {
        const fullContent = await this.getFileContent(result.file.filePath);
        item.content = fullContent ? this.createSnippet(fullContent, query, 400) : undefined;
      }
      
      results.push(item);
    }
    
    return results;
  }

  /**
   * Traditional search using Obsidian's fuzzy search
   */
  private async searchTraditional(
    query: string,
    options: {
      limit?: number;
      paths?: string[];
      includeContent?: boolean;
      graphBoost?: GraphBoostOptions;
    }
  ): Promise<UniversalSearchResultItem[]> {
    const files = this.plugin.app.vault.getMarkdownFiles();
    let filteredFiles = files;

    // Apply path filtering if specified
    if (options.paths && options.paths.length > 0) {
      filteredFiles = files.filter(file => 
        options.paths!.some(path => file.path.startsWith(path))
      );
    }

    const results: UniversalSearchResultItem[] = [];

    for (const file of filteredFiles) {
      try {
        const content = await this.plugin.app.vault.cachedRead(file);
        const searchScore = this.calculateRelevanceScore(content, query, file.path);

        if (searchScore > 0.1) { // Minimum relevance threshold
          results.push({
            id: file.path,
            title: this.getFileTitle(file.path),
            snippet: this.createSnippet(content, query),
            score: Math.min(searchScore, 1.0), // Normalize to 0-1
            searchMethod: 'fuzzy' as const,
            metadata: {
              filePath: file.path,
              fileSize: file.stat.size,
              modified: file.stat.mtime
            },
            content: options.includeContent ? this.createSnippet(content, query, 400) : undefined
          });
        }
      } catch (error) {
        console.warn(`Failed to search file ${file.path}:`, error);
      }
    }

    // Sort by score and limit results
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, options.limit || 10);
  }

  /**
   * Extract file title from path
   */
  private getFileTitle(filePath: string): string {
    const fileName = filePath.split('/').pop() || filePath;
    return fileName.replace(/\\.md$/, '');
  }

  /**
   * Calculate relevance score for content search
   */
  private calculateRelevanceScore(content: string, query: string, filePath: string): number {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    const fileTitle = this.getFileTitle(filePath).toLowerCase();
    
    let score = 0;
    
    // Title match (highest weight)
    if (fileTitle.includes(queryLower)) {
      score += 2.0;
      if (fileTitle === queryLower) {
        score += 1.0; // Exact title match bonus
      }
    }
    
    // Content match
    const contentMatches = (contentLower.match(new RegExp(queryLower, 'g')) || []).length;
    score += contentMatches * 0.5;
    
    // Word boundary matches (more important than partial matches)
    const wordBoundaryMatches = (contentLower.match(new RegExp(`\\b${queryLower}\\b`, 'g')) || []).length;
    score += wordBoundaryMatches * 0.8;
    
    // Length penalty for very long content (normalize by content length)
    const lengthPenalty = Math.min(content.length / 10000, 1.0);
    score = score / (1 + lengthPenalty * 0.3);
    
    // Normalize to 0-1 range
    return Math.min(score / 10, 1.0);
  }

  /**
   * Create a content snippet highlighting the query
   */
  private createSnippet(content: string, query: string, maxLength: number = 200): string {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    
    // Find the best match position
    let bestPos = contentLower.indexOf(queryLower);
    if (bestPos === -1) {
      // If exact match not found, look for individual words
      const queryWords = query.split(/\\s+/);
      const positions = queryWords.map(word => contentLower.indexOf(word.toLowerCase())).filter(pos => pos !== -1);
      bestPos = positions.length > 0 ? Math.min(...positions) : 0;
    }

    // Calculate snippet bounds
    const snippetStart = Math.max(0, bestPos - maxLength / 2);
    const snippetEnd = Math.min(content.length, snippetStart + maxLength);
    
    let snippet = content.slice(snippetStart, snippetEnd).trim();
    
    // Add ellipsis if truncated
    if (snippetStart > 0) snippet = '...' + snippet;
    if (snippetEnd < content.length) snippet = snippet + '...';
    
    return snippet;
  }

  /**
   * Get file content by path
   */
  private async getFileContent(filePath: string): Promise<string | undefined> {
    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (file && 'stat' in file) { // Check if it's a TFile
        return await this.plugin.app.vault.cachedRead(file as any);
      }
      return undefined;
    } catch (error) {
      console.warn(`Failed to read file content for ${filePath}:`, error);
      return undefined;
    }
  }
}