/**
 * UniversalSearchService - Refactored following SOLID principles
 * Orchestrates specialized search services for unified search functionality
 */

import { Plugin, TFile } from 'obsidian';
import { EmbeddingService } from '../../../../../database/services/EmbeddingService';
import { MemoryService } from '../../../../../database/services/MemoryService';
import { WorkspaceService } from '../../../../../database/services/WorkspaceService';
import { GraphOperations } from '../../../../../database/utils/graph/GraphOperations';
import { MetadataSearchService, MetadataSearchCriteria } from '../../../../../database/services/MetadataSearchService';
import { 
  UniversalSearchParams, 
  UniversalSearchResult, 
  UniversalSearchResultItem 
} from '../../../types';

// Import specialized services
import { QueryParser } from './query/QueryParser';
import { ContentSearchStrategy } from './strategies/ContentSearchStrategy';
import { FileSearchStrategy } from './strategies/FileSearchStrategy';
import { MetadataSearchStrategy } from './strategies/MetadataSearchStrategy';
import { ResultConsolidator, ConsolidatedSearchResult } from './results/ResultConsolidator';
import { ResultFormatter } from './results/ResultFormatter';
import { ServiceInitializer } from './initialization/ServiceInitializer';
import { globalValidationErrorMonitor, ValidationErrorMonitor } from './validation/ValidationErrorMonitor';

/**
 * Refactored UniversalSearchService following SOLID principles
 * Orchestrates specialized search services for unified search functionality
 */
export class UniversalSearchService {
  private plugin: Plugin;
  private graphOperations: GraphOperations;
  
  // Composed services following Dependency Injection principle
  private serviceInitializer: ServiceInitializer;
  private queryParser: QueryParser;
  private contentSearchStrategy: ContentSearchStrategy;
  private fileSearchStrategy: FileSearchStrategy;
  private metadataSearchStrategy: MetadataSearchStrategy;
  private resultConsolidator: ResultConsolidator;
  private resultFormatter: ResultFormatter;
  
  // Service references
  private metadataSearchService?: MetadataSearchService;
  private embeddingService?: EmbeddingService;
  private memoryService?: MemoryService;
  private workspaceService?: WorkspaceService;

  constructor(
    plugin: Plugin,
    embeddingService?: EmbeddingService,
    memoryService?: MemoryService,
    workspaceService?: WorkspaceService
  ) {
    this.plugin = plugin;
    this.graphOperations = new GraphOperations();
    
    // Initialize specialized services
    this.serviceInitializer = new ServiceInitializer(plugin);
    this.queryParser = new QueryParser();
    this.contentSearchStrategy = new ContentSearchStrategy();
    this.fileSearchStrategy = new FileSearchStrategy(plugin);
    this.metadataSearchStrategy = new MetadataSearchStrategy(plugin, new MetadataSearchService(plugin.app));
    this.resultConsolidator = new ResultConsolidator();
    this.resultFormatter = new ResultFormatter();
    
    // Store provided services
    this.embeddingService = embeddingService;
    this.memoryService = memoryService;
    this.workspaceService = workspaceService;
    
    // Initialize services
    this.initializeServices();
  }

  /**
   * Initialize all services
   */
  private async initializeServices(): Promise<void> {
    try {
      const result = await this.serviceInitializer.initializeServices({
        embeddingService: this.embeddingService,
        memoryService: this.memoryService,
        workspaceService: this.workspaceService
      });

      if (result.success && result.services) {
        this.metadataSearchService = result.services.metadataSearchService;
        
        // Update search strategies with initialized services
        this.contentSearchStrategy.updateServices(
          result.services.hybridSearchService
        );
        
        this.metadataSearchStrategy = new MetadataSearchStrategy(
          this.plugin,
          this.metadataSearchService
        );
      }
    } catch (error) {
      console.error('[UniversalSearchService] Failed to initialize services:', error);
    }
  }

  /**
   * Populate hybrid search indexes
   */
  async populateHybridSearchIndexes(): Promise<void> {
    try {
      const result = await this.serviceInitializer.populateHybridSearchIndexes();
      if (!result.success) {
        console.warn('[UniversalSearchService] Failed to populate indexes:', result.error);
      }
    } catch (error) {
      console.error('[UniversalSearchService] Error populating indexes:', error);
    }
  }

