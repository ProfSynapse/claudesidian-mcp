import { Plugin } from 'obsidian';
import { SemanticSearchService } from '../../../../database/services/SemanticSearchService';
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
import { SemanticFallbackService } from './SemanticFallbackService';
import { ContentSearchStrategy } from '../strategies/ContentSearchStrategy';
import { FileSearchStrategy } from '../strategies/FileSearchStrategy';
import { WorkspaceSearchStrategy } from '../strategies/WorkspaceSearchStrategy';
import { CollectionSearchStrategy } from '../strategies/CollectionSearchStrategy';

/**
 * Universal search service that orchestrates searches across all content types
 * Updated to use SemanticSearchService instead of ChromaSearchService
 */
export class UniversalSearchService {
  private semanticFallback: SemanticFallbackService;
  private contentStrategy: ContentSearchStrategy;
  private fileStrategy: FileSearchStrategy;
  private workspaceStrategy: WorkspaceSearchStrategy;
  private collectionStrategy: CollectionSearchStrategy;

  constructor(
    private plugin: Plugin,
    private semanticSearchService?: SemanticSearchService,
    private embeddingService?: EmbeddingService,
    private memoryService?: MemoryService,
    private workspaceService?: WorkspaceService
  ) {
    this.semanticFallback = new SemanticFallbackService(embeddingService);
    this.contentStrategy = new ContentSearchStrategy(plugin, semanticSearchService, embeddingService, this.semanticFallback);
    this.fileStrategy = new FileSearchStrategy(plugin);
    this.workspaceStrategy = new WorkspaceSearchStrategy(plugin, workspaceService, this.semanticFallback);
    this.collectionStrategy = new CollectionSearchStrategy(plugin, memoryService, this.semanticFallback);
  }

  /**
   * Execute universal search across all categories
   */
  async executeUniversalSearch(params: UniversalSearchParams): Promise<UniversalSearchResult> {
    const startTime = performance.now();
    
    // Determine which categories to search
    const allCategories: CategoryType[] = [
      'files', 'folders', 'content', 'workspaces', 
      'sessions', 'snapshots', 'memory_traces', 'tags', 'properties'
    ];
    
    const categoriesToSearch = this.getCategoriesToSearch(allCategories, params);
    const searchOptions = this.createSearchOptions(params);
    
    // Execute searches in parallel for performance
    const searchPromises = categoriesToSearch.map(category => 
      this.searchCategory(category, params.query, searchOptions)
        .catch(error => {
          console.warn(`Search failed for category ${category}:`, error);
          return this.createEmptyCategory(category);
        })
    );

    const categoryResults = await Promise.all(searchPromises);
    
    // Build categorized results
    const categories: UniversalSearchResult['categories'] = {};
    let totalResults = 0;
    
    categoryResults.forEach((result, index) => {
      const category = categoriesToSearch[index];
      categories[category] = result;
      totalResults += result.count;
    });

    const executionTime = performance.now() - startTime;
    
    return {
      success: true,
      query: params.query,
      totalResults,
      executionTime,
      categories,
      searchStrategy: {
        semanticAvailable: this.semanticFallback.isSemanticAvailable(),
        categoriesSearched: categoriesToSearch,
        categoriesExcluded: params.excludeCategories || [],
        fallbacksUsed: this.semanticFallback.getFallbackCategories(categoriesToSearch, params.forceSemanticSearch)
      }
    };
  }

  /**
   * Search a specific category
   */
  private async searchCategory(
    category: CategoryType, 
    query: string, 
    options: any
  ): Promise<SearchResultCategory> {
    let results: UniversalSearchResultItem[] = [];
    let searchMethod: 'semantic' | 'fuzzy' | 'exact' | 'hybrid' = 'fuzzy';

    try {
      switch (category) {
        case 'content':
          results = await this.contentStrategy.search(query, options);
          searchMethod = this.semanticFallback.getSearchMethod('content', options.forceSemanticSearch);
          break;
          
        case 'files':
          results = await this.fileStrategy.searchFiles(query, options);
          searchMethod = 'fuzzy';
          break;
          
        case 'folders':
          results = await this.fileStrategy.searchFolders(query, options);
          searchMethod = 'fuzzy';
          break;
          
        case 'workspaces':
          results = await this.workspaceStrategy.search(query, options);
          searchMethod = this.semanticFallback.getSearchMethod('workspaces', options.forceSemanticSearch);
          break;
          
        case 'sessions':
          results = await this.collectionStrategy.searchSessions(query, options);
          searchMethod = this.semanticFallback.getSearchMethod('sessions', options.forceSemanticSearch);
          break;
          
        case 'snapshots':
          results = await this.collectionStrategy.searchSnapshots(query, options);
          searchMethod = this.semanticFallback.getSearchMethod('snapshots', options.forceSemanticSearch);
          break;
          
        case 'memory_traces':
          results = await this.collectionStrategy.searchMemoryTraces(query, options);
          searchMethod = this.semanticFallback.getSearchMethod('memory_traces', options.forceSemanticSearch);
          break;
          
        case 'tags':
          results = await this.searchTags(query, options);
          searchMethod = 'exact';
          break;
          
        case 'properties':
          results = await this.searchProperties(query, options);
          searchMethod = 'exact';
          break;
          
        default:
          console.warn(`Unknown category: ${category}`);
      }
    } catch (error) {
      console.error(`Failed to search category ${category}:`, error);
    }

    return {
      count: results.length,
      results: results.slice(0, options.limit || 5),
      hasMore: results.length > (options.limit || 5),
      searchMethod,
      semanticAvailable: this.semanticFallback.isSemanticAvailable()
    };
  }

