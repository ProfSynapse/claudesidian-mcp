/**
 * UniversalSearchService - Simplified unified search across all content types
 * 
 * Leverages MetadataSearchService for tag/property filtering and HnswSearchService for content search
 * Uses official Obsidian API for metadata access and follows SOLID principles
 */

import { Plugin, TFile, getAllTags, prepareFuzzySearch } from 'obsidian';
import { HnswSearchService } from '../../../../database/providers/chroma/services/HnswSearchService';
import { MetadataSearchService, MetadataSearchCriteria, PropertyFilter } from '../../../../database/services/MetadataSearchService';
import { EmbeddingService } from '../../../../database/services/EmbeddingService';
import { MemoryService } from '../../../../database/services/MemoryService';
import { WorkspaceService } from '../../../../database/services/WorkspaceService';
import { 
  UniversalSearchParams, 
  UniversalSearchResult, 
  SearchResultCategory,
  CategoryType,
  UniversalSearchResultItem 
} from '../../types';

interface ParsedSearchQuery {
  cleanQuery: string;
  tags: string[];
  properties: PropertyFilter[];
}

/**
 * Universal search service with simplified, unified approach
 * Uses MetadataSearchService for tag/property filtering and HnswSearchService for content search
 */
export class UniversalSearchService {
  private plugin: Plugin;
  private metadataSearchService: MetadataSearchService;
  private hnswSearchService?: HnswSearchService;
  private embeddingService?: EmbeddingService;
  private memoryService?: MemoryService;
  private workspaceService?: WorkspaceService;

  constructor(
    plugin: Plugin,
    hnswSearchService?: HnswSearchService,
    embeddingService?: EmbeddingService,
    memoryService?: MemoryService,
    workspaceService?: WorkspaceService
  ) {
    this.plugin = plugin;
    this.metadataSearchService = new MetadataSearchService(plugin.app);
    this.hnswSearchService = hnswSearchService;
    this.embeddingService = embeddingService;
    this.memoryService = memoryService;
    this.workspaceService = workspaceService;
  }

  /**
   * Execute universal search with simplified flow
   */
  async executeUniversalSearch(params: UniversalSearchParams): Promise<UniversalSearchResult> {
    const startTime = performance.now();
    const { query, limit = 5 } = params;

    // 1. Parse query for tags/properties (optional)
    const parsedQuery = this.parseSearchQuery(query);

    // 2. Optional: Filter files by metadata first (if tags/properties specified)
    let filteredFiles: TFile[] | undefined;
    if (parsedQuery.tags.length > 0 || parsedQuery.properties.length > 0) {
      const criteria: MetadataSearchCriteria = {
        tags: parsedQuery.tags,
        properties: parsedQuery.properties,
        matchAll: true // AND logic by default
      };
      filteredFiles = await this.metadataSearchService.getFilesMatchingMetadata(criteria);
    }

    // 3. Search content with HNSW (on all files or filtered subset)
    const contentResults = await this.searchContent(parsedQuery.cleanQuery, filteredFiles, limit);

    // 4. Search files/folders by name
    const fileResults = await this.searchFiles(query, limit);

    // 5. Search metadata-only results (tags, properties)
    const tagResults = await this.searchTags(query, limit);
    const propertyResults = await this.searchProperties(query, limit);

    // 6. Format and combine results
    const totalResults = contentResults.length + fileResults.length + tagResults.length + propertyResults.length;
    const executionTime = performance.now() - startTime;

    return {
      success: true,
      query,
      totalResults,
      executionTime,
      categories: {
        files: {
          count: fileResults.length,
          results: fileResults,
          hasMore: fileResults.length >= limit,
          searchMethod: 'fuzzy',
          semanticAvailable: !!this.hnswSearchService
        },
        folders: {
          count: 0, // TODO: Add folder search
          results: [],
          hasMore: false,
          searchMethod: 'fuzzy',
          semanticAvailable: false
        },
        content: {
          count: contentResults.length,
          results: contentResults,
          hasMore: contentResults.length >= limit,
          searchMethod: 'semantic',
          semanticAvailable: !!this.hnswSearchService
        },
        workspaces: {
          count: 0, // TODO: Add workspace search via WorkspaceService
          results: [],
          hasMore: false,
          searchMethod: 'semantic',
          semanticAvailable: !!this.workspaceService
        },
        sessions: {
          count: 0, // TODO: Add session search via MemoryService
          results: [],
          hasMore: false,
          searchMethod: 'semantic',
          semanticAvailable: !!this.memoryService
        },
        snapshots: {
          count: 0, // TODO: Add snapshot search
          results: [],
          hasMore: false,
          searchMethod: 'semantic',
          semanticAvailable: false
        },
        memory_traces: {
          count: 0, // TODO: Add memory trace search
          results: [],
          hasMore: false,
          searchMethod: 'semantic',
          semanticAvailable: !!this.memoryService
        },
        tags: {
          count: tagResults.length,
          results: tagResults,
          hasMore: tagResults.length >= limit,
          searchMethod: 'exact',
          semanticAvailable: true
        },
        properties: {
          count: propertyResults.length,
          results: propertyResults,
          hasMore: propertyResults.length >= limit,
          searchMethod: 'exact',
          semanticAvailable: true
        }
      },
      searchStrategy: {
        semanticAvailable: !!this.hnswSearchService,
        categoriesSearched: ['files', 'content', 'tags', 'properties'],
        categoriesExcluded: ['folders', 'workspaces', 'sessions', 'snapshots', 'memory_traces'],
        fallbacksUsed: []
      }
    };
  }

