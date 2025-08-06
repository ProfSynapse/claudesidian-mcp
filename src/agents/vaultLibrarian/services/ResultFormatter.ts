/**
 * Result Formatter
 * 
 * Location: src/agents/vaultLibrarian/services/ResultFormatter.ts
 * Purpose: Result highlighting, metadata processing, response formatting
 * Used by: SearchMemoryMode for formatting search results and building summaries
 */

import {
  MemorySearchResult,
  FormattedMemoryResult,
  FormatOptions,
  MemorySortOption,
  MemoryGroupOption,
  GroupedMemoryResults,
  MemoryResultGroup,
  GroupStatistics,
  PaginatedMemoryResults,
  PaginationOptions,
  MemoryResultSummary,
  SearchHighlight,
  HighlightOptions,
  FormatContext,
  ResultFormatterConfiguration,
  MemoryType
} from '../../../types/memory/MemorySearchTypes';

export interface ResultFormatterInterface {
  format(results: MemorySearchResult[], options: FormatOptions): Promise<FormattedMemoryResult[]>;
  groupResults(results: MemorySearchResult[], groupBy: MemoryGroupOption): Promise<GroupedMemoryResults>;
  sortResults(results: MemorySearchResult[], sortBy: MemorySortOption): MemorySearchResult[];
  buildSummary(results: MemorySearchResult[]): Promise<MemoryResultSummary>;
  paginate(results: MemorySearchResult[], pagination: PaginationOptions): PaginatedMemoryResults;
  addHighlights(results: MemorySearchResult[], query: string, options?: HighlightOptions): Promise<MemorySearchResult[]>;
  getConfiguration(): ResultFormatterConfiguration;
  updateConfiguration(config: Partial<ResultFormatterConfiguration>): void;
}

export class ResultFormatter implements ResultFormatterInterface {
  private configuration: ResultFormatterConfiguration;

  constructor(config?: Partial<ResultFormatterConfiguration>) {
    this.configuration = {
      maxHighlightLength: 200,
      contextLength: 50,
      enableToolCallEnhancement: true,
      dateFormat: 'YYYY-MM-DD',
      timestampFormat: 'YYYY-MM-DD HH:mm:ss',
      ...config
    };
  }

  /**
   * Format search results according to options
   */
  async format(results: MemorySearchResult[], options: FormatOptions): Promise<FormattedMemoryResult[]> {
    const formatted: FormattedMemoryResult[] = [];

    for (const result of results) {
      try {
        const formattedResult = await this.formatSingleResult(result, options);
        formatted.push(formattedResult);
      } catch (error) {
        console.warn('[ResultFormatter] Failed to format result:', error);
      }
    }

    return formatted;
  }

  /**
   * Group results by specified criteria
   */
  async groupResults(results: MemorySearchResult[], groupBy: MemoryGroupOption): Promise<GroupedMemoryResults> {
    const groups = new Map<string, MemorySearchResult[]>();

    // Group results by primary criteria
    for (const result of results) {
      const groupKey = this.getGroupKey(result, groupBy.groupBy);
      const existingGroup = groups.get(groupKey) || [];
      existingGroup.push(result);
      groups.set(groupKey, existingGroup);
    }

    // Apply sub-grouping if specified
    if (groupBy.subGroupBy) {
      const subGroupedResults = new Map<string, MemorySearchResult[]>();
      
      groups.forEach((groupResults, primaryKey) => {
        const subGroups = new Map<string, MemorySearchResult[]>();
        
        for (const result of groupResults) {
          const subGroupKey = this.getGroupKey(result, groupBy.subGroupBy!);
          const combinedKey = `${primaryKey}:${subGroupKey}`;
          const existingSubGroup = subGroups.get(combinedKey) || [];
          existingSubGroup.push(result);
          subGroups.set(combinedKey, existingSubGroup);
        }
        
        subGroups.forEach((subResults, subKey) => {
          subGroupedResults.set(subKey, subResults);
        });
      });
      
      // Replace groups with sub-grouped results
      groups.clear();
      subGroupedResults.forEach((results, key) => {
        groups.set(key, results);
      });
    }

    // Convert to result format
    const resultGroups: MemoryResultGroup[] = [];
    groups.forEach((results, key) => {
      const totalScore = results.reduce((sum, r) => sum + r.score, 0);
      const averageScore = results.length > 0 ? totalScore / results.length : 0;

      resultGroups.push({
        key,
        displayName: this.getDisplayName(key, groupBy),
        results,
        count: results.length,
        totalScore,
        averageScore,
        metadata: this.buildGroupMetadata(results, key)
      });
    });

    // Sort groups by count (descending)
    resultGroups.sort((a, b) => b.count - a.count);

    // Calculate group statistics
    const groupStats = this.calculateGroupStatistics(resultGroups);

    return {
      groups: resultGroups,
      totalGroups: resultGroups.length,
      totalResults: results.length,
      groupedBy: groupBy,
      groupStats
    };
  }

