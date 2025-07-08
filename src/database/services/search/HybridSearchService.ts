/**
 * HybridSearchService - Combines semantic, keyword, and fuzzy search with intelligent ranking
 * Implements multi-stage hybrid pipeline with RRF fusion and adaptive scoring
 */

import { TFile } from 'obsidian';
import { QueryAnalyzer, QueryAnalysis } from './QueryAnalyzer';
import { KeywordSearchService, KeywordSearchResult, SearchableDocument } from './KeywordSearchService';
import { FuzzySearchService, FuzzySearchResult, FuzzyDocument } from './FuzzySearchService';
import { HnswSearchService, SearchResult as SemanticSearchResult } from '../hnsw/HnswSearchService';

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
  semanticThreshold?: number;
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
  private semanticSearchService?: HnswSearchService;

  constructor(semanticSearchService?: HnswSearchService) {
    this.queryAnalyzer = new QueryAnalyzer();
    this.keywordSearchService = new KeywordSearchService();
    this.fuzzySearchService = new FuzzySearchService();
    this.semanticSearchService = semanticSearchService;
  }

  /**
   * Main hybrid search method
   */
  async search(
    query: string,
    options: HybridSearchOptions = {},
    filteredFiles?: TFile[]
  ): Promise<HybridSearchResult[]> {
    const {
      limit = 10,
      includeContent = false,
      semanticThreshold = 0.5,
      keywordThreshold = 0.3,
      fuzzyThreshold = 0.6
    } = options;

    // Stage 1: Determine search strategy (LLM-provided or auto-analyze)
    let analysis: QueryAnalysis;
    if (options.queryType) {
      // Use LLM-provided query type and generate analysis based on it
      console.log(`[HybridSearch] Using LLM-provided query type: ${options.queryType}`);
      analysis = this.createAnalysisFromQueryType(query, options.queryType);
    } else {
      // Fallback to automatic analysis
      console.log(`[HybridSearch] Using automatic query analysis`);
      analysis = this.queryAnalyzer.analyzeQuery(query);
    }
    
    console.log(`[HybridSearch] Final analysis:`, {
      queryType: analysis.queryType,
      weights: analysis.weights,
      keywords: analysis.keywords,
      exactPhrases: analysis.exactPhrases
    });

    // Stage 2: Execute parallel searches based on weights
    const searchPromises: Promise<any[]>[] = [];
    const methods: string[] = [];

    // Check index status before searching
    const keywordStats = this.keywordSearchService.getStats();
    const fuzzyStats = this.fuzzySearchService.getStats();
    console.log(`[HybridSearch] Index status - Keyword docs: ${keywordStats.totalDocuments}, Fuzzy docs: ${fuzzyStats.totalDocuments}`);

    // Semantic search
    if (analysis.weights.semantic > 0.1 && this.semanticSearchService) {
      console.log(`[HybridSearch] Running semantic search (weight: ${analysis.weights.semantic})`);
      searchPromises.push(this.executeSemanticSearch(query, analysis, limit, semanticThreshold, filteredFiles));
      methods.push('semantic');
    }

    // Keyword search
    if (analysis.weights.keyword > 0.1) {
      console.log(`[HybridSearch] Running keyword search (weight: ${analysis.weights.keyword}, docs: ${keywordStats.totalDocuments})`);
      searchPromises.push(this.executeKeywordSearch(query, analysis, limit, keywordThreshold, filteredFiles));
      methods.push('keyword');
    }

    // Fuzzy search
    if (analysis.weights.fuzzy > 0.1) {
      console.log(`[HybridSearch] Running fuzzy search (weight: ${analysis.weights.fuzzy}, docs: ${fuzzyStats.totalDocuments})`);
      searchPromises.push(this.executeFuzzySearch(query, analysis, limit, fuzzyThreshold, filteredFiles));
      methods.push('fuzzy');
    }

    if (searchPromises.length === 0) {
      return [];
    }

    // Execute all searches in parallel
    const searchResults = await Promise.all(searchPromises);

    // Stage 3: Combine results using Reciprocal Rank Fusion
    const fusedResults = this.fuseResults(searchResults, methods, analysis);

    // Stage 4: Apply hybrid ranking with content type and exact match boosts
    const rankedResults = this.applyHybridRanking(fusedResults, analysis, query);

    // Stage 5: Format final results
    return rankedResults.slice(0, limit).map((result, index) => ({
      ...result,
      searchMethod: 'hybrid' as const,
      originalMethods: methods,
      metadata: {
        ...result.metadata,
        finalRank: index + 1
      },
      content: includeContent ? result.content : undefined
    }));
  }

  /**
   * Execute semantic search
   */
  private async executeSemanticSearch(
    query: string,
    analysis: QueryAnalysis,
    limit: number,
    threshold: number,
    filteredFiles?: TFile[]
  ): Promise<SemanticSearchResult[]> {
    if (!this.semanticSearchService) return [];

    try {
      return await this.semanticSearchService.searchWithMetadataFilter(
        query,
        filteredFiles,
        { limit: limit * 2, threshold, includeContent: true }
      );
    } catch (error) {
      console.error('[HybridSearch] Semantic search failed:', error);
      return [];
    }
  }

  /**
   * Execute keyword search
   */
  private async executeKeywordSearch(
    query: string,
    analysis: QueryAnalysis,
    limit: number,
    threshold: number,
    filteredFiles?: TFile[]
  ): Promise<KeywordSearchResult[]> {
    return this.keywordSearchService.search(
      query,
      limit * 2,
      analysis.exactPhrases,
      filteredFiles
    ).filter(result => result.score >= threshold);
  }

  /**
   * Execute fuzzy search
   */
  private async executeFuzzySearch(
    query: string,
    analysis: QueryAnalysis,
    limit: number,
    threshold: number,
    filteredFiles?: TFile[]
  ): Promise<FuzzySearchResult[]> {
    return this.fuzzySearchService.search(
      query,
      analysis.fuzzyTerms,
      limit * 2,
      threshold,
      filteredFiles
    );
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
      semantic: this.semanticSearchService ? {
        hasIndex: this.semanticSearchService.hasIndex('file_embeddings'),
        stats: this.semanticSearchService.getIndexStats('file_embeddings')
      } : undefined
    };
  }
}