  /**
   * Parse search query for tags and properties
   * Simple parsing: "tag:javascript priority:high neural networks"
   */
  private parseSearchQuery(query: string): ParsedSearchQuery {
    const tags: string[] = [];
    const properties: PropertyFilter[] = [];
    let cleanQuery = query;

    // Extract tag:value patterns
    const tagMatches = query.match(/tag:(\w+)/g);
    if (tagMatches) {
      tagMatches.forEach(match => {
        const tag = match.replace('tag:', '');
        tags.push(tag);
        cleanQuery = cleanQuery.replace(match, '').trim();
      });
    }

    // Extract property:value patterns
    const propMatches = query.match(/(\w+):(\w+)/g);
    if (propMatches) {
      propMatches.forEach(match => {
        if (!match.startsWith('tag:')) { // Skip tag: patterns
          const [key, value] = match.split(':');
          properties.push({ key, value });
          cleanQuery = cleanQuery.replace(match, '').trim();
        }
      });
    }

    return {
      cleanQuery: cleanQuery.replace(/\s+/g, ' ').trim(),
      tags,
      properties
    };
  }

  /**
   * Search content using HNSW (placeholder for now)
   */
  private async searchContent(query: string, filteredFiles?: TFile[], limit: number = 5): Promise<UniversalSearchResultItem[]> {
    if (!this.hnswSearchService || !query) {
      return [];
    }

    try {
      const results = await this.hnswSearchService.searchWithMetadataFilter(query, filteredFiles, {
        limit,
        threshold: 0.7,
        includeContent: false
      });

      return results.map(result => ({
        id: result.id,
        title: result.title,
        snippet: result.snippet,
        score: result.score,
        searchMethod: result.searchMethod,
        metadata: result.metadata,
        content: result.content
      }));
    } catch (error) {
      console.error('[UniversalSearchService] Content search failed:', error);
      return [];
    }
  }

  /**
   * Search files by name using Obsidian's fuzzy search
   */
  private async searchFiles(query: string, limit: number = 5): Promise<UniversalSearchResultItem[]> {
    if (!query) return [];

    const files = this.plugin.app.vault.getMarkdownFiles();
    const fuzzySearch = prepareFuzzySearch(query);
    const results: Array<{ file: TFile; score: number }> = [];

    for (const file of files) {
      const searchResult = fuzzySearch(file.basename);
      if (searchResult) {
        results.push({
          file,
          score: searchResult.score
        });
      }
    }

    // Sort by score and take top results
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, limit).map(({ file, score }) => ({
      id: file.path,
      title: file.basename,
      snippet: file.path,
      score: score / 100, // Normalize score
      searchMethod: 'fuzzy' as const,
      metadata: {
        filePath: file.path,
        fileSize: file.stat.size,
        modified: file.stat.mtime,
        matches: [] // TODO: Add match highlighting
      }
    }));
  }

  /**
   * Search tags
   */
  private async searchTags(query: string, limit: number = 5): Promise<UniversalSearchResultItem[]> {
    if (!query) return [];

    try {
      const allTags = await this.metadataSearchService.getAllTags();
      const normalizedQuery = query.toLowerCase().replace(/^#/, '');
      
      const matchingTags = allTags
        .filter(tag => tag.toLowerCase().includes(normalizedQuery))
        .slice(0, limit);

      return matchingTags.map(tag => ({
        id: `tag:${tag}`,
        title: `#${tag}`,
        snippet: `Tag: #${tag}`,
        score: tag.toLowerCase() === normalizedQuery ? 1.0 : 0.8,
        searchMethod: 'exact' as const,
        metadata: {
          tagName: tag,
          type: 'tag'
        }
      }));
    } catch (error) {
      console.error('[UniversalSearchService] Tag search failed:', error);
      return [];
    }
  }

  /**
   * Search properties
   */
  private async searchProperties(query: string, limit: number = 5): Promise<UniversalSearchResultItem[]> {
    if (!query) return [];

    try {
      const allPropertyKeys = await this.metadataSearchService.getAllPropertyKeys();
      const normalizedQuery = query.toLowerCase();
      
      const matchingProperties = allPropertyKeys
        .filter(key => key.toLowerCase().includes(normalizedQuery))
        .slice(0, limit);

      return matchingProperties.map(key => ({
        id: `property:${key}`,
        title: key,
        snippet: `Property: ${key}`,
        score: key.toLowerCase() === normalizedQuery ? 1.0 : 0.8,
        searchMethod: 'exact' as const,
        metadata: {
          propertyKey: key,
          type: 'property'
        }
      }));
    } catch (error) {
      console.error('[UniversalSearchService] Property search failed:', error);
      return [];
    }
  }
}