  /**
   * Sort results by specified criteria
   */
  sortResults(results: MemorySearchResult[], sortBy: MemorySortOption): MemorySearchResult[] {
    return [...results].sort((a, b) => {
      let comparison = 0;

      switch (sortBy.field) {
        case 'score':
          comparison = b.score - a.score;
          break;
        
        case 'timestamp':
          const aTime = new Date(a.metadata.created).getTime();
          const bTime = new Date(b.metadata.created).getTime();
          comparison = bTime - aTime;
          break;
        
        case 'relevance':
          comparison = this.compareRelevance(a, b);
          break;
        
        default:
          comparison = 0;
      }

      return sortBy.direction === 'asc' ? -comparison : comparison;
    });
  }

  /**
   * Build result summary statistics
   */
  async buildSummary(results: MemorySearchResult[]): Promise<MemoryResultSummary> {
    const totalResults = results.length;
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const averageScore = totalResults > 0 ? totalScore / totalResults : 0;

    // Calculate type distribution
    const typeDistribution: Record<string, number> = {};
    let oldestTimestamp = new Date();
    let newestTimestamp = new Date(0);

    for (const result of results) {
      // Type distribution
      const type = result.type;
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;

      // Date range
      try {
        const timestamp = new Date(result.metadata.created);
        if (timestamp < oldestTimestamp) {
          oldestTimestamp = timestamp;
        }
        if (timestamp > newestTimestamp) {
          newestTimestamp = timestamp;
        }
      } catch (error) {
        // Ignore invalid dates
      }
    }

    return {
      totalResults,
      averageScore: Math.round(averageScore * 1000) / 1000,
      typeDistribution,
      dateRange: { 
        start: totalResults > 0 ? oldestTimestamp : new Date(), 
        end: totalResults > 0 ? newestTimestamp : new Date() 
      },
      executionTime: 0 // Set by caller
    };
  }

  /**
   * Apply result pagination
   */
  paginate(results: MemorySearchResult[], pagination: PaginationOptions): PaginatedMemoryResults {
    const { page, pageSize, totalItems } = pagination;
    const actualTotalItems = totalItems || results.length;
    const totalPages = Math.ceil(actualTotalItems / pageSize);
    
    const startIndex = page * pageSize;
    const endIndex = Math.min(startIndex + pageSize, results.length);
    const items = results.slice(startIndex, endIndex);

    return {
      items,
      page,
      pageSize,
      totalItems: actualTotalItems,
      totalPages,
      hasNextPage: page < totalPages - 1,
      hasPreviousPage: page > 0
    };
  }

  /**
   * Generate result highlights
   */
  async addHighlights(
    results: MemorySearchResult[], 
    query: string, 
    options: HighlightOptions = {}
  ): Promise<MemorySearchResult[]> {
    const {
      maxHighlights = 3,
      highlightLength = this.configuration.maxHighlightLength,
      caseSensitive = false,
      wholeWord = false
    } = options;

    return results.map(result => {
      const highlights = this.generateHighlights(result, query, {
        maxHighlights,
        highlightLength,
        caseSensitive,
        wholeWord
      });

      return {
        ...result,
        highlights
      } as MemorySearchResult & { highlights: SearchHighlight[] };
    });
  }

  /**
   * Get current configuration
   */
  getConfiguration(): ResultFormatterConfiguration {
    return { ...this.configuration };
  }

  /**
   * Update configuration
   */
  updateConfiguration(config: Partial<ResultFormatterConfiguration>): void {
    this.configuration = { ...this.configuration, ...config };
  }

  // Private helper methods

  private async formatSingleResult(result: MemorySearchResult, options: FormatOptions): Promise<FormattedMemoryResult> {
    const formatContext: FormatContext = {
      searchQuery: '', // Will be set by caller if needed
      resultType: result.type,
      timestamp: new Date()
    };

    // Generate formatted content
    const formattedContent = this.formatContent(result, options);
    
    // Generate preview
    const preview = this.generatePreview(result, options);
    
    // Format timestamp
    const formattedTimestamp = this.formatTimestamp(result.metadata.created);
    
    // Generate title and subtitle
    const title = this.generateTitle(result);
    const subtitle = this.generateSubtitle(result);
    
    // Format metadata
    const formattedMetadata = this.formatMetadata(result.metadata);
    
    // Generate highlights
    const highlights: SearchHighlight[] = [];

    return {
      original: result,
      formattedContent,
      preview,
      formattedTimestamp,
      title,
      subtitle,
      formattedMetadata,
      highlights,
      formatContext
    };
  }

