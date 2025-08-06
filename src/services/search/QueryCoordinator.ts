/**
 * QueryCoordinator.ts - Intelligent search coordination and strategy selection service
 * Location: src/services/search/QueryCoordinator.ts
 * Purpose: Coordinates multiple search methods, analyzes queries, and determines optimal search strategies
 * Used by: HybridSearchService to orchestrate semantic, keyword, and fuzzy searches
 */

import { TFile } from 'obsidian';
import { 
  SearchResult, 
  SearchResultSet, 
  SearchOptions,
  HybridSearchResult 
} from '../../types/search/SearchResults';
import { SearchValidationResult, SearchHealthStatus } from '../../types/search/SearchMetadata';
import { QueryAnalysis } from '../../database/services/search/QueryAnalyzer';
import { ResultFusionInterface } from './ResultFusion';

export interface SearchProvider {
  search(query: string, options?: any): Promise<SearchResult[]>;
  isAvailable(): boolean;
  getType(): string;
}

export interface QueryCoordinatorInterface {
  coordinateSearch(query: string, options?: SearchOptions): Promise<HybridSearchResult[]>;
  analyzeQuery(query: string): QueryAnalysis;
  determineSearchStrategies(analysis: QueryAnalysis, capabilities: SearchCapabilities): SearchStrategy[];
  validateSearchCapabilities(): Promise<SearchValidationResult>;
  getSearchHealthStatus(): Promise<SearchHealthStatus>;
}

export interface SearchCapabilities {
  semantic: boolean;
  keyword: boolean;
  fuzzy: boolean;
}

export interface SearchStrategy {
  type: 'semantic' | 'keyword' | 'fuzzy';
  weight: number;
  threshold?: number;
  priority: number;
}

export class QueryCoordinator implements QueryCoordinatorInterface {
  private semanticProvider?: SearchProvider;
  private keywordProvider?: SearchProvider;
  private fuzzyProvider?: SearchProvider;
  private fusion: ResultFusionInterface;
  private queryAnalyzer: any; // Will use the existing QueryAnalyzer

  constructor(
    semanticProvider: SearchProvider | undefined,
    keywordProvider: SearchProvider,
    fuzzyProvider: SearchProvider,
    fusion: ResultFusionInterface,
    queryAnalyzer?: any
  ) {
    this.semanticProvider = semanticProvider;
    this.keywordProvider = keywordProvider;
    this.fuzzyProvider = fuzzyProvider;
    this.fusion = fusion;
    this.queryAnalyzer = queryAnalyzer;
  }

  /**
   * Coordinates search across multiple providers
   */
  async coordinateSearch(
    query: string, 
    options?: SearchOptions
  ): Promise<HybridSearchResult[]> {
    const startTime = Date.now();
    
    // Analyze query to determine search strategy
    const analysis = this.analyzeQuery(query);
    
    // Determine available search capabilities
    const capabilities = await this.getSearchCapabilities();
    
    // Determine optimal search strategies
    const strategies = this.determineSearchStrategies(analysis, capabilities);
    
    if (strategies.length === 0) {
      console.warn('[QueryCoordinator] No search strategies available');
      return [];
    }

    // Execute searches in parallel
    const searchPromises = strategies.map(strategy => 
      this.executeSearchStrategy(strategy, query, analysis, options)
    );

    try {
      const searchResults = await Promise.all(searchPromises);
      
      // Filter out failed searches
      const validResults = searchResults.filter(result => result !== null);
      
      if (validResults.length === 0) {
        console.warn('[QueryCoordinator] All search strategies failed');
        return [];
      }

      // Create result sets for fusion
      const resultSets: SearchResultSet[] = validResults.map((results, index) => ({
        results: results!,
        weight: strategies[index].weight,
        type: strategies[index].type,
        method: strategies[index].type,
        executionTime: Date.now() - startTime
      }));

      // Fuse results using the fusion service
      const fusedResults = await this.fusion.fuse(resultSets, {
        strategy: 'rrf',
        maxResults: options?.limit || 50,
        scoreThreshold: options?.scoreThreshold
      });

      return fusedResults;

    } catch (error) {
      console.error('[QueryCoordinator] Search coordination failed:', error);
      return [];
    }
  }

  /**
   * Analyzes query characteristics
   */
  analyzeQuery(query: string): QueryAnalysis {
    if (this.queryAnalyzer) {
      return this.queryAnalyzer.analyzeQuery(query);
    }

    // Fallback analysis if no analyzer available
    return this.createBasicQueryAnalysis(query);
  }

