/**
 * HnswResultProcessor - Handles HNSW search result processing and formatting
 * Follows Single Responsibility Principle by focusing only on result processing
 * Standardizes result format across all search services
 */

import { logger } from '../../../../utils/logger';
import { DatabaseItem } from '../../../providers/chroma/services/FilterEngine';
import { ItemWithDistance } from '../search/HnswSearchEngine';
import { TFile } from 'obsidian';

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  score: number;
  searchMethod: 'semantic';
  metadata: {
    filePath: string;
    similarity: number;
    fileId: string;
    timestamp: number;
  };
  content?: string;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  includeContent?: boolean;
  snippetLength?: number;
}

export interface ResultProcessingStats {
  totalResults: number;
  filteredResults: number;
  avgSimilarity: number;
  minSimilarity: number;
  maxSimilarity: number;
  processingTimeMs: number;
}

export class HnswResultProcessor {
  // No initialization needed - stateless processor

  /**
   * Process and format HNSW search results
   * @param results Raw HNSW search results
   * @param options Processing options
   * @returns Formatted search results with statistics
   */
  processSearchResults(
    results: ItemWithDistance[],
    options: SearchOptions = {}
  ): {
    results: SearchResult[];
    stats: ResultProcessingStats;
  } {
    const startTime = Date.now();
    const {
      threshold = 0.7,
      includeContent = false,
      snippetLength = 300,
    } = options;

    if (results.length === 0) {
      return {
        results: [],
        stats: this.createEmptyStats(startTime),
      };
    }

    try {
      // Convert distances to similarities and filter by threshold
      const similarityResults = results.map(({ item, distance }) => ({
        item,
        similarity: this.convertDistanceToSimilarity(distance),
      }));

      // Filter by threshold
      const filteredResults = similarityResults.filter(
        ({ similarity }) => similarity >= threshold
      );

      // Format results
      const formattedResults = filteredResults.map(({ item, similarity }) =>
        this.formatSearchResult(item, similarity, includeContent, snippetLength)
      );

      // Sort by similarity descending
      formattedResults.sort((a, b) => b.score - a.score);

      // Calculate statistics
      const similarities = filteredResults.map(r => r.similarity);
      const stats = this.calculateStats(
        results.length,
        filteredResults.length,
        similarities,
        startTime
      );

      logger.systemLog(
        `Processed ${results.length} results, ${filteredResults.length} after filtering`,
        'HnswResultProcessor'
      );

      return {
        results: formattedResults,
        stats,
      };
    } catch (error) {
      logger.systemError(
        new Error(`Result processing failed: ${error instanceof Error ? error.message : String(error)}`),
        'HnswResultProcessor'
      );

      return {
        results: [],
        stats: this.createEmptyStats(startTime),
      };
    }
  }

  /**
   * Process results - compatibility method for HnswSearchService
   * @param results Raw HNSW search results or formatted results
   * @param options Processing options
   * @returns Formatted search results
   */
  processResults(
    results: ItemWithDistance[] | any,
    options: SearchOptions = {}
  ): SearchResult[] {
    // If results is already a SearchResult from SearchEngine, extract the items
    if (results && typeof results === 'object' && 'items' in results) {
      return this.processSearchResults(results.items, options).results;
    }

    // If it's an array of ItemWithDistance, process normally
    if (Array.isArray(results)) {
      return this.processSearchResults(results, options).results;
    }

    // Empty results
    return [];
  }

  /**
   * Process results for unified search integration
   * @param results Raw HNSW results
   * @param filteredFiles Optional file filter
   * @param options Search options
   * @returns Processed results compatible with unified search
   */
  processForUnifiedSearch(
    results: ItemWithDistance[],
    filteredFiles?: TFile[],
    options: SearchOptions = {}
  ): SearchResult[] {
    const { results: formattedResults } = this.processSearchResults(results, options);

    // If we have filtered files, only return results for those files
    if (filteredFiles && filteredFiles.length > 0) {
      const allowedPaths = new Set(filteredFiles.map(f => f.path));
      return formattedResults.filter(result => 
        allowedPaths.has(result.metadata.filePath)
      );
    }

    return formattedResults;
  }

