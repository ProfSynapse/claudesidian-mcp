/**
 * HybridSearchService - Combines semantic, keyword, and fuzzy search with intelligent ranking
 * Implements multi-stage hybrid pipeline with RRF fusion and adaptive scoring
 */

import { TFile } from 'obsidian';
import { QueryAnalyzer, QueryAnalysis } from './QueryAnalyzer';
import { KeywordSearchService, KeywordSearchResult, SearchableDocument } from './KeywordSearchService';
import { FuzzySearchService, FuzzySearchResult, FuzzyDocument } from './FuzzySearchService';
import { IVectorStore } from '../../interfaces/IVectorStore';
import { EmbeddingService } from '../EmbeddingService';
import { SearchServiceValidator, SearchDependencyError, SearchType } from '../../../services/search/SearchServiceValidator';
import { CollectionLifecycleManager } from '../CollectionLifecycleManager';

// Supporting interfaces for caching and performance
interface CachedResult {
  results: HybridSearchResult[];
  timestamp: number;
  query: string;
}

interface PerformanceMetrics {
  hybridSearches: OperationMetric[];
  semanticSearches: OperationMetric[];
  cacheHits: number;
  cacheMisses: number;
  errors: ErrorMetric[];
}

interface OperationMetric {
  timestamp: number;
  duration: number;
  resultCount: number;
  methods?: string[];
}

interface ErrorMetric {
  timestamp: number;
  type: string;
  message: string;
}

// Performance metrics class
class PerformanceMetricsImpl {
  private metrics = {
    hybridSearches: [] as OperationMetric[],
    semanticSearches: [] as OperationMetric[],
    cacheHits: 0,
    cacheMisses: 0,
    errors: [] as ErrorMetric[]
  };

  recordHybridSearch(duration: number, resultCount: number, methods: string[]): void {
    this.metrics.hybridSearches.push({
      timestamp: Date.now(),
      duration,
      resultCount,
      methods
    });
    if (this.metrics.hybridSearches.length > 100) {
      this.metrics.hybridSearches.shift();
    }
  }

  recordSemanticSearch(duration: number, resultCount: number): void {
    this.metrics.semanticSearches.push({
      timestamp: Date.now(),
      duration,
      resultCount
    });
    if (this.metrics.semanticSearches.length > 100) {
      this.metrics.semanticSearches.shift();
    }
  }

  recordCacheHit(): void { 
    this.metrics.cacheHits++; 
  }
  
  recordCacheMiss(): void { 
    this.metrics.cacheMisses++; 
  }
  
  recordSemanticSearchError(error: Error): void {
    this.metrics.errors.push({
      timestamp: Date.now(),
      type: 'semantic_search',
      message: error.message
    });
  }
}

export interface HybridSearchResult {
  id: string;
  title: string;
  snippet: string;
  score: number;
  searchMethod: 'hybrid';
  originalMethods: string[];
  metadata: {
    filePath: string;
    fileId: string;
    timestamp: number;
    hybridScore: number;
    methodScores: MethodScores;
    contentTypeBoost: number;
    exactMatchBoost: number;
    finalRank: number;
    // Enhanced quality metadata
    qualityTier?: 'high' | 'medium' | 'low' | 'minimal';
    confidenceLevel?: number;
    matchType?: string;
    qualityDescription?: string;
    scoreMethod?: string;
  };
  content?: string;
}

export interface MethodScores {
  semantic?: number;
  keyword?: number;
  fuzzy?: number;
}

export interface HybridSearchOptions {
  limit?: number;
  includeContent?: boolean;
  forceSemanticSearch?: boolean;
  keywordThreshold?: number;
  fuzzyThreshold?: number;
  queryType?: 'exact' | 'conceptual' | 'exploratory' | 'mixed';
}

export interface RerankItem {
  id: string;
  score: number;
  method: string;
}

export class HybridSearchService {
  private queryAnalyzer: QueryAnalyzer;
  private keywordSearchService: KeywordSearchService;
  private fuzzySearchService: FuzzySearchService;
  
  // Direct ChromaDB dependencies
  private vectorStore?: IVectorStore;
  private embeddingService?: EmbeddingService;
  
  // Search validation and dependency management
  private searchValidator?: SearchServiceValidator;
  private collectionLifecycleManager?: CollectionLifecycleManager;
  
  // Performance and caching components
  private resultCache: Map<string, CachedResult>;
  private performanceMetrics: PerformanceMetricsImpl;

  constructor(
    vectorStore?: IVectorStore,
    embeddingService?: EmbeddingService,
    collectionLifecycleManager?: CollectionLifecycleManager
  ) {
    // Direct dependency injection
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    this.collectionLifecycleManager = collectionLifecycleManager;
    
    // Initialize search validator if we have the required dependencies
    if (vectorStore && collectionLifecycleManager) {
      this.searchValidator = new SearchServiceValidator(vectorStore, collectionLifecycleManager);
    } else {
      console.warn('[HybridSearchService] Initialized without collection validation - search errors may occur');
    }
    
    // Initialize existing services
    this.queryAnalyzer = new QueryAnalyzer();
    this.keywordSearchService = new KeywordSearchService();
    this.fuzzySearchService = new FuzzySearchService();
    
    // Initialize new components
    this.resultCache = new Map();
    this.performanceMetrics = new PerformanceMetricsImpl();
  }