  /**
   * Search for tags (simplified implementation)
   */
  private async searchTags(query: string, options: any): Promise<UniversalSearchResultItem[]> {
    // Simplified tag search - would be enhanced in real implementation
    const files = this.plugin.app.vault.getMarkdownFiles();
    const results: UniversalSearchResultItem[] = [];
    const queryLower = query.toLowerCase();

    for (const file of files.slice(0, options.limit || 10)) {
      try {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const tags = cache?.tags?.map(tag => tag.tag) || [];
        const frontmatterTags = cache?.frontmatter?.tags || [];
        const allTags = [...tags, ...frontmatterTags];

        const matchingTags = allTags.filter(tag => 
          tag.toLowerCase().includes(queryLower)
        );

        if (matchingTags.length > 0) {
          results.push({
            id: file.path,
            title: file.name.replace(/\\.md$/, ''),
            snippet: `Tags: ${matchingTags.join(', ')}`,
            score: matchingTags.length / allTags.length,
            searchMethod: 'exact' as const,
            metadata: {
              filePath: file.path,
              matchingTags,
              allTags
            }
          });
        }
      } catch (error) {
        console.warn(`Failed to search tags in ${file.path}:`, error);
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Search for properties (simplified implementation)  
   */
  private async searchProperties(query: string, options: any): Promise<UniversalSearchResultItem[]> {
    // Simplified property search - would be enhanced in real implementation  
    const files = this.plugin.app.vault.getMarkdownFiles();
    const results: UniversalSearchResultItem[] = [];
    const queryLower = query.toLowerCase();

    for (const file of files.slice(0, options.limit || 10)) {
      try {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter || {};

        const matchingProperties: string[] = [];
        for (const [key, value] of Object.entries(frontmatter)) {
          if (key.toLowerCase().includes(queryLower) || 
              String(value).toLowerCase().includes(queryLower)) {
            matchingProperties.push(`${key}: ${value}`);
          }
        }

        if (matchingProperties.length > 0) {
          results.push({
            id: file.path,
            title: file.name.replace(/\\.md$/, ''),
            snippet: matchingProperties.join(', '),
            score: matchingProperties.length / Object.keys(frontmatter).length || 1,
            searchMethod: 'exact' as const,
            metadata: {
              filePath: file.path,
              matchingProperties,
              frontmatter
            }
          });
        }
      } catch (error) {
        console.warn(`Failed to search properties in ${file.path}:`, error);
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Determine which categories to search based on parameters
   */
  private getCategoriesToSearch(allCategories: CategoryType[], params: UniversalSearchParams): CategoryType[] {
    let categoriesToSearch = [...allCategories];

    // Remove excluded categories
    if (params.excludeCategories && params.excludeCategories.length > 0) {
      categoriesToSearch = categoriesToSearch.filter(
        category => !params.excludeCategories!.includes(category)
      );
    }

    return categoriesToSearch;
  }

  /**
   * Create search options from universal search params
   */
  private createSearchOptions(params: UniversalSearchParams) {
    const baseLimit = params.limit || 5;
    
    // Get settings defaults
    const settings = (this.plugin as any).settings?.settings?.memory;
    const defaultThreshold = settings?.defaultThreshold || 0.7;
    const backlinksEnabled = settings?.backlinksEnabled || false;
    const graphBoostFactor = settings?.graphBoostFactor || 0.3;
    
    return {
      limit: params.prioritizeCategories ? 
        (category: CategoryType) => params.prioritizeCategories!.includes(category) ? baseLimit * 2 : baseLimit :
        baseLimit,
      paths: params.paths,
      includeContent: params.includeContent !== false,
      semanticThreshold: params.semanticThreshold || defaultThreshold,
      forceSemanticSearch: params.forceSemanticSearch,
      graphBoost: {
        useGraphBoost: params.useGraphBoost ?? backlinksEnabled,
        graphBoostFactor: params.graphBoostFactor ?? graphBoostFactor,
        graphMaxDistance: params.graphMaxDistance || 1,
        seedNotes: params.seedNotes
      }
    };
  }

  /**
   * Create empty category result for failed searches
   */
  private createEmptyCategory(category: CategoryType): SearchResultCategory {
    return {
      count: 0,
      results: [],
      hasMore: false,
      searchMethod: this.semanticFallback.getSearchMethod(category),
      semanticAvailable: this.semanticFallback.isSemanticAvailable()
    };
  }
}