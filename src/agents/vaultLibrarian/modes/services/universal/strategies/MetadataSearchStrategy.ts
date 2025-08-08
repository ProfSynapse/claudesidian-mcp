/**
 * MetadataSearchStrategy - Handles tag and property search
 * Follows Single Responsibility Principle by focusing only on metadata search
 */

import { Plugin, getAllTags } from 'obsidian';
import { MetadataSearchService } from '../../../../../../database/services/search/MetadataSearchService';
import { UniversalSearchResultItem } from '../../../../types';

export interface MetadataSearchResult {
  success: boolean;
  error?: string;
  results?: UniversalSearchResultItem[];
}

/**
 * Service responsible for metadata search (tags and properties)
 * Follows SRP by focusing only on metadata search operations
 */
export class MetadataSearchStrategy {
  constructor(
    private plugin: Plugin,
    private metadataSearchService: MetadataSearchService
  ) {}

  /**
   * Search tags
   */
  async searchTags(query: string, limit = 10): Promise<MetadataSearchResult> {
    try {
      if (!query || query.trim().length === 0) {
        return {
          success: true,
          results: []
        };
      }

      const normalizedQuery = query.toLowerCase().trim();
      
      // Get all tags from the vault
      const allTags = getAllTags(this.plugin.app.metadataCache as any);
      
      if (!allTags || Object.keys(allTags).length === 0) {
        return {
          success: true,
          results: []
        };
      }

      // Ensure allTags is treated as Record<string, number>
      const tagsRecord = allTags as unknown as Record<string, number>;
      
      // Filter tags that match the query
      const matchingTags = Object.keys(tagsRecord)
        .filter(tag => tag.toLowerCase().includes(normalizedQuery))
        .slice(0, limit);

      const results = matchingTags.map(tag => ({
        id: `tag:${tag}`,
        title: `#${tag}`,
        snippet: `Tag: #${tag}`,
        score: tag.toLowerCase() === normalizedQuery ? 1.0 : 0.8,
        searchMethod: 'exact' as const,
        metadata: {
          tagName: tag,
          type: 'tag',
          searchMethod: 'exact',
          usageCount: tagsRecord[tag] || 0
        }
      }));

      return {
        success: true,
        results
      };
    } catch (error) {
      return {
        success: false,
        error: `Tag search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Search properties
   */
  async searchProperties(query: string, limit = 10): Promise<MetadataSearchResult> {
    try {
      if (!query || query.trim().length === 0) {
        return {
          success: true,
          results: []
        };
      }

      const normalizedQuery = query.toLowerCase().trim();
      const allPropertyKeys = await this.metadataSearchService.getAllPropertyKeys();
      
      const matchingProperties = allPropertyKeys
        .filter(key => key.toLowerCase().includes(normalizedQuery))
        .slice(0, limit);

      const results = matchingProperties.map((key: string) => ({
        id: `property:${key}`,
        title: key,
        snippet: `Property: ${key}`,
        score: key.toLowerCase() === normalizedQuery ? 1.0 : 0.8,
        searchMethod: 'exact' as const,
        metadata: {
          propertyKey: key,
          type: 'property',
          searchMethod: 'exact'
        }
      }));

      return {
        success: true,
        results
      };
    } catch (error) {
      return {
        success: false,
        error: `Property search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Search property values
   */
  async searchPropertyValues(propertyKey: string, query: string, limit = 10): Promise<MetadataSearchResult> {
    try {
      if (!propertyKey || !query || query.trim().length === 0) {
        return {
          success: true,
          results: []
        };
      }

      const normalizedQuery = query.toLowerCase().trim();
      const allPropertyValues = await this.metadataSearchService.getPropertyValues(propertyKey);
      
      const matchingValues = allPropertyValues
        .filter((value: any) => String(value).toLowerCase().includes(normalizedQuery))
        .slice(0, limit);

      const results = matchingValues.map((value: any) => ({
        id: `property-value:${propertyKey}:${value}`,
        title: `${propertyKey}: ${value}`,
        snippet: `Property value: ${propertyKey} = ${value}`,
        score: String(value).toLowerCase() === normalizedQuery ? 1.0 : 0.8,
        searchMethod: 'exact' as const,
        metadata: {
          propertyKey,
          propertyValue: value,
          type: 'property-value',
          searchMethod: 'exact'
        }
      }));

      return {
        success: true,
        results
      };
    } catch (error) {
      return {
        success: false,
        error: `Property value search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get popular tags
   */
  async getPopularTags(limit = 10): Promise<MetadataSearchResult> {
    try {
      const allTags = getAllTags(this.plugin.app.metadataCache as any);
      
      if (!allTags || Object.keys(allTags).length === 0) {
        return {
          success: true,
          results: []
        };
      }

      // Ensure allTags is treated as Record<string, number>
      const tagsRecord = allTags as unknown as Record<string, number>;
      
      // Sort tags by usage count
      const sortedTags = Object.entries(tagsRecord)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit);

      const results = sortedTags.map(([tag, count]) => ({
        id: `tag:${tag}`,
        title: `#${tag}`,
        snippet: `Tag: #${tag} (used ${count} times)`,
        score: Math.min(1.0, count / 10), // Normalize based on usage
        searchMethod: 'exact' as const,
        metadata: {
          tagName: tag,
          type: 'tag',
          searchMethod: 'popular',
          usageCount: count
        }
      }));

      return {
        success: true,
        results
      };
    } catch (error) {
      return {
        success: false,
        error: `Popular tags search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get recently used tags
   */
  async getRecentTags(limit = 10): Promise<MetadataSearchResult> {
    try {
      // This is a simplified version - in a full implementation,
      // you would track tag usage timestamps
      const allTags = getAllTags(this.plugin.app.metadataCache as any);
      
      if (!allTags || Object.keys(allTags).length === 0) {
        return {
          success: true,
          results: []
        };
      }

      // Ensure allTags is treated as Record<string, number>
      const tagsRecord = allTags as unknown as Record<string, number>;
      
      // For now, just return tags sorted alphabetically
      const sortedTags = Object.keys(tagsRecord)
        .sort()
        .slice(0, limit);

      const results = sortedTags.map(tag => ({
        id: `tag:${tag}`,
        title: `#${tag}`,
        snippet: `Tag: #${tag}`,
        score: 0.8,
        searchMethod: 'exact' as const,
        metadata: {
          tagName: tag,
          type: 'tag',
          searchMethod: 'recent',
          usageCount: tagsRecord[tag] || 0
        }
      }));

      return {
        success: true,
        results
      };
    } catch (error) {
      return {
        success: false,
        error: `Recent tags search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get metadata statistics
   */
  async getMetadataStatistics(): Promise<{
    totalTags: number;
    totalProperties: number;
    mostUsedTags: Array<{ tag: string; count: number }>;
    allPropertyKeys: string[];
  }> {
    try {
      const allTags = getAllTags(this.plugin.app.metadataCache as any);
      const allPropertyKeys = await this.metadataSearchService.getAllPropertyKeys();

      // Ensure allTags is treated as Record<string, number>
      const tagsRecord = (allTags as unknown as Record<string, number>) || {};
      
      // Get most used tags
      const mostUsedTags = Object.entries(tagsRecord)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count }));

      return {
        totalTags: Object.keys(tagsRecord).length,
        totalProperties: allPropertyKeys.length,
        mostUsedTags,
        allPropertyKeys
      };
    } catch (error) {
      return {
        totalTags: 0,
        totalProperties: 0,
        mostUsedTags: [],
        allPropertyKeys: []
      };
    }
  }

  /**
   * Search both tags and properties
   */
  async searchMetadata(query: string, limit = 10): Promise<MetadataSearchResult> {
    try {
      const [tagResults, propertyResults] = await Promise.all([
        this.searchTags(query, Math.ceil(limit / 2)),
        this.searchProperties(query, Math.ceil(limit / 2))
      ]);

      if (!tagResults.success || !propertyResults.success) {
        return {
          success: false,
          error: `Metadata search failed: ${tagResults.error || propertyResults.error}`
        };
      }

      // Combine and sort results
      const allResults = [
        ...(tagResults.results || []),
        ...(propertyResults.results || [])
      ].sort((a, b) => b.score - a.score);

      return {
        success: true,
        results: allResults.slice(0, limit)
      };
    } catch (error) {
      return {
        success: false,
        error: `Metadata search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}