  /**
   * Check if semantic search is available
   */
  isSemanticSearchAvailable(): boolean {
    return !!(this.vectorStore && this.embeddingService);
  }

  /**
   * Set collection lifecycle manager and initialize search validator
   * Called when CollectionLifecycleManager becomes available
   */
  setCollectionLifecycleManager(collectionLifecycleManager: CollectionLifecycleManager): void {
    this.collectionLifecycleManager = collectionLifecycleManager;
    
    if (this.vectorStore && collectionLifecycleManager) {
      this.searchValidator = new SearchServiceValidator(this.vectorStore, collectionLifecycleManager);
      console.log('[HybridSearchService] Collection validation enabled - search reliability improved');
    }
  }

  /**
   * Get search health status
   */
  async getSearchHealthStatus(): Promise<{
    semantic: boolean;
    keyword: boolean;
    fuzzy: boolean;
    collectionValidation: boolean;
    collections?: Record<string, any>;
  }> {
    const status = {
      semantic: this.isSemanticSearchAvailable(),
      keyword: true, // Always available
      fuzzy: true,   // Always available
      collectionValidation: !!this.searchValidator,
      collections: undefined as Record<string, any> | undefined
    };

    if (this.searchValidator) {
      try {
        status.collections = await this.searchValidator.getSearchHealthStatus();
      } catch (error) {
        console.error('[HybridSearchService] Failed to get collection health status:', error);
      }
    }

    return status;
  }

