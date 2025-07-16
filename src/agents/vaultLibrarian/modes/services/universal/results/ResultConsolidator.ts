/**
 * ResultConsolidator - Handles result consolidation by file
 * Follows Single Responsibility Principle by focusing only on result consolidation
 */

import { TFile } from 'obsidian';
import { UniversalSearchResultItem } from '../../../../types';

export interface SearchSnippet {
  content: string;
  searchMethod: 'semantic' | 'keyword' | 'fuzzy' | 'exact' | 'hybrid';
  score: number;
}

export interface ConsolidatedSearchResult {
  filePath: string;
  frontmatter?: Record<string, any>;
  snippets: SearchSnippet[];
  connectedNotes: string[];
  bestScore: number;
  searchMethods: string[];
  metadata: Record<string, any>;
}

export interface ConsolidationResult {
  success: boolean;
  error?: string;
  results?: ConsolidatedSearchResult[];
}

/**
 * Service responsible for consolidating search results by file
 * Follows SRP by focusing only on result consolidation operations
 */
export class ResultConsolidator {
  /**
   * Consolidate search results by file path
   */
  async consolidateResultsByFile(
    results: UniversalSearchResultItem[],
    connectedNotesMap?: Map<string, string[]>
  ): Promise<ConsolidationResult> {
    try {
      if (!results || results.length === 0) {
        return {
          success: true,
          results: []
        };
      }

      // Group results by file path
      const fileGroups = new Map<string, UniversalSearchResultItem[]>();
      
      for (const result of results) {
        const filePath = result.metadata?.filePath || result.id;
        if (!fileGroups.has(filePath)) {
          fileGroups.set(filePath, []);
        }
        fileGroups.get(filePath)!.push(result);
      }

      // Consolidate each file group
      const consolidatedResults: ConsolidatedSearchResult[] = [];
      
      for (const [filePath, fileResults] of fileGroups) {
        const consolidated = this.consolidateFileResults(filePath, fileResults, connectedNotesMap);
        consolidatedResults.push(consolidated);
      }

      // Sort by best score
      consolidatedResults.sort((a, b) => b.bestScore - a.bestScore);

      return {
        success: true,
        results: consolidatedResults
      };
    } catch (error) {
      return {
        success: false,
        error: `Result consolidation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Consolidate results for a single file
   */
  private consolidateFileResults(
    filePath: string,
    results: UniversalSearchResultItem[],
    connectedNotesMap?: Map<string, string[]>
  ): ConsolidatedSearchResult {
    // Extract snippets from results
    const snippets: SearchSnippet[] = results.map(result => ({
      content: result.snippet || '',
      searchMethod: result.searchMethod,
      score: result.score
    }));

    // Remove duplicate snippets
    const uniqueSnippets = this.removeDuplicateSnippets(snippets);

    // Get the best score
    const bestScore = Math.max(...results.map(r => r.score));

    // Get unique search methods
    const searchMethods = [...new Set(results.map(r => r.searchMethod))];

    // Combine metadata
    const metadata = this.combineMetadata(results);

    // Get connected notes
    const connectedNotes = connectedNotesMap?.get(filePath) || [];

    // Extract frontmatter if available
    const frontmatter = this.extractFrontmatter(results);

    return {
      filePath,
      frontmatter,
      snippets: uniqueSnippets,
      connectedNotes,
      bestScore,
      searchMethods,
      metadata
    };
  }

  /**
   * Remove duplicate snippets
   */
  private removeDuplicateSnippets(snippets: SearchSnippet[]): SearchSnippet[] {
    const seen = new Set<string>();
    const unique: SearchSnippet[] = [];

    for (const snippet of snippets) {
      const key = snippet.content.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        unique.push(snippet);
      }
    }

    // Sort by score
    return unique.sort((a, b) => b.score - a.score);
  }

  /**
   * Combine metadata from multiple results
   */
  private combineMetadata(results: UniversalSearchResultItem[]): Record<string, any> {
    const combined: Record<string, any> = {};

    for (const result of results) {
      if (result.metadata) {
        Object.assign(combined, result.metadata);
      }
    }

    return combined;
  }

  /**
   * Extract frontmatter from results
   */
  private extractFrontmatter(results: UniversalSearchResultItem[]): Record<string, any> | undefined {
    for (const result of results) {
      if (result.metadata?.frontmatter) {
        return result.metadata.frontmatter;
      }
    }
    return undefined;
  }

  /**
   * Merge search results from different strategies
   */
  async mergeSearchResults(
    contentResults: UniversalSearchResultItem[],
    fileResults: UniversalSearchResultItem[],
    tagResults: UniversalSearchResultItem[],
    propertyResults: UniversalSearchResultItem[]
  ): Promise<ConsolidationResult> {
    try {
      // Combine all results
      const allResults = [
        ...contentResults,
        ...fileResults,
        ...tagResults,
        ...propertyResults
      ];

      // Remove duplicates based on ID
      const uniqueResults = this.removeDuplicateResults(allResults);

      // Consolidate by file
      return await this.consolidateResultsByFile(uniqueResults);
    } catch (error) {
      return {
        success: false,
        error: `Result merging failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Remove duplicate results based on ID
   */
  private removeDuplicateResults(results: UniversalSearchResultItem[]): UniversalSearchResultItem[] {
    const seen = new Set<string>();
    const unique: UniversalSearchResultItem[] = [];

    for (const result of results) {
      if (!seen.has(result.id)) {
        seen.add(result.id);
        unique.push(result);
      }
    }

    return unique;
  }

  /**
   * Apply diversity penalty to avoid too many results from the same file
   */
  applyDiversityPenalty(
    results: ConsolidatedSearchResult[],
    diversityPenalty = 0.1
  ): ConsolidatedSearchResult[] {
    // Track file count and apply penalty
    const fileCount = new Map<string, number>();
    
    return results.map(result => {
      const currentCount = fileCount.get(result.filePath) || 0;
      fileCount.set(result.filePath, currentCount + 1);
      
      // Apply penalty based on how many results we've seen from this file
      const penalty = currentCount * diversityPenalty;
      const adjustedScore = Math.max(0, result.bestScore - penalty);
      
      return {
        ...result,
        bestScore: adjustedScore
      };
    }).sort((a, b) => b.bestScore - a.bestScore);
  }

  /**
   * Filter results by minimum score
   */
  filterByMinScore(
    results: ConsolidatedSearchResult[],
    minScore = 0.1
  ): ConsolidatedSearchResult[] {
    return results.filter(result => result.bestScore >= minScore);
  }

  /**
   * Get consolidation statistics
   */
  getConsolidationStatistics(
    originalResults: UniversalSearchResultItem[],
    consolidatedResults: ConsolidatedSearchResult[]
  ): {
    originalCount: number;
    consolidatedCount: number;
    averageResultsPerFile: number;
    searchMethodsCovered: string[];
  } {
    const searchMethods = new Set<string>();
    let totalSnippets = 0;

    for (const result of consolidatedResults) {
      result.searchMethods.forEach(method => searchMethods.add(method));
      totalSnippets += result.snippets.length;
    }

    return {
      originalCount: originalResults.length,
      consolidatedCount: consolidatedResults.length,
      averageResultsPerFile: consolidatedResults.length > 0 ? totalSnippets / consolidatedResults.length : 0,
      searchMethodsCovered: Array.from(searchMethods)
    };
  }
}