  /**
   * Execute consolidated search (returns consolidated results)
   */
  async executeConsolidatedSearch(params: UniversalSearchParams): Promise<ConsolidatedSearchResult[]> {
    try {
      const startTime = performance.now();
      const { query, limit = 5 } = params;


      // 1. Parse query
      const parseStart = performance.now();
      const parseResult = this.queryParser.parseSearchQuery(query);
      const parseTime = performance.now() - parseStart;
      
      if (!parseResult.success) {
        throw new Error(parseResult.error);
      }

      const parsedQuery = parseResult.parsed!;

      // 2. Filter files by metadata if needed
      let filteredFiles: TFile[] | undefined;
      if (parsedQuery.tags.length > 0 || parsedQuery.properties.length > 0) {
        const filterStart = performance.now();
        
        const criteria: MetadataSearchCriteria = {
          tags: parsedQuery.tags,
          properties: parsedQuery.properties,
          matchAll: true
        };
        
        if (this.metadataSearchService) {
          filteredFiles = await this.metadataSearchService.getFilesMatchingMetadata(criteria);
          const filterTime = performance.now() - filterStart;
        }
      }

      // 3. Search content
      const contentStart = performance.now();
      const contentResult = await this.contentSearchStrategy.searchContent(
        parsedQuery.cleanQuery,
        filteredFiles,
        limit,
        params
      );
      const contentTime = performance.now() - contentStart;

      // 4. Consolidate results
      const consolidateStart = performance.now();
      const consolidateResult = await this.resultConsolidator.consolidateResultsByFile(
        contentResult.results || []
      );
      const consolidateTime = performance.now() - consolidateStart;

      if (!consolidateResult.success) {
        throw new Error(consolidateResult.error);
      }

      const totalTime = performance.now() - startTime;

      return consolidateResult.results || [];
    } catch (error) {
      console.error('[UNIVERSAL_SEARCH] Consolidated search failed:', error);
      return [];
    }
  }

  /**
   * Execute universal search (returns formatted universal search result)
   */
  async executeUniversalSearch(params: UniversalSearchParams): Promise<UniversalSearchResult> {
    try {
      const startTime = performance.now();
      const { query, limit = 5 } = params;

      // 1. Parse query
      const parseResult = this.queryParser.parseSearchQuery(query);
      if (!parseResult.success) {
        return this.resultFormatter.createErrorResult(query, parseResult.error!);
      }

      const parsedQuery = parseResult.parsed!;

      // 2. Filter files by metadata if needed
      let filteredFiles: TFile[] | undefined;
      if (parsedQuery.tags.length > 0 || parsedQuery.properties.length > 0) {
        const criteria: MetadataSearchCriteria = {
          tags: parsedQuery.tags,
          properties: parsedQuery.properties,
          matchAll: true
        };
        
        if (this.metadataSearchService) {
          filteredFiles = await this.metadataSearchService.getFilesMatchingMetadata(criteria);
        }
      }

      // 3. Execute parallel searches
      const [contentResult, fileResult, tagResult, propertyResult] = await Promise.all([
        this.contentSearchStrategy.searchContent(parsedQuery.cleanQuery, filteredFiles, limit, params),
        this.fileSearchStrategy.searchFiles(query, limit),
        this.metadataSearchStrategy.searchTags(query, limit),
        this.metadataSearchStrategy.searchProperties(query, limit)
      ]);

      // 4. Extract results
      const contentResults = contentResult.results || [];
      const fileResults = fileResult.results || [];
      const tagResults = tagResult.results || [];
      const propertyResults = propertyResult.results || [];

      // 5. Format results
      const executionTime = performance.now() - startTime;
      const semanticAvailable = this.serviceInitializer.isSemanticSearchAvailable();

      const formatResult = this.resultFormatter.formatUniversalSearchResult(
        query,
        contentResults,
        fileResults,
        tagResults,
        propertyResults,
        executionTime,
        limit,
        semanticAvailable,
        {}
      );

      if (!formatResult.success) {
        return this.resultFormatter.createErrorResult(query, formatResult.error!);
      }

      return formatResult.result!;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.resultFormatter.createErrorResult(params.query, errorMessage);
    }
  }

  /**
   * Get service diagnostics
   */
  async getServiceDiagnostics(): Promise<any> {
    try {
      return await this.serviceInitializer.getServiceDiagnostics();
    } catch (error) {
      return {
        services: {
          metadataSearch: false,
          hnswSearch: false,
          hybridSearch: false,
          embedding: false,
          memory: false,
          workspace: false
        },
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check if semantic search is available
   */
  isSemanticSearchAvailable(): boolean {
    return this.serviceInitializer.isSemanticSearchAvailable();
  }

  /**
   * Check if hybrid search is available
   */
  isHybridSearchAvailable(): boolean {
    return this.serviceInitializer.isHybridSearchAvailable();
  }

  /**
   * Get search capabilities
   */
  getSearchCapabilities(): {
    content: boolean;
    files: boolean;
    tags: boolean;
    properties: boolean;
    semantic: boolean;
    hybrid: boolean;
  } {
    return {
      content: true,
      files: true,
      tags: true,
      properties: true,
      semantic: this.isSemanticSearchAvailable(),
      hybrid: this.isHybridSearchAvailable()
    };
  }

  /**
   * Update services (for hot-reloading)
   */
  updateServices(services: {
    embeddingService?: EmbeddingService;
    memoryService?: MemoryService;
    workspaceService?: WorkspaceService;
  }): void {
    // Update service references (HNSW service removed)
    
    if (services.embeddingService) {
      this.embeddingService = services.embeddingService;
      this.serviceInitializer.updateService('embeddingService', services.embeddingService);
    }
    
    if (services.memoryService) {
      this.memoryService = services.memoryService;
      this.serviceInitializer.updateService('memoryService', services.memoryService);
    }
    
    if (services.workspaceService) {
      this.workspaceService = services.workspaceService;
      this.serviceInitializer.updateService('workspaceService', services.workspaceService);
    }

    // Update search strategies
    const initializedServices = this.serviceInitializer.getServices();
    this.contentSearchStrategy.updateServices(
      initializedServices.hybridSearchService
    );
  }
}