  /**
   * Main hybrid search method with collection validation and graceful degradation
   */
  async search(
    query: string,
    options: HybridSearchOptions = {},
    filteredFiles?: TFile[]
  ): Promise<HybridSearchResult[]> {
    const {
      limit = 10,
      includeContent = false,
      keywordThreshold = 0.3,
      fuzzyThreshold = 0.6
    } = options;

    // NEW: Validate search dependencies before operation
    let searchCapabilities = {
      semantic: false,
      keyword: true, // Keyword search doesn't require collections
      fuzzy: true    // Fuzzy search doesn't require collections
    };

    if (this.searchValidator) {
      try {
        console.log('[HybridSearchService] Validating search dependencies...');
        await this.searchValidator.ensureCollectionsReady('hybrid');
        searchCapabilities.semantic = this.isSemanticSearchAvailable();
        console.log('[HybridSearchService] All collections ready for hybrid search');
      } catch (error) {
        if (error instanceof SearchDependencyError) {
          console.warn('[HybridSearchService] Search dependency issues detected:', error.message);
          
          // Check what search methods are still available
          searchCapabilities.semantic = false;
          
          // Provide user-friendly error information
          const fallbackMethods = error.fallbackOptions.filter(method => 
            method === 'fuzzy' || method === 'keyword'
          );
          
          if (fallbackMethods.length > 0) {
            console.warn(`[HybridSearchService] Falling back to available search methods: ${fallbackMethods.join(', ')}`);
          } else {
            console.error('[HybridSearchService] No search methods available - collections may be corrupted');
          }
        } else {
          console.error('[HybridSearchService] Unexpected error during dependency validation:', error);
          // Continue with degraded capabilities
        }
      }
    } else {
      // No validation available - use existing availability checks
      searchCapabilities.semantic = this.isSemanticSearchAvailable();
    }


    // Stage 1: Determine search strategy (LLM-provided or auto-analyze)
    let analysis: QueryAnalysis;
    if (options.queryType) {
      // Use LLM-provided query type and generate analysis based on it
      analysis = this.createAnalysisFromQueryType(query, options.queryType);
    } else {
      // Fallback to automatic analysis
      analysis = this.queryAnalyzer.analyzeQuery(query);
    }

    // Stage 2: Execute parallel searches based on weights
    const searchPromises: Promise<any[]>[] = [];
    const methods: string[] = [];

    // Check index status before searching
    const keywordStats = this.keywordSearchService.getStats();
    const fuzzyStats = this.fuzzySearchService.getStats();

    // Semantic search (Using ChromaDB) - Now with collection validation
    if (analysis.weights.semantic > 0.1 && searchCapabilities.semantic) {
      try {
        searchPromises.push(this.executeSemanticSearch(query, analysis, limit, filteredFiles));
        methods.push('semantic');
      } catch (error) {
        console.error('[HybridSearchService] Semantic search setup failed:', error);
        // Continue without semantic search
      }
    } else if (analysis.weights.semantic > 0.1) {
      console.warn('[HybridSearchService] Semantic search requested but not available - skipping');
    }

    // Keyword search
    if (analysis.weights.keyword > 0.1) {
      searchPromises.push(this.executeKeywordSearch(query, analysis, limit, keywordThreshold, filteredFiles));
      methods.push('keyword');
    }

    // Fuzzy search
    if (analysis.weights.fuzzy > 0.1) {
      searchPromises.push(this.executeFuzzySearch(query, analysis, limit, fuzzyThreshold, filteredFiles));
      methods.push('fuzzy');
    }

    if (searchPromises.length === 0) {
      return [];
    }

    // Execute all searches in parallel
    const searchStart = Date.now();
    const searchResults = await Promise.all(searchPromises);
    const searchTime = Date.now() - searchStart;

    // Stage 3: Combine results using Reciprocal Rank Fusion
    searchResults.forEach((results, i) => {
      if (results.length > 0) {
        const scores = results.map((r: any) => r.score);
        console.log(`[HybridSearchService] ${methods[i]} results: ${results.length} items, scores: ${scores.slice(0, 3).map(s => s.toFixed(3)).join(', ')}${scores.length > 3 ? '...' : ''}`);
      }
    });
    
    const fusionStart = Date.now();
    const fusedResults = this.fuseResults(searchResults, methods, analysis);
    const fusionTime = Date.now() - fusionStart;
    
    // Validate fusion results
    if (fusedResults.length > 0) {
      const fusedScores = fusedResults.map(r => r.score);
      const isFusedOrdered = fusedScores.every((score, i) => i === 0 || fusedScores[i-1] >= score);
      
      // Show top 3 fused results for verification
      fusedResults.slice(0, 3).forEach((result, i) => {
        console.log(`[HybridSearchService] Fused #${i+1}: ${result.title.substring(0, 30)}... score=${result.score.toFixed(3)}`);
      });
    }

    // Stage 4: Apply hybrid ranking with content type and exact match boosts
    const rankingStart = Date.now();
    const rankedResults = this.applyHybridRanking(fusedResults, analysis, query);
    const rankingTime = Date.now() - rankingStart;
    
    // Validate final ranking
    if (rankedResults.length > 0) {
      const finalScores = rankedResults.map(r => r.score);
      const isFinalOrdered = finalScores.every((score, i) => i === 0 || finalScores[i-1] >= score);
      
      // Show ranking boosts applied
      rankedResults.slice(0, 3).forEach((result, i) => {
        const contentBoost = result.metadata.contentTypeBoost || 1.0;
        const exactBoost = result.metadata.exactMatchBoost || 1.0;
        console.log(`[HybridSearchService] Final #${i+1}: ${result.title.substring(0, 30)}... score=${result.score.toFixed(3)} (content: ${contentBoost.toFixed(2)}x, exact: ${exactBoost.toFixed(2)}x)`);
      });
    }

    // Stage 5: Format final results
    const finalResults = rankedResults.slice(0, limit).map((result, index) => ({
      ...result,
      searchMethod: 'hybrid' as const,
      originalMethods: methods,
      metadata: {
        ...result.metadata,
        finalRank: index + 1
      },
      content: includeContent ? result.content : undefined
    }));

    const totalTime = Date.now() - searchStart - searchTime; // Excluding parallel search time
    
    // Final validation and quality distribution analysis
    if (finalResults.length > 0) {
      const qualityDistribution = this.calculateQualityDistribution(finalResults);
      console.log(`[HybridSearchService] Quality distribution:`, qualityDistribution);
    }
    
    return finalResults;
  }

