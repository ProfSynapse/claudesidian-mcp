/**
 * UniversalSearchService - Simplified unified search across all content types
 * 
 * Leverages MetadataSearchService for tag/property filtering and HnswSearchService for content search
 * Uses official Obsidian API for metadata access and follows SOLID principles
 */

import { Plugin, TFile, getAllTags, prepareFuzzySearch } from 'obsidian';
import { HnswSearchService } from '../../../../database/services/hnsw/HnswSearchService';
import { MetadataSearchService, MetadataSearchCriteria, PropertyFilter } from '../../../../database/services/MetadataSearchService';
import { HybridSearchService, HybridSearchOptions } from '../../../../database/services/search';
import { EmbeddingService } from '../../../../database/services/EmbeddingService';
import { MemoryService } from '../../../../database/services/MemoryService';
import { WorkspaceService } from '../../../../database/services/WorkspaceService';
import { GraphOperations } from '../../../../database/utils/graph/GraphOperations';
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

interface ConsolidatedSearchResult {
  filePath: string;
  frontmatter?: Record<string, any>;
  snippets: SearchSnippet[];
  connectedNotes: string[];
}

interface SearchSnippet {
  content: string;
  searchMethod: 'semantic' | 'keyword' | 'fuzzy';
}

/**
 * Universal search service with simplified, unified approach
 * Uses MetadataSearchService for tag/property filtering and HnswSearchService for content search
 */
export class UniversalSearchService {
  private plugin: Plugin;
  private metadataSearchService: MetadataSearchService;
  private hnswSearchService?: HnswSearchService;
  private hybridSearchService?: HybridSearchService;
  private embeddingService?: EmbeddingService;
  private memoryService?: MemoryService;
  private workspaceService?: WorkspaceService;
  private graphOperations: GraphOperations;

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
    this.graphOperations = new GraphOperations();
    