  /**
   * Format a single search result
   * @param item Database item
   * @param similarity Similarity score
   * @param includeContent Whether to include full content
   * @param snippetLength Maximum snippet length
   * @returns Formatted search result
   */
  private formatSearchResult(
    item: DatabaseItem,
    similarity: number,
    includeContent: boolean,
    snippetLength: number
  ): SearchResult {
    const result: SearchResult = {
      id: item.id,
      title: this.extractTitle(item),
      snippet: this.createSnippet(item.document || '', snippetLength),
      score: similarity,
      searchMethod: 'semantic' as const,
      metadata: {
        filePath: this.extractFilePath(item),
        similarity,
        fileId: item.id,
        timestamp: Date.now(),
      },
    };

    if (includeContent && item.document) {
      result.content = item.document;
    }

    return result;
  }

  /**
   * Extract title from database item
   * @param item Database item
   * @returns Title string
   */
  private extractTitle(item: DatabaseItem): string {
    // Try to get title from metadata first
    if (item.metadata?.fileName) {
      return item.metadata.fileName;
    }

    if (item.metadata?.title) {
      return item.metadata.title;
    }

    // Extract from file path
    const filePath = this.extractFilePath(item);
    const fileName = filePath.split('/').pop() || filePath;
    
    // Remove file extension for cleaner title
    return fileName.replace(/\.[^/.]+$/, '');
  }

  /**
   * Extract file path from database item
   * @param item Database item
   * @returns File path
   */
  private extractFilePath(item: DatabaseItem): string {
    return item.metadata?.filePath || item.id;
  }

  /**
   * Create snippet from content
   * @param content Full content
   * @param maxLength Maximum snippet length
   * @returns Snippet text
   */
  private createSnippet(content: string, maxLength: number): string {
    if (!content || content.length === 0) {
      return '';
    }

    if (content.length <= maxLength) {
      return content.trim();
    }

    // Try to break at sentence boundary if possible
    const truncated = content.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    // Use sentence boundary if it's reasonable (not too short)
    if (lastSentenceEnd > maxLength * 0.6) {
      return truncated.substring(0, lastSentenceEnd + 1).trim();
    }

    // Break at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace).trim() + '...';
    }