  /**
   * Execute semantic search using ChromaDB with enhanced error handling
   * ENHANCED: Score-based ranking with collection validation and recovery
   */
  private async executeSemanticSearch(
    query: string,
    analysis: QueryAnalysis,
    limit: number,
    filteredFiles?: TFile[]
  ): Promise<any[]> {
    // Return empty if semantic search unavailable
    if (!this.isSemanticSearchAvailable()) {
      console.warn('[HybridSearchService] Semantic search not available - missing vectorStore or embeddingService');
      return [];
    }
    
    console.log(`[HybridSearchService] Executing semantic search (threshold-free, score-based ranking)`);

    try {
      // Additional collection validation if validator is available
      if (this.searchValidator) {
        const validation = await this.searchValidator.validateSearchDependencies('semantic');
        if (!validation.valid) {
          console.error('[HybridSearchService] Semantic search validation failed:', validation);
          throw new SearchDependencyError(
            'Semantic search dependencies not available',
            validation.missingCollections,
            validation.corruptedCollections,
            validation.fallbackAvailable ? ['fuzzy', 'keyword'] : []
          );
        }
      }
      const startTime = Date.now();

      // Generate query embedding
      const embeddingStart = Date.now();
      const embedding = await this.embeddingService!.getEmbedding(query);
      const embeddingTime = Date.now() - embeddingStart;
      
      if (!embedding) {
        throw new Error('Failed to generate embedding for query');
      }
      
      console.log(`[HybridSearchService] Generated embedding in ${embeddingTime}ms`);
      
      // Direct ChromaDB semantic search using query method
      const queryStart = Date.now();
      const queryResult = await this.vectorStore!.query(
        'file_embeddings', // Standard collection name for file embeddings
        {
          queryEmbeddings: [embedding],
          nResults: limit, // No over-fetching - get exactly what we need
          include: ['embeddings', 'metadatas', 'documents', 'distances'],
          where: filteredFiles ? {
            filePath: { $in: filteredFiles.map(f => f.path) }
          } : undefined
        }
      );
      const queryTime = Date.now() - queryStart;
      
      console.log(`[HybridSearchService] ChromaDB query completed in ${queryTime}ms, found ${queryResult.ids[0]?.length || 0} results`);

      // Convert query result to expected format
      const results = [];
      
      if (queryResult.ids[0]) {
        console.log(`[HybridSearchService] Processing ${queryResult.ids[0].length} semantic results...`);
        
        for (let i = 0; i < queryResult.ids[0].length; i++) {
          const distance = queryResult.distances?.[0]?.[i] || 0;
          const score = Math.max(0, 1 - distance); // Convert distance to similarity score
          const fileId = queryResult.ids[0][i];
          const metadata = queryResult.metadatas?.[0]?.[i] || {};
          
          console.log(`[HybridSearchService] Result #${i+1}: distance=${distance.toFixed(3)}, score=${score.toFixed(3)}, id=${fileId}`);
          
          // Include all results, ranked by similarity score
          const qualityAssessment = this.classifySemanticQuality(score);
          
          results.push({
            id: fileId,
            content: queryResult.documents?.[0]?.[i] || '',
            metadata: {
              ...metadata,
              // Enhanced quality metadata
              qualityTier: qualityAssessment.tier,
              confidenceLevel: qualityAssessment.confidence,
              matchType: qualityAssessment.matchType,
              qualityDescription: qualityAssessment.description,
              scoreMethod: 'semantic',
              originalDistance: distance
            },
            score,
            distance
          });
        }
      }

      // Quality distribution analysis
      if (results.length > 0) {
        const qualityDistribution = this.calculateQualityDistribution(results);
        console.log(`[HybridSearchService] Semantic quality distribution:`, qualityDistribution);
      }
      
      // Score ordering validation
      if (results.length > 1) {
        const scores = results.map(r => r.score);
        const isProperlyOrdered = scores.every((score, i) => i === 0 || scores[i-1] >= score);
        console.log(`[HybridSearchService] Semantic results properly ordered: ${isProperlyOrdered}`);
      }

      // Format results for hybrid search compatibility
      const formattedResults = this.formatSemanticResults(results, query, analysis);

      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceMetrics.recordSemanticSearch(duration, formattedResults.length);

      console.log(`[HybridSearchService] Semantic search completed in ${duration}ms, returning ${formattedResults.length} results`);

      return formattedResults;
    } catch (error) {
      console.error('[HybridSearchService] Semantic search error:', {
        query,
        searchMode: 'score-based ranking (threshold-free)',
        hasVectorStore: !!this.vectorStore,
        hasEmbeddingService: !!this.embeddingService,
        hasSearchValidator: !!this.searchValidator,
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.performanceMetrics.recordSemanticSearchError(error as Error);
      
      // Enhanced error handling with recovery attempt
      if (this.searchValidator && error instanceof Error) {
        try {
          const recoveryResult = await this.searchValidator.handleSearchFailure('semantic', error);
          if (recoveryResult.recoveryAttempted) {
            console.log('[HybridSearchService] Search failure recovery attempted:', recoveryResult);
          }
          if (recoveryResult.fallbackOptions.length > 0) {
            console.warn(`[HybridSearchService] Consider using fallback search methods: ${recoveryResult.fallbackOptions.join(', ')}`);
          }
        } catch (recoveryError) {
          console.error('[HybridSearchService] Recovery attempt failed:', recoveryError);
        }
      }
      
      return []; // Graceful degradation
    }
  }

  /**
   * Execute keyword search
   * ENHANCED: Score-based ranking with threshold removal and quality classification
   */
  private async executeKeywordSearch(
    query: string,
    analysis: QueryAnalysis,
    limit: number,
    threshold: number,
    filteredFiles?: TFile[]
  ): Promise<KeywordSearchResult[]> {
    console.log(`[HybridSearchService] Executing keyword search with ${threshold > 0 ? 'threshold=' + threshold : 'score-based ranking'}`);
    
    const useThresholdFiltering = threshold > 0;
    
    // Get raw BM25 results without over-fetching
    const rawResults = this.keywordSearchService.search(
      query,
      limit, // No over-fetching - get exactly what we need
      analysis.exactPhrases,
      filteredFiles
    );
    
    if (rawResults.length > 0) {
      const scores = rawResults.map(r => r.score);
      console.log(`[HybridSearchService] Keyword search found ${rawResults.length} results, scores: ${scores.slice(0, 3).map(s => s.toFixed(3)).join(', ')}${scores.length > 3 ? '...' : ''}`);
      
      // Validate score ordering
      const isProperlyOrdered = scores.every((score, i) => i === 0 || scores[i-1] >= score);
      console.log(`[HybridSearchService] Keyword results properly ordered: ${isProperlyOrdered}`);
    }
    
    // Process with quality classification instead of filtering
    const processedResults = this.processKeywordResults(rawResults, query);
    
    // Apply score-based ranking or threshold filtering
    const finalResults = useThresholdFiltering 
      ? processedResults.filter(result => result.score >= threshold)
      : processedResults; // Include all results for score-based ranking
    
    if (!useThresholdFiltering && finalResults.length > 0) {
      const qualityDistribution = this.calculateQualityDistribution(finalResults);
      console.log(`[HybridSearchService] Keyword quality distribution:`, qualityDistribution);
    }
    
    return finalResults;
  }

  /**
   * Execute fuzzy search  
   * ENHANCED: Score-based ranking with quality classification
   */
  private async executeFuzzySearch(
    query: string,
    analysis: QueryAnalysis,
    limit: number,
    threshold: number,
    filteredFiles?: TFile[]
  ): Promise<FuzzySearchResult[]> {
    console.log(`[HybridSearchService] Executing fuzzy search with ${threshold > 0 ? 'threshold=' + threshold : 'score-based ranking'}`);
    
    const useThresholdFiltering = threshold > 0;
    
    // Score-based ranking: Pass threshold=0 when we want all results
    const effectiveThreshold = useThresholdFiltering ? threshold : 0;
    
    const results = this.fuzzySearchService.search(
      query,
      analysis.fuzzyTerms,
      limit, // No over-fetching
      effectiveThreshold, // Pass 0 for score-based ranking
      filteredFiles
    );
    
    if (results.length > 0) {
      const scores = results.map(r => r.score);
      console.log(`[HybridSearchService] Fuzzy search found ${results.length} results, scores: ${scores.slice(0, 3).map(s => s.toFixed(3)).join(', ')}${scores.length > 3 ? '...' : ''}`);
      
      // Validate score ordering
      const isProperlyOrdered = scores.every((score, i) => i === 0 || scores[i-1] >= score);
      console.log(`[HybridSearchService] Fuzzy results properly ordered: ${isProperlyOrdered}`);
      
      // Quality analysis (FuzzySearchService already includes quality metadata)
      if (!useThresholdFiltering) {
        const qualityStats = results.map(r => r.metadata?.qualityTier || 'minimal').reduce((acc: any, tier: any) => {
          acc[tier] = (acc[tier] || 0) + 1;
          return acc;
        }, {});
        console.log(`[HybridSearchService] Fuzzy quality distribution:`, qualityStats);
      }
    }
    
    return results;
  }

  /**
   * Fuse results from different search methods using Reciprocal Rank Fusion
   */
  private fuseResults(
    searchResults: any[][],
    methods: string[],
    analysis: QueryAnalysis
  ): Array<HybridSearchResult & { originalResults: any[] }> {
    // Combine all results and flatten
    const allResults: any[] = [];
    const resultMap = new Map<string, any[]>();

    searchResults.forEach((results, methodIndex) => {
      const method = methods[methodIndex];
      
      results.forEach((result, rank) => {
        // Store original results for later reference
        if (!resultMap.has(result.id)) {
          resultMap.set(result.id, []);
        }
        resultMap.get(result.id)!.push({ ...result, method, rank });
        
        // Add to flattened list with method info
        allResults.push({
          id: result.id,
          score: result.score,
          method,
          rank,
          originalResult: result
        });
      });
    });

    // Simple RRF implementation since the library function signature is different
    const k = 60; // RRF constant
    const scoreMap = new Map<string, number>();
    const detailMap = new Map<string, any>();

    searchResults.forEach((results, methodIndex) => {
      const method = methods[methodIndex];
      const weight = this.getMethodWeight(method, analysis);
      
      results.forEach((result, rank) => {
        const rrfScore = weight / (k + rank + 1);
        const currentScore = scoreMap.get(result.id) || 0;
        scoreMap.set(result.id, currentScore + rrfScore);
        
        if (!detailMap.has(result.id)) {
          detailMap.set(result.id, result);
        }
      });
    });

    // Sort by RRF score and convert to hybrid results
    const sortedResults = Array.from(scoreMap.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([id, score]) => {
        const primaryResult = detailMap.get(id);
        const originalResults = resultMap.get(id) || [];
        
        // Calculate method scores
        const methodScores: MethodScores = {};
        originalResults.forEach(result => {
          methodScores[result.method as keyof MethodScores] = result.score;
        });

        return {
          id,
          title: primaryResult.title,
          snippet: primaryResult.snippet,
          score,
          searchMethod: 'hybrid' as const,
          originalMethods: originalResults.map(r => r.method),
          metadata: {
            filePath: primaryResult.metadata?.filePath || primaryResult.filePath,
            fileId: id,
            timestamp: Date.now(),
            hybridScore: score,
            methodScores,
            contentTypeBoost: 1.0,
            exactMatchBoost: 1.0,
            finalRank: 0
          },
          content: primaryResult.content,
          originalResults
        };
      });

    return sortedResults;
  }

  /**
   * Create analysis from LLM-provided query type
   */
  private createAnalysisFromQueryType(query: string, queryType: 'exact' | 'conceptual' | 'exploratory' | 'mixed'): QueryAnalysis {
    // Use basic analysis for keywords and phrases, but override the weights based on LLM decision
    const baseAnalysis = this.queryAnalyzer.analyzeQuery(query);
    
    // Override with LLM-determined query type and corresponding weights
    let weights: { semantic: number; keyword: number; fuzzy: number };
    
    switch (queryType) {
      case 'exact':
        weights = { keyword: 0.7, semantic: 0.2, fuzzy: 0.1 };
        break;
      case 'conceptual':
        weights = { semantic: 0.6, keyword: 0.3, fuzzy: 0.1 };
        break;
      case 'exploratory':
        weights = { semantic: 0.8, fuzzy: 0.15, keyword: 0.05 };
        break;
      case 'mixed':
      default:
        weights = { semantic: 0.4, keyword: 0.4, fuzzy: 0.2 };
        break;
    }

    return {
      ...baseAnalysis,
      queryType,
      weights
    };
  }

  /**
   * Get method weight based on query analysis
   */
  private getMethodWeight(method: string, analysis: QueryAnalysis): number {
    switch (method) {
      case 'semantic': return analysis.weights.semantic;
      case 'keyword': return analysis.weights.keyword;
      case 'fuzzy': return analysis.weights.fuzzy;
      default: return 1.0;
    }
  }

  /**
   * Apply hybrid ranking with content type and exact match boosts
   */
  private applyHybridRanking(
    results: Array<HybridSearchResult & { originalResults: any[] }>,
    analysis: QueryAnalysis,
    originalQuery: string
  ): HybridSearchResult[] {
    const contentTypeBoosts = this.queryAnalyzer.getContentTypeBoosts(analysis);
    
    return results.map(result => {
      let finalScore = result.score;
      
      // Apply content type boost
      const contentTypeBoost = this.getContentTypeBoost(result, contentTypeBoosts);
      finalScore *= contentTypeBoost;
      
      // Apply exact match boost
      const exactMatchBoost = this.getExactMatchBoost(result, analysis, originalQuery);
      finalScore *= exactMatchBoost;
      
      // Apply technical term boost
      const technicalBoost = this.getTechnicalTermBoost(result, analysis);
      finalScore *= technicalBoost;
      
      return {
        ...result,
        score: finalScore,
        metadata: {
          ...result.metadata,
          contentTypeBoost,
          exactMatchBoost: exactMatchBoost * technicalBoost
        }
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate content type boost based on where content appears
   */
  private getContentTypeBoost(
    result: HybridSearchResult & { originalResults: any[] },
    contentTypeBoosts: Record<string, number>
  ): number {
    // Analyze the snippet/content to determine type
    const snippet = result.snippet.toLowerCase();
    const title = result.title.toLowerCase();
    
    // Check if this looks like a tag chunk
    if (snippet.startsWith('#') && snippet.split(' ').every(word => word.startsWith('#') || word.length <= 3)) {
      return contentTypeBoosts.tags;
    }
    
    // Check if this looks like a header
    if (snippet.startsWith('##') || snippet.startsWith('###')) {
      return contentTypeBoosts.headers;
    }
    
    // Check if this looks like code
    if (snippet.includes('```') || snippet.includes('`')) {
      return contentTypeBoosts.codeBlocks;
    }
    
    // Default to main content
    return contentTypeBoosts.mainContent;
  }

  /**
   * Calculate exact match boost for literal term matches
   */
  private getExactMatchBoost(
    result: HybridSearchResult & { originalResults: any[] },
    analysis: QueryAnalysis,
    originalQuery: string
  ): number {
    const snippet = result.snippet.toLowerCase();
    const title = result.title.toLowerCase();
    
    let boost = 1.0;
    
    // Check for exact phrase matches in title (highest boost)
    for (const phrase of analysis.exactPhrases) {
      if (title.includes(phrase.toLowerCase())) {
        boost *= 2.0;
      }
    }
    
    // Check for exact phrase matches in content
    for (const phrase of analysis.exactPhrases) {
      if (snippet.includes(phrase.toLowerCase())) {
        boost *= 1.5;
      }
    }
    
    // Check for keyword matches
    for (const keyword of analysis.keywords) {
      if (snippet.includes(keyword.toLowerCase())) {
        boost *= 1.2;
      }
    }
    
    // Special boost for header matches (addresses clustering issue)
    const queryLower = originalQuery.toLowerCase();
    if (snippet.includes(`### ${queryLower}`) || snippet.includes(`## ${queryLower}`)) {
      boost *= 3.0; // Strong boost for header matches
    }
    
    return Math.min(boost, 5.0); // Cap the boost to prevent extreme scores
  }

  /**
   * Calculate technical term boost for domain-specific content
   */
  private getTechnicalTermBoost(
    result: HybridSearchResult & { originalResults: any[] },
    analysis: QueryAnalysis
  ): number {
    if (analysis.technicalTerms.length === 0) return 1.0;
    
    const snippet = result.snippet.toLowerCase();
    const title = result.title.toLowerCase();
    
    let technicalMatches = 0;
    for (const term of analysis.technicalTerms) {
      if (snippet.includes(term) || title.includes(term)) {
        technicalMatches++;
      }
    }
    
    // Boost based on proportion of technical terms found
    const technicalRatio = technicalMatches / analysis.technicalTerms.length;
    return 1.0 + (technicalRatio * 0.3); // Up to 30% boost for technical content
  }

  /**
   * Index a document in all search services
   */
  indexDocument(
    id: string,
    title: string,
    headers: string[],
    content: string,
    tags: string[],
    filePath: string,
    metadata: Record<string, any> = {}
  ): void {
    // Index for keyword search
    const searchableDoc: SearchableDocument = {
      id,
      title,
      headers,
      content,
      tags,
      filePath,
      metadata
    };
    this.keywordSearchService.indexDocument(searchableDoc);
    
    // Index for fuzzy search
    const fuzzyDoc: FuzzyDocument = {
      id,
      title,
      content: `${title} ${headers.join(' ')} ${content} ${tags.join(' ')}`,
      filePath,
      metadata
    };
    this.fuzzySearchService.indexDocument(fuzzyDoc);
  }

  /**
   * Remove a document from all search services
   */
  removeDocument(id: string): void {
    this.keywordSearchService.removeDocument(id);
    this.fuzzySearchService.removeDocument(id);
  }

  /**
   * Format ChromaDB semantic search results for hybrid search compatibility
   */
  private formatSemanticResults(
    chromaResults: any[],
    query: string,
    analysis: QueryAnalysis
  ): any[] {
    return chromaResults.map((result, index) => {
      // Extract relevant data from ChromaDB result
      const filePath = result.metadata?.filePath || result.filePath;
      const content = result.content || result.document || '';
      const score = result.score || result.distance || 0;
      
      // Generate snippet from content (for backward compatibility)
      // NOTE: This creates a truncated 150-char snippet, but full content is preserved in 'content' field
      const snippet = this.generateSnippet(content, query, 150);
      
      // Extract title from file path or metadata
      const title = result.metadata?.title || 
                   filePath?.split('/').pop()?.replace(/\.[^/.]+$/, '') || 
                   'Untitled';

      return {
        id: result.id || filePath,
        title,
        snippet,
        score,
        filePath,
        content, // Full embedded chunk available for ContentSearchStrategy
        searchMethod: 'semantic',
        metadata: {
          filePath,
          type: 'content',
          searchMethod: 'semantic',
          semanticScore: score,
          chunkIndex: result.metadata?.chunkIndex || 0,
          timestamp: Date.now(),
          // Enhanced metadata for full content mode
          hasFullContent: !!(content && content.length > 0),
          fullContentLength: content?.length || 0,
          snippetLength: snippet?.length || 0
        }
      };
    });
  }

  /**
   * Generate a contextual snippet from content around query terms
   */
  private generateSnippet(content: string, query: string, maxLength: number = 150): string {
    if (!content || content.length === 0) {
      return '';
    }

    // Clean up content - remove excessive whitespace and normalize
    const cleanContent = content.replace(/\s+/g, ' ').trim();
    
    if (cleanContent.length <= maxLength) {
      return cleanContent;
    }

    // Try to find query terms in content for contextual snippet
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    
    for (const term of queryTerms) {
      const termIndex = cleanContent.toLowerCase().indexOf(term);
      if (termIndex !== -1) {
        // Center the snippet around the found term
        const start = Math.max(0, termIndex - Math.floor(maxLength / 2));
        const end = Math.min(cleanContent.length, start + maxLength);
        
        let snippet = cleanContent.substring(start, end);
        
        // Add ellipses if truncated
        if (start > 0) snippet = '...' + snippet;
        if (end < cleanContent.length) snippet = snippet + '...';
        
        return snippet;
      }
    }

    // Fallback to beginning of content if no query terms found
    return cleanContent.substring(0, maxLength) + (cleanContent.length > maxLength ? '...' : '');
  }

  /**
   * Classify semantic search result quality
   */
  private classifySemanticQuality(score: number): {
    tier: 'high' | 'medium' | 'low' | 'minimal';
    confidence: number;
    matchType: string;
    description: string;
  } {
    if (score >= 0.85) {
      return {
        tier: 'high',
        confidence: score,
        matchType: 'highly-similar',
        description: 'Very strong semantic match'
      };
    } else if (score >= 0.65) {
      return {
        tier: 'medium',
        confidence: score,
        matchType: 'moderately-similar',
        description: 'Good semantic relevance'
      };
    } else if (score >= 0.35) {
      return {
        tier: 'low',
        confidence: score,
        matchType: 'loosely-related',
        description: 'Weak but potentially relevant'
      };
    } else {
      return {
        tier: 'minimal',
        confidence: score,
        matchType: 'tangentially-related',
        description: 'Very weak semantic connection'
      };
    }
  }

  /**
   * Process keyword results with score normalization and quality classification
   * ENHANCED: No 0.3 hardcoded threshold filtering
   */
  private processKeywordResults(results: KeywordSearchResult[], query: string): KeywordSearchResult[] {
    if (results.length === 0) return [];
    
    // Normalize BM25 scores to 0-1 range within this result set
    const maxScore = Math.max(...results.map(r => r.score));
    const minScore = Math.min(...results.map(r => r.score));
    const scoreRange = maxScore - minScore;
    
    const processedResults = results.map((result, index) => {
      // Normalized score for fair comparison
      const normalizedScore = scoreRange > 0 
        ? (result.score - minScore) / scoreRange 
        : 0.5; // Default to medium if all scores equal
      
      // Quality classification instead of filtering
      const qualityAssessment = this.classifyKeywordQuality(result.score, normalizedScore, query);
      
      console.log(`[HybridSearchService] Keyword result #${index+1}: BM25=${result.score.toFixed(3)} → normalized=${normalizedScore.toFixed(3)} (${qualityAssessment.tier})`);
      
      return {
        ...result,
        score: normalizedScore, // Use normalized score for RRF
        metadata: {
          ...result.metadata,
          // Preserve original BM25 information
          originalBM25Score: result.score,
          normalizedScore: normalizedScore,
          maxBM25InSet: maxScore,
          minBM25InSet: minScore,
          
          // Quality information
          qualityTier: qualityAssessment.tier,
          confidenceLevel: qualityAssessment.confidence,
          matchType: qualityAssessment.matchType,
          qualityDescription: qualityAssessment.description,
          scoreMethod: 'keyword'
        },
        searchMethod: 'keyword' as const
      };
    });
    
    return processedResults;
  }

  /**
   * Classify keyword search result quality
   */
  private classifyKeywordQuality(
    originalScore: number, 
    normalizedScore: number, 
    query: string
  ): {
    tier: 'high' | 'medium' | 'low' | 'minimal';
    confidence: number;
    matchType: string;
    description: string;
  } {
    // Classification based on both original BM25 and normalized scores
    const isExactMatch = originalScore > 2.0; // High BM25 typically indicates exact matches
    
    if (isExactMatch && normalizedScore >= 0.8) {
      return {
        tier: 'high',
        confidence: normalizedScore,
        matchType: 'exact-match',
        description: 'Exact term match with high relevance'
      };
    } else if (normalizedScore >= 0.6) {
      return {
        tier: 'medium',
        confidence: normalizedScore,
        matchType: 'strong-keyword-match',
        description: 'Strong keyword relevance'
      };
    } else if (normalizedScore >= 0.3) {
      return {
        tier: 'low',
        confidence: normalizedScore,
        matchType: 'partial-keyword-match',
        description: 'Partial keyword relevance'
      };
    } else {
      return {
        tier: 'minimal',
        confidence: normalizedScore,
        matchType: 'weak-keyword-match',
        description: 'Weak keyword connection'
      };
    }
  }

  /**
   * Calculate quality distribution for results
   */
  private calculateQualityDistribution(results: any[]): Record<string, number> {
    const distribution = { high: 0, medium: 0, low: 0, minimal: 0 };
    
    results.forEach(result => {
      const tier = result.metadata?.qualityTier || result.qualityAssessment?.tier || 'minimal';
      if (tier in distribution) {
        distribution[tier as keyof typeof distribution]++;
      }
    });
    
    return distribution;
  }

  /**
   * Get combined search statistics
   */
  getStats(): {
    keyword: any;
    fuzzy: any;
    semantic?: any;
  } {
    return {
      keyword: this.keywordSearchService.getStats(),
      fuzzy: this.fuzzySearchService.getStats(),
      semantic: this.isSemanticSearchAvailable() ? {
        available: true,
        provider: 'ChromaDB',
        vectorStore: !!this.vectorStore,
        embeddingService: !!this.embeddingService,
        scoreBasedRanking: true // Indicator of enhanced functionality
      } : undefined
    };
  }
}