    // Note: HybridSearchService will be initialized lazily when needed
    // because HnswSearchService may not be ready during construction
  }

  /**
   * Initialize hybrid search service lazily when needed
   */
  private async ensureHybridSearchService(): Promise<HybridSearchService | null> {
    if (this.hybridSearchService) {
      return this.hybridSearchService;
    }

    // If we don't have the service from constructor, try to get it from the lazy service manager
    if (!this.hnswSearchService) {
      try {
        const plugin = this.plugin as any;
        if (plugin.serviceManager) {
          // Use lazy service manager to get HNSW service on demand
          this.hnswSearchService = await plugin.serviceManager.get('hnswSearchService');
        } else if (plugin.services?.hnswSearchService) {
          // Fallback to old services pattern
          this.hnswSearchService = await plugin.services.hnswSearchService;
        }
      } catch (error) {
        console.warn('[UniversalSearchService] Failed to get HnswSearchService:', error);
        return null;
      }
    }

    if (this.hnswSearchService) {
      try {
        this.hybridSearchService = new HybridSearchService(this.hnswSearchService);
        return this.hybridSearchService;
      } catch (error) {
        console.error('[UniversalSearchService] Failed to create HybridSearchService:', error);
        return null;
      }
    }

    return null;
  }

  /**
   * Populate hybrid search indexes with existing vault content
   */
  async populateHybridSearchIndexes(): Promise<void> {
    const hybridSearchService = await this.ensureHybridSearchService();
    if (!hybridSearchService) {
      console.error('[UniversalSearchService] No hybrid search service available for indexing');
      return;
    }

    try {
      
      const files = this.plugin.app.vault.getMarkdownFiles();
      
      if (files.length === 0) {
        console.warn('[UniversalSearchService] No markdown files found in vault');
        return;
      }
      
      let indexedCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      
      for (const file of files) {
        try {
          const content = await this.plugin.app.vault.read(file);
          
          if (!content || content.trim().length === 0) {
            skippedCount++;
            continue;
          }

          // Extract metadata
          const cache = this.plugin.app.metadataCache.getFileCache(file);
          const tags = cache?.tags?.map(t => t.tag.replace('#', '')) || [];
          const headers = this.extractHeaders(content);
          
          // Index the file in hybrid search
          hybridSearchService.indexDocument(
            file.path,
            file.basename,
            headers,
            content,
            tags,
            file.path,
            {
              modified: file.stat.mtime,
              size: file.stat.size,
              extension: file.extension
            }
          );
          
          indexedCount++;
          
          // Log progress every 100 files
          if (indexedCount % 100 === 0) {
          }
        } catch (error) {
          console.error(`[UniversalSearchService] Failed to index file ${file.path}:`, error);
          errorCount++;
        }
      }
      
      
      // Verify the indexes were actually populated
      const postStats = hybridSearchService.getStats();
      if (postStats.keyword.totalDocuments === 0 && postStats.fuzzy.totalDocuments === 0) {
        console.error('[UniversalSearchService] WARNING: Index population appeared to succeed but no documents were indexed');
      }
      
    } catch (error) {
      console.error('[UniversalSearchService] Failed to populate hybrid search indexes:', error);
      throw error; // Re-throw to allow caller to handle
    }
  }

  /**
   * Extract headers from markdown content
   */
  private extractHeaders(content: string): string[] {
    const headers: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        // Extract header text without # symbols
        const headerText = trimmed.replace(/^#+\s*/, '').trim();
        if (headerText) {
          headers.push(headerText);
        }
      }
    }
    
    return headers;
  }

  /**
   * Get connected notes (wikilinked files) for a given file
   */
  private getConnectedNotes(file: TFile): string[] {
    const connectedNotes: string[] = [];
    
    try {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const resolvedLinks = this.plugin.app.metadataCache.resolvedLinks[file.path];
      
      if (resolvedLinks) {
        // Get all resolved links (these are actual file paths)
        Object.keys(resolvedLinks).forEach(linkedPath => {
          if (linkedPath !== file.path) { // Don't include self
            connectedNotes.push(linkedPath);
          }
        });
      }
      
      // Also check for unresolved links from cache.links
      if (cache?.links) {
        cache.links.forEach(link => {
          // Try to resolve manually if not in resolvedLinks
          const linkedFile = this.plugin.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
          if (linkedFile && linkedFile.path !== file.path && !connectedNotes.includes(linkedFile.path)) {
            connectedNotes.push(linkedFile.path);
          }
        });
      }
      
    } catch (error) {
      console.error(`[UniversalSearchService] Error getting connected notes for ${file.path}:`, error);
    }
    
    return connectedNotes;
  }

  /**
   * Apply graph boost to search results
   */
  private async applyGraphBoostToResults(
    results: UniversalSearchResultItem[], 
    params: UniversalSearchParams
  ): Promise<UniversalSearchResultItem[]> {
    if (!results.length) return results;

    try {
      // Convert results to the format expected by GraphOperations
      const recordsWithScores = results.map(result => ({
        record: {
          id: result.id,
          filePath: result.metadata?.filePath || result.id,
          content: result.content || result.snippet || '',
          metadata: {
            links: this.getLinksForFile(result.metadata?.filePath || result.id)
          }
        },
        similarity: result.score
      }));

      // Apply graph boost
      const boostedRecords = this.graphOperations.applyGraphBoost(recordsWithScores, {
        useGraphBoost: params.useGraphBoost || false,
        boostFactor: params.graphBoostFactor || 0.3,
        maxDistance: params.graphMaxDistance || 1,
        seedNotes: params.seedNotes || []
      });

      // Convert back to search result format
      return boostedRecords.map((boosted, index) => ({
        ...results[index],
        score: boosted.similarity
      }));

    } catch (error) {
      console.error('[UniversalSearchService] Graph boost failed:', error);
      return results;
    }
  }

  /**
   * Get link metadata for a file path
   */
  private getLinksForFile(filePath: string): any {
    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return {};

      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const resolvedLinks = this.plugin.app.metadataCache.resolvedLinks[filePath];

      const links: {
        outgoing: Array<{ displayText: string; targetPath: string }>;
        incoming: Array<{ sourcePath: string; displayText: string }>;
      } = {
        outgoing: [],
        incoming: []
      };

      // Get outgoing links
      if (resolvedLinks) {
        Object.keys(resolvedLinks).forEach(targetPath => {
          links.outgoing.push({
            displayText: targetPath.split('/').pop()?.replace('.md', '') || '',
            targetPath: targetPath
          });
        });
      }

      // Get incoming links (files that link to this file)
      Object.keys(this.plugin.app.metadataCache.resolvedLinks).forEach(sourcePath => {
        const sourceLinks = this.plugin.app.metadataCache.resolvedLinks[sourcePath];
        if (sourceLinks && sourceLinks[filePath]) {
          links.incoming.push({
            sourcePath: sourcePath,
            displayText: sourcePath.split('/').pop()?.replace('.md', '') || ''
          });
        }
      });

      return links;
    } catch (error) {
      console.error(`[UniversalSearchService] Error getting links for ${filePath}:`, error);
      return {};
    }
  }

  /**
   * Consolidate search results by file, grouping all snippets per file
   */
  private async consolidateResultsByFile(
    results: UniversalSearchResultItem[], 
    limit: number
  ): Promise<ConsolidatedSearchResult[]> {
    // Group results by file path
    const fileGroups = new Map<string, UniversalSearchResultItem[]>();
    
    results.forEach(result => {
      const filePath = result.metadata?.filePath || result.id;
      if (!fileGroups.has(filePath)) {
        fileGroups.set(filePath, []);
      }
      fileGroups.get(filePath)!.push(result);
    });

    // Convert to consolidated format
    const consolidated: ConsolidatedSearchResult[] = [];
    
    for (const [filePath, fileResults] of fileGroups) {
      try {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) continue;

        // Get frontmatter
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter || {};

        // Create snippets from all search results for this file
        const snippets: SearchSnippet[] = fileResults.map(result => ({
          content: result.snippet || '',
          searchMethod: this.getSearchMethodFromResult(result)
        }));

        // Get connected notes
        const connectedNotes = this.getConnectedNotes(file);

        consolidated.push({
          filePath,
          frontmatter,
          snippets,
          connectedNotes
        });

      } catch (error) {
        console.error(`[UniversalSearchService] Error consolidating file ${filePath}:`, error);
      }
    }

    // Sort by highest scoring snippet per file and limit results
    consolidated.sort((a, b) => {
      const maxScoreA = Math.max(...fileGroups.get(a.filePath)!.map(r => r.score));
      const maxScoreB = Math.max(...fileGroups.get(b.filePath)!.map(r => r.score));
      return maxScoreB - maxScoreA;
    });

    return consolidated.slice(0, limit);
  }

  /**
   * Determine search method from result metadata
   */
  private getSearchMethodFromResult(result: UniversalSearchResultItem): 'semantic' | 'keyword' | 'fuzzy' {
    // Check if result has method scores to determine which method found it
    const methodScores = result.metadata?.methodScores;
    if (methodScores) {
      if (methodScores.keyword && methodScores.keyword > 0) return 'keyword';
      if (methodScores.fuzzy && methodScores.fuzzy > 0) return 'fuzzy';
      if (methodScores.semantic && methodScores.semantic > 0) return 'semantic';
    }
    
    // Fallback to searchMethod if available
    if (result.searchMethod === 'hybrid') return 'semantic'; // Default for hybrid
    return result.searchMethod as 'semantic' | 'keyword' | 'fuzzy';
  }

  /**
   * Execute consolidated search that groups results by file
   */
  async executeConsolidatedSearch(params: UniversalSearchParams): Promise<ConsolidatedSearchResult[]> {
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
        matchAll: true
      };
      filteredFiles = await this.metadataSearchService.getFilesMatchingMetadata(criteria);
    }

    // 3. Get hybrid search results
    const hybridResults = await this.searchContent(parsedQuery.cleanQuery, filteredFiles, limit * 3, params);

    // 4. Apply graph boost if enabled
    let boostedResults = hybridResults;
    if (params.useGraphBoost) {
      boostedResults = await this.applyGraphBoostToResults(hybridResults, params);
    }

    // 5. Consolidate results by file
    const consolidatedResults = await this.consolidateResultsByFile(boostedResults, limit);

    return consolidatedResults;
  }

  /**
   * Execute universal search with simplified flow (legacy format)
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

    // 3. Search content with hybrid search (on all files or filtered subset)
    const contentResults = await this.searchContent(parsedQuery.cleanQuery, filteredFiles, limit, params);

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
   * Search content using hybrid search (semantic + keyword + fuzzy)
   */
  private async searchContent(query: string, filteredFiles?: TFile[], limit = 5, params?: UniversalSearchParams): Promise<UniversalSearchResultItem[]> {
    if (!query) {
      console.log(`[UniversalSearchService] Empty query provided to searchContent`);
      return [];
    }

    console.log(`[UniversalSearchService] searchContent called with query: "${query}", limit: ${limit}`);

    try {
      // Use hybrid search if available, otherwise fall back to semantic search
      const hybridSearchService = await this.ensureHybridSearchService();
      if (hybridSearchService) {
        console.log(`[UniversalSearchService] Using hybrid search service`);
        const options: HybridSearchOptions = {
          limit,
          includeContent: false,
          forceSemanticSearch: params?.forceSemanticSearch,
          semanticThreshold: params?.semanticThreshold || (this.plugin as any).settings?.settings?.memory?.semanticThreshold || 0.5,
          queryType: params?.queryType || 'mixed'  // Default to mixed if not provided
        };

        console.log(`[UniversalSearchService] Starting hybrid search for query: "${query}" with queryType: ${options.queryType}`);
        
        // Log hybrid search stats before searching
        const stats = hybridSearchService.getStats();
        console.log(`[UniversalSearchService] Pre-search hybrid stats:`, stats);
        
        // Check if indexes need population
        const needsPopulation = stats.keyword.totalDocuments === 0 && stats.fuzzy.totalDocuments === 0;
        const semanticAvailable = this.hnswSearchService && this.hnswSearchService.hasIndex('file_embeddings');
        
        if (needsPopulation) {
          console.log(`[UniversalSearchService] Indexes are empty, triggering manual population...`);
          console.log(`[UniversalSearchService] HNSW service available: ${!!this.hnswSearchService}`);
          
          try {
            await this.populateHybridSearchIndexes();
            
            // Check stats again after population
            const newStats = hybridSearchService.getStats();
            console.log(`[UniversalSearchService] Post-population stats:`, newStats);
            
            // Verify population was successful
            if (newStats.keyword.totalDocuments === 0 && newStats.fuzzy.totalDocuments === 0) {
              console.warn(`[UniversalSearchService] Index population failed - no documents indexed`);
            }
          } catch (error) {
            console.error(`[UniversalSearchService] Index population failed:`, error);
            // Continue with search anyway - may fall back to brute force
          }
        }
        
        console.log(`[UniversalSearchService] Search readiness: keyword=${stats.keyword.totalDocuments}, fuzzy=${stats.fuzzy.totalDocuments}, semantic=${semanticAvailable}`);
        
        // Execute hybrid search with proper error handling
        let results: any[];
        try {
          results = await hybridSearchService.search(query, options, filteredFiles);
        } catch (searchError) {
          console.error(`[UniversalSearchService] Hybrid search failed:`, searchError);
          // Return empty results rather than throwing - let fallback search handle it
          results = [];
        }
        
        console.log(`[UniversalSearchService] Hybrid search returned ${results.length} results:`, 
          results.map(r => ({ 
            id: r.id, 
            title: r.title, 
            score: r.score, 
            methods: r.originalMethods,
            methodScores: r.metadata.methodScores 
          })));
        
        return results.map(result => ({
          id: result.id,
          title: result.title,
          snippet: result.snippet,
          score: result.score,
          searchMethod: result.searchMethod,
          metadata: result.metadata,
          content: result.content
        }));
      }
      
      // Fallback to pure semantic search
      if (this.hnswSearchService) {
        const searchThreshold = params?.semanticThreshold || (this.plugin as any).settings?.settings?.memory?.semanticThreshold || 0.5;
        
        const results = await this.hnswSearchService.searchWithMetadataFilter(query, filteredFiles, {
          limit,
          threshold: searchThreshold,
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
      }
      
      return [];
    } catch (error) {
      console.error('[UniversalSearchService] Content search failed:', error);
      return [];
    }
  }

  /**
   * Search files by name using Obsidian's fuzzy search
   */
  private async searchFiles(query: string, limit = 5): Promise<UniversalSearchResultItem[]> {
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
  private async searchTags(query: string, limit = 5): Promise<UniversalSearchResultItem[]> {
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
  private async searchProperties(query: string, limit = 5): Promise<UniversalSearchResultItem[]> {
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