  private formatContent(result: MemorySearchResult, options: FormatOptions): string {
    let content = result.highlight;

    // Apply length limits
    const maxLength = options.maxHighlightLength || this.configuration.maxHighlightLength;
    if (content.length > maxLength) {
      content = content.substring(0, maxLength - 3) + '...';
    }

    // Enhance tool call context if enabled
    if (this.configuration.enableToolCallEnhancement && 
        options.enhanceToolCallContext !== false &&
        result.type === MemoryType.TOOL_CALL) {
      content = this.enhanceToolCallContent(content, result);
    }

    return content;
  }

  private generatePreview(result: MemorySearchResult, options: FormatOptions): string {
    const previewLength = 100;
    const content = result.context.before + result.context.match + result.context.after;
    
    if (content.length <= previewLength) {
      return content;
    }
    
    return content.substring(0, previewLength - 3) + '...';
  }

  private formatTimestamp(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString(); // Could be customized based on configuration
    } catch (error) {
      return timestamp;
    }
  }

  private generateTitle(result: MemorySearchResult): string {
    switch (result.type) {
      case MemoryType.TOOL_CALL:
        return `${result.metadata.agent || 'Unknown'}.${result.metadata.mode || 'Unknown'}`;
      
      case MemoryType.SESSION:
        return `Session: ${result.metadata.sessionId || 'Unknown'}`;
      
      case MemoryType.STATE:
        return `State: ${result.id}`;
      
      case MemoryType.WORKSPACE:
        return `Workspace: ${result.metadata.workspaceId || 'Unknown'}`;
      
      case MemoryType.TRACE:
      default:
        return `Memory Trace: ${result.id}`;
    }
  }

  private generateSubtitle(result: MemorySearchResult): string | undefined {
    const metadata = result.metadata;
    const parts: string[] = [];

    if (metadata.activityType) {
      parts.push(metadata.activityType);
    }

    if (result.type === MemoryType.TOOL_CALL) {
      if (metadata.success !== undefined) {
        parts.push(metadata.success ? 'SUCCESS' : 'FAILED');
      }
      if (metadata.executionTime) {
        parts.push(`${metadata.executionTime}ms`);
      }
    }

    if (metadata.filesReferenced && metadata.filesReferenced.length > 0) {
      parts.push(`${metadata.filesReferenced.length} files`);
    }

    return parts.length > 0 ? parts.join(' • ') : undefined;
  }

  private formatMetadata(metadata: any): Record<string, string> {
    const formatted: Record<string, string> = {};

    // Always format basic fields
    if (metadata.created) {
      formatted['Created'] = this.formatTimestamp(metadata.created);
    }
    if (metadata.updated) {
      formatted['Updated'] = this.formatTimestamp(metadata.updated);
    }
    if (metadata.sessionId) {
      formatted['Session'] = metadata.sessionId;
    }
    if (metadata.workspaceId) {
      formatted['Workspace'] = metadata.workspaceId;
    }

    // Format type-specific fields
    if (metadata.agent && metadata.mode) {
      formatted['Tool'] = `${metadata.agent}.${metadata.mode}`;
    }
    if (metadata.executionTime) {
      formatted['Execution Time'] = `${metadata.executionTime}ms`;
    }
    if (metadata.success !== undefined) {
      formatted['Status'] = metadata.success ? 'Success' : 'Failed';
    }
    if (metadata.filesReferenced && metadata.filesReferenced.length > 0) {
      formatted['Files'] = metadata.filesReferenced.join(', ');
    }

    return formatted;
  }

  private enhanceToolCallContent(content: string, result: MemorySearchResult): string {
    const metadata = result.metadata;
    const prefix = `[${metadata.agent || 'Unknown'}.${metadata.mode || 'Unknown'}]`;
    const status = metadata.success ? 'SUCCESS' : 'FAILED';
    const timing = metadata.executionTime ? ` (${metadata.executionTime}ms)` : '';
    
    return `${prefix} ${content} [${status}${timing}]`;
  }

  private getGroupKey(result: MemorySearchResult, groupBy: string): string {
    switch (groupBy) {
      case 'type':
        return result.type;
      
      case 'session':
        return result.metadata.sessionId || 'No Session';
      
      case 'workspace':
        return result.metadata.workspaceId || 'No Workspace';
      
      case 'date':
        try {
          const date = new Date(result.metadata.created);
          return date.toISOString().split('T')[0]; // YYYY-MM-DD
        } catch {
          return 'Unknown Date';
        }
      
      case 'agent':
        return result.metadata.agent || 'No Agent';
      
      case 'mode':
        return result.metadata.mode || 'No Mode';
      
      case 'success':
        if (result.type === MemoryType.TOOL_CALL && result.metadata.success !== undefined) {
          return result.metadata.success ? 'Success' : 'Failed';
        }
        return 'N/A';
      
      default:
        return 'Other';
    }
  }

  private getDisplayName(key: string, groupBy: MemoryGroupOption): string {
    // Handle sub-grouped keys
    if (key.includes(':')) {
      const [primary, secondary] = key.split(':');
      return `${primary} → ${secondary}`;
    }
    
    return key;
  }

  private buildGroupMetadata(results: MemorySearchResult[], key: string): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    // Calculate group-specific statistics
    const scores = results.map(r => r.score);
    metadata.minScore = Math.min(...scores);
    metadata.maxScore = Math.max(...scores);
    metadata.scoreStdDev = this.calculateStandardDeviation(scores);
    
    // Type distribution within group
    const typeDistribution: Record<string, number> = {};
    for (const result of results) {
      typeDistribution[result.type] = (typeDistribution[result.type] || 0) + 1;
    }
    metadata.typeDistribution = typeDistribution;
    
    // Date range within group
    const timestamps = results.map(r => new Date(r.metadata.created).getTime()).filter(t => !isNaN(t));
    if (timestamps.length > 0) {
      metadata.dateRange = {
        start: new Date(Math.min(...timestamps)).toISOString(),
        end: new Date(Math.max(...timestamps)).toISOString()
      };
    }
    
    return metadata;
  }

  private calculateGroupStatistics(groups: MemoryResultGroup[]): GroupStatistics {
    if (groups.length === 0) {
      return {
        averageGroupSize: 0,
        largestGroupSize: 0,
        smallestGroupSize: 0,
        scoreDistribution: {}
      };
    }

    const groupSizes = groups.map(g => g.count);
    const averageGroupSize = groupSizes.reduce((sum, size) => sum + size, 0) / groups.length;
    const largestGroupSize = Math.max(...groupSizes);
    const smallestGroupSize = Math.min(...groupSizes);

    // Score distribution across all groups
    const scoreDistribution: Record<string, number> = {};
    for (const group of groups) {
      const scoreRange = this.getScoreRange(group.averageScore);
      scoreDistribution[scoreRange] = (scoreDistribution[scoreRange] || 0) + 1;
    }

    return {
      averageGroupSize: Math.round(averageGroupSize * 100) / 100,
      largestGroupSize,
      smallestGroupSize,
      scoreDistribution
    };
  }

  private compareRelevance(a: MemorySearchResult, b: MemorySearchResult): number {
    // Custom relevance comparison - could be enhanced with more sophisticated logic
    let aRelevance = a.score;
    let bRelevance = b.score;

    // Boost tool call results
    if (a.type === MemoryType.TOOL_CALL) aRelevance += 0.1;
    if (b.type === MemoryType.TOOL_CALL) bRelevance += 0.1;

    // Boost recent results
    const aTime = new Date(a.metadata.created).getTime();
    const bTime = new Date(b.metadata.created).getTime();
    const timeDiff = Math.abs(aTime - bTime);
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
    
    if (daysDiff < 1) {
      if (aTime > bTime) aRelevance += 0.05;
      else bRelevance += 0.05;
    }

    return bRelevance - aRelevance;
  }

  private generateHighlights(
    result: MemorySearchResult, 
    query: string, 
    options: { maxHighlights: number; highlightLength: number; caseSensitive: boolean; wholeWord: boolean }
  ): SearchHighlight[] {
    const highlights: SearchHighlight[] = [];
    const searchQuery = options.caseSensitive ? query : query.toLowerCase();
    
    // Search in different fields
    const searchFields = [
      { field: 'highlight', content: result.highlight },
      { field: 'context.match', content: result.context.match },
      { field: 'context.before', content: result.context.before },
      { field: 'context.after', content: result.context.after }
    ];

    for (const { field, content } of searchFields) {
      if (highlights.length >= options.maxHighlights) break;
      
      const searchContent = options.caseSensitive ? content : content.toLowerCase();
      let index = searchContent.indexOf(searchQuery);
      
      while (index !== -1 && highlights.length < options.maxHighlights) {
        const start = Math.max(0, index - 20);
        const end = Math.min(content.length, index + searchQuery.length + 20);
        
        highlights.push({
          field,
          start: index,
          end: index + searchQuery.length,
          text: content.substring(index, index + searchQuery.length),
          context: content.substring(start, end)
        });
        
        index = searchContent.indexOf(searchQuery, index + 1);
      }
    }

    return highlights.slice(0, options.maxHighlights);
  }

  private getScoreRange(score: number): string {
    if (score >= 0.9) return '0.9-1.0';
    if (score >= 0.8) return '0.8-0.9';
    if (score >= 0.7) return '0.7-0.8';
    if (score >= 0.6) return '0.6-0.7';
    if (score >= 0.5) return '0.5-0.6';
    return '0.0-0.5';
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    
    return Math.sqrt(avgSquaredDiff);
  }
}