  /**
   * Determines optimal search strategies based on query analysis
   */
  determineSearchStrategies(
    analysis: QueryAnalysis, 
    capabilities: SearchCapabilities
  ): SearchStrategy[] {
    const strategies: SearchStrategy[] = [];

    // Semantic search strategy
    if (capabilities.semantic && analysis.weights.semantic > 0.1) {
      strategies.push({
        type: 'semantic',
        weight: analysis.weights.semantic,
        priority: this.calculateSemanticPriority(analysis)
      });
    }

    // Keyword search strategy
    if (capabilities.keyword && analysis.weights.keyword > 0.1) {
      strategies.push({
        type: 'keyword',
        weight: analysis.weights.keyword,
        threshold: 0.3, // Default threshold
        priority: this.calculateKeywordPriority(analysis)
      });
    }

    // Fuzzy search strategy
    if (capabilities.fuzzy && analysis.weights.fuzzy > 0.1) {
      strategies.push({
        type: 'fuzzy',
        weight: analysis.weights.fuzzy,
        threshold: 0.6, // Default threshold
        priority: this.calculateFuzzyPriority(analysis)
      });
    }

    // Sort by priority (higher priority first)
    return strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Validates search capabilities
   */
  async validateSearchCapabilities(): Promise<SearchValidationResult> {
    const errors: string[] = [];
    const missingCollections: string[] = [];
    const corruptedCollections: string[] = [];

    // Check semantic search
    if (this.semanticProvider && !this.semanticProvider.isAvailable()) {
      errors.push('Semantic search provider not available');
      missingCollections.push('semantic');
    }

    // Check keyword search
    if (!this.keywordProvider?.isAvailable()) {
      errors.push('Keyword search provider not available');
      missingCollections.push('keyword');
    }

    // Check fuzzy search
    if (!this.fuzzyProvider?.isAvailable()) {
      errors.push('Fuzzy search provider not available');
      missingCollections.push('fuzzy');
    }

    const valid = errors.length === 0;
    const fallbackAvailable = (this.keywordProvider?.isAvailable() || false) || (this.fuzzyProvider?.isAvailable() || false);

    return {
      valid,
      missingCollections,
      corruptedCollections,
      fallbackAvailable,
      errors
    };
  }

  /**
   * Gets comprehensive search health status
   */
  async getSearchHealthStatus(): Promise<SearchHealthStatus> {
    const capabilities = await this.getSearchCapabilities();
    
    const healthScore = this.calculateHealthScore(capabilities);

    return {
      semantic: capabilities.semantic,
      keyword: capabilities.keyword,
      fuzzy: capabilities.fuzzy,
      collectionValidation: true, // Assuming validation is available
      healthScore
    };
  }

  // Private helper methods

  private async getSearchCapabilities(): Promise<SearchCapabilities> {
    return {
      semantic: !!(this.semanticProvider && this.semanticProvider.isAvailable()),
      keyword: this.keywordProvider?.isAvailable() || false,
      fuzzy: this.fuzzyProvider?.isAvailable() || false
    };
  }

  private async executeSearchStrategy(
    strategy: SearchStrategy,
    query: string,
    analysis: QueryAnalysis,
    options?: SearchOptions
  ): Promise<SearchResult[] | null> {
    try {
      switch (strategy.type) {
        case 'semantic':
          if (this.semanticProvider) {
            return await this.semanticProvider.search(query, {
              limit: options?.limit || 50,
              analysis
            });
          }
          break;

        case 'keyword':
          if (this.keywordProvider) {
            return await this.keywordProvider.search(query, {
              limit: options?.limit || 50,
              threshold: strategy.threshold,
              exactPhrases: analysis.exactPhrases,
              analysis
            });
          }
          break;

        case 'fuzzy':
          if (this.fuzzyProvider) {
            return await this.fuzzyProvider.search(query, {
              limit: options?.limit || 50,
              threshold: strategy.threshold,
              fuzzyTerms: analysis.fuzzyTerms,
              analysis
            });
          }
          break;

        default:
          console.warn(`[QueryCoordinator] Unknown search strategy: ${strategy.type}`);
          return null;
      }
    } catch (error) {
      console.error(`[QueryCoordinator] ${strategy.type} search failed:`, error);
      return null;
    }

    return null;
  }

  private createBasicQueryAnalysis(query: string): QueryAnalysis {
    const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    
    // Basic analysis based on query characteristics
    const hasQuotes = query.includes('"');
    const hasSpecialChars = /[^a-zA-Z0-9\s]/.test(query);
    const isShort = words.length <= 2;
    const isLong = words.length > 6;

    // Determine weights based on query characteristics
    let weights = { semantic: 0.4, keyword: 0.4, fuzzy: 0.2 };

    if (hasQuotes) {
      // Exact phrase search - favor keyword
      weights = { keyword: 0.6, semantic: 0.3, fuzzy: 0.1 };
    } else if (isShort && !hasSpecialChars) {
      // Short, simple query - favor keyword and fuzzy
      weights = { keyword: 0.5, fuzzy: 0.3, semantic: 0.2 };
    } else if (isLong) {
      // Long query - favor semantic
      weights = { semantic: 0.6, keyword: 0.3, fuzzy: 0.1 };
    }

    return {
      queryType: hasQuotes ? 'exact' : isLong ? 'conceptual' : 'mixed',
      weights,
      keywords: words,
      concepts: words, // Add concepts property
      exactPhrases: hasQuotes ? [query.replace(/"/g, '')] : [],
      fuzzyTerms: words,
      technicalTerms: this.extractTechnicalTerms(words),
      hasQuotes,
      hasQuestionWords: false // Add hasQuestionWords property
    };
  }

  private extractTechnicalTerms(words: string[]): string[] {
    // Basic technical term detection
    const technicalPatterns = [
      /^[a-z]+\.[a-z]+$/i, // Method calls like 'object.method'
      /^[A-Z][a-zA-Z]*$/,  // PascalCase
      /^[a-z]+[A-Z]/,      // camelCase
      /^[A-Z_]+$/,         // CONSTANTS
      /^\w+\(\)$/          // Functions with parentheses
    ];

    return words.filter(word => 
      technicalPatterns.some(pattern => pattern.test(word))
    );
  }

  private extractEntities(words: string[]): string[] {
    // Basic entity extraction (proper nouns, capitalized words)
    return words.filter(word => /^[A-Z][a-z]+$/.test(word));
  }

  private calculateQueryComplexity(query: string, words: string[]): number {
    let complexity = 0;

    // Length factor
    complexity += Math.min(words.length / 10, 0.3);

    // Special characters
    if (/[^a-zA-Z0-9\s]/.test(query)) complexity += 0.2;

    // Technical terms
    const technicalTerms = this.extractTechnicalTerms(words);
    complexity += (technicalTerms.length / words.length) * 0.3;

    // Quotes and operators
    if (query.includes('"')) complexity += 0.1;
    if (/\b(AND|OR|NOT)\b/i.test(query)) complexity += 0.2;

    return Math.min(complexity, 1.0);
  }

  private calculateSemanticPriority(analysis: QueryAnalysis): number {
    let priority = analysis.weights.semantic * 100;
    
    // Boost for conceptual queries
    if (analysis.queryType === 'conceptual' || analysis.queryType === 'exploratory') {
      priority += 20;
    }
    
    // Boost for complex queries (based on technical terms as proxy)
    if (analysis.technicalTerms.length > 2) {
      priority += 15;
    }

    return priority;
  }

  private calculateKeywordPriority(analysis: QueryAnalysis): number {
    let priority = analysis.weights.keyword * 100;
    
    // Boost for exact queries
    if (analysis.queryType === 'exact' || analysis.exactPhrases.length > 0) {
      priority += 25;
    }
    
    // Boost for technical terms
    if (analysis.technicalTerms.length > 0) {
      priority += 10;
    }

    return priority;
  }

  private calculateFuzzyPriority(analysis: QueryAnalysis): number {
    let priority = analysis.weights.fuzzy * 100;
    
    // Boost for exploratory queries
    if (analysis.queryType === 'exploratory') {
      priority += 15;
    }
    
    // Boost for queries with potential typos (simple heuristic)
    if (analysis.fuzzyTerms.some(term => term.length > 8)) {
      priority += 10;
    }

    return priority;
  }

  private calculateHealthScore(capabilities: SearchCapabilities): number {
    let score = 0;
    let maxScore = 0;

    if (capabilities.semantic) score += 40;
    maxScore += 40;

    if (capabilities.keyword) score += 35;
    maxScore += 35;

    if (capabilities.fuzzy) score += 25;
    maxScore += 25;

    return maxScore > 0 ? (score / maxScore) * 100 : 0;
  }

  /**
   * Updates search providers
   */
  updateProviders(providers: {
    semantic?: SearchProvider;
    keyword?: SearchProvider;
    fuzzy?: SearchProvider;
  }): void {
    if (providers.semantic !== undefined) {
      this.semanticProvider = providers.semantic;
    }
    if (providers.keyword !== undefined) {
      this.keywordProvider = providers.keyword;
    }
    if (providers.fuzzy !== undefined) {
      this.fuzzyProvider = providers.fuzzy;
    }
  }

  /**
   * Sets query analyzer
   */
  setQueryAnalyzer(analyzer: any): void {
    this.queryAnalyzer = analyzer;
  }
}