    // Fallback to hard truncation
    return truncated.trim() + '...';
  }

  /**
   * Convert HNSW distance to similarity score
   * @param distance HNSW distance (cosine distance)
   * @returns Similarity score (0-1, higher is better)
   */
  private convertDistanceToSimilarity(distance: number): number {
    // For cosine distance, similarity = 1 - distance
    // Clamp to ensure valid range
    return Math.max(0, Math.min(1, 1 - distance));
  }

  /**
   * Calculate processing statistics
   * @param totalResults Total number of raw results
   * @param filteredResults Number of results after filtering
   * @param similarities Array of similarity scores
   * @param startTime Processing start time
   * @returns Processing statistics
   */
  private calculateStats(
    totalResults: number,
    filteredResults: number,
    similarities: number[],
    startTime: number
  ): ResultProcessingStats {
    const processingTimeMs = Date.now() - startTime;

    if (similarities.length === 0) {
      return {
        totalResults,
        filteredResults,
        avgSimilarity: 0,
        minSimilarity: 0,
        maxSimilarity: 0,
        processingTimeMs,
      };
    }

    const avgSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
    const minSimilarity = Math.min(...similarities);
    const maxSimilarity = Math.max(...similarities);

    return {
      totalResults,
      filteredResults,
      avgSimilarity,
      minSimilarity,
      maxSimilarity,
      processingTimeMs,
    };
  }

  /**
   * Create empty statistics
   * @param startTime Processing start time
   * @returns Empty statistics
   */
  private createEmptyStats(startTime: number): ResultProcessingStats {
    return {
      totalResults: 0,
      filteredResults: 0,
      avgSimilarity: 0,
      minSimilarity: 0,
      maxSimilarity: 0,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Enhance snippet with query highlighting
   * @param snippet Original snippet
   * @param query Search query
   * @returns Enhanced snippet with highlighting markers
   */
  enhanceSnippetWithHighlighting(snippet: string, query: string): string {
    if (!query || !snippet) {
      return snippet;
    }

    try {
      // Simple highlighting - wrap exact matches with markers
      const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
      let enhancedSnippet = snippet;

      queryWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        enhancedSnippet = enhancedSnippet.replace(regex, `**${word}**`);
      });

      return enhancedSnippet;
    } catch (error) {
      // If highlighting fails, return original snippet
      logger.systemWarn(
        `Snippet highlighting failed: ${error instanceof Error ? error.message : String(error)}`,
        'HnswResultProcessor'
      );
      return snippet;
    }
  }

  /**
   * Group results by file path
   * @param results Search results
   * @returns Results grouped by file path
   */
  groupResultsByFile(results: SearchResult[]): Map<string, SearchResult[]> {
    const grouped = new Map<string, SearchResult[]>();

    results.forEach(result => {
      const filePath = result.metadata.filePath;
      if (!grouped.has(filePath)) {
        grouped.set(filePath, []);
      }
      grouped.get(filePath)!.push(result);
    });

    return grouped;
  }

  /**
   * Deduplicate results by file path, keeping the best score
   * @param results Search results
   * @returns Deduplicated results
   */
  deduplicateByFile(results: SearchResult[]): SearchResult[] {
    const fileMap = new Map<string, SearchResult>();

    results.forEach(result => {
      const filePath = result.metadata.filePath;
      const existing = fileMap.get(filePath);

      if (!existing || result.score > existing.score) {
        fileMap.set(filePath, result);
      }
    });

    return Array.from(fileMap.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Filter results by similarity threshold
   * @param results Search results
   * @param threshold Minimum similarity threshold
   * @returns Filtered results
   */
  filterByThreshold(results: SearchResult[], threshold: number): SearchResult[] {
    return results.filter(result => result.score >= threshold);
  }

  /**
   * Boost results based on metadata
   * @param results Search results
   * @param boostFactors Boost configuration
   * @returns Results with adjusted scores
   */
  applyMetadataBoosts(
    results: SearchResult[],
    boostFactors: {
      recentFiles?: number; // Boost factor for recently modified files
      titleMatches?: number; // Boost factor for title matches
      exactMatches?: number; // Boost factor for exact query matches
    }
  ): SearchResult[] {
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    return results.map(result => {
      let boostedScore = result.score;

      // Recent file boost
      if (boostFactors.recentFiles && result.metadata.timestamp) {
        const age = now - result.metadata.timestamp;
        if (age < oneWeek) {
          const recencyFactor = 1 - (age / oneWeek);
          boostedScore *= (1 + (boostFactors.recentFiles * recencyFactor));
        }
      }

      // Title match boost (basic implementation)
      if (boostFactors.titleMatches) {
        // This would require the original query to implement properly
        // For now, we'll apply a small boost to shorter titles (often more specific)
        if (result.title.length < 50) {
          boostedScore *= (1 + boostFactors.titleMatches * 0.1);
        }
      }

      // Ensure score doesn't exceed 1.0
      boostedScore = Math.min(1.0, boostedScore);

      return {
        ...result,
        score: boostedScore,
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Get result quality metrics
   * @param results Search results
   * @returns Quality metrics
   */
  getResultQualityMetrics(results: SearchResult[]): {
    scoreDistribution: {
      excellent: number; // > 0.9
      good: number; // 0.7-0.9
      fair: number; // 0.5-0.7
      poor: number; // < 0.5
    };
    avgScore: number;
    scoreVariance: number;
  } {
    if (results.length === 0) {
      return {
        scoreDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
        avgScore: 0,
        scoreVariance: 0,
      };
    }

    const scores = results.map(r => r.score);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;

    const distribution = {
      excellent: scores.filter(s => s > 0.9).length,
      good: scores.filter(s => s > 0.7 && s <= 0.9).length,
      fair: scores.filter(s => s > 0.5 && s <= 0.7).length,
      poor: scores.filter(s => s <= 0.5).length,
    };

    return {
      scoreDistribution: distribution,
      avgScore,
      scoreVariance: variance,
    };
  }
}