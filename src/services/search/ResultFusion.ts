/**
 * ResultFusion.ts - Advanced result fusion service using Reciprocal Rank Fusion and other algorithms
 * Location: src/services/search/ResultFusion.ts
 * Purpose: Combines results from multiple search methods with intelligent ranking and fusion strategies
 * Used by: HybridSearchService to merge semantic, keyword, and fuzzy search results
 */

import { 
  SearchResult, 
  SearchResultSet, 
  HybridSearchResult, 
  MethodScores,
  FusionOptions,
  RankingStrategy 
} from '../../types/search/SearchResults';
import { FusionConfiguration, FusionMetrics } from '../../types/search/SearchMetadata';
import { GraphOperations } from '../../database/utils/graph/GraphOperations';

export interface ResultFusionInterface {
  fuse(resultSets: SearchResultSet[], options?: FusionOptions): Promise<HybridSearchResult[]>;
  applyRRF(resultSets: SearchResultSet[], k?: number): Promise<HybridSearchResult[]>;
  applyWeightedFusion(resultSets: SearchResultSet[]): Promise<HybridSearchResult[]>;
  rankResults(results: SearchResult[], strategy: RankingStrategy): Promise<SearchResult[]>;
  getConfiguration(): FusionConfiguration;
  updateConfiguration(config: Partial<FusionConfiguration>): Promise<void>;
  getMetrics(): Promise<FusionMetrics>;
}

export class ResultFusion implements ResultFusionInterface {
  private config: FusionConfiguration;
  private graphOperations: GraphOperations;
  private metrics = {
    totalOperations: 0,
    totalFusionTime: 0,
    strategyUsage: new Map<string, number>(),
    inputSizes: [] as number[],
    outputSizes: [] as number[]
  };

  constructor(config?: Partial<FusionConfiguration>) {
    this.config = {
      defaultStrategy: 'rrf',
      defaultK: 60,
      defaultTypeWeights: {
        semantic: 0.5,
        keyword: 0.3,
        fuzzy: 0.2
      },
      enableMetrics: true,
      algorithmParameters: {},
      ...config
    };
    this.graphOperations = new GraphOperations();
  }

  /**
   * Fuses multiple search result sets using configured strategy
   */
  async fuse(resultSets: SearchResultSet[], options?: FusionOptions): Promise<HybridSearchResult[]> {
    const startTime = Date.now();
    const strategy = options?.strategy ?? this.config.defaultStrategy;
    
    if (this.config.enableMetrics) {
      this.metrics.totalOperations++;
      this.recordStrategyUsage(strategy);
      this.recordInputSize(resultSets.reduce((sum, set) => sum + set.results.length, 0));
    }

    let fusedResults: HybridSearchResult[];

    try {
      switch (strategy) {
        case 'rrf':
          fusedResults = await this.applyRRF(resultSets, options?.k);
          break;
        case 'weighted':
          fusedResults = await this.applyWeightedFusion(resultSets);
          break;
        case 'simple':
          fusedResults = await this.applySimpleFusion(resultSets);
          break;
        default:
          throw new Error(`Unknown fusion strategy: ${strategy}`);
      }

      // Apply post-fusion options
      if (options?.maxResults && fusedResults.length > options.maxResults) {
        fusedResults = fusedResults.slice(0, options.maxResults);
      }

      if (options?.scoreThreshold) {
        fusedResults = fusedResults.filter(result => result.score >= options.scoreThreshold!);
      }

      if (this.config.enableMetrics) {
        this.recordOutputSize(fusedResults.length);
        this.metrics.totalFusionTime += Date.now() - startTime;
      }

      return fusedResults;

    } catch (error) {
      console.error('[ResultFusion] Fusion failed:', error);
      // Fallback to simple concatenation
      return this.applySimpleFusion(resultSets);
    }
  }

  /**
   * Applies Reciprocal Rank Fusion (RRF) algorithm
   */
  async applyRRF(resultSets: SearchResultSet[], k = 60): Promise<HybridSearchResult[]> {
    const rrfK = k || this.config.defaultK;
    const scoreMap = new Map<string, number>();
    const detailMap = new Map<string, any>();
    const methodsMap = new Map<string, Set<string>>();
    const methodScoresMap = new Map<string, MethodScores>();

    // Apply RRF scoring
    resultSets.forEach((resultSet) => {
      const weight = resultSet.weight || this.getDefaultWeight(resultSet.method);
      
      resultSet.results.forEach((result, rank) => {
        const rrfScore = weight / (rrfK + rank + 1);
        const currentScore = scoreMap.get(result.id) || 0;
        scoreMap.set(result.id, currentScore + rrfScore);
        
        // Store result details
        if (!detailMap.has(result.id)) {
          detailMap.set(result.id, result);
          methodsMap.set(result.id, new Set());
          methodScoresMap.set(result.id, {});
        }
        
        // Track methods and scores
        methodsMap.get(result.id)!.add(resultSet.method);
        const methodScores = methodScoresMap.get(result.id)!;
        methodScores[resultSet.method as keyof MethodScores] = result.score;
      });
    });

    // Convert to hybrid results and sort by RRF score
    const hybridResults = Array.from(scoreMap.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([id, score], index) => {
        const primaryResult = detailMap.get(id);
        const methods = Array.from(methodsMap.get(id) || []);
        const methodScores = methodScoresMap.get(id) || {};

        return this.createHybridResult(
          primaryResult,
          score,
          methods,
          methodScores,
          index
        );
      });

    // Apply hardcoded graph boost to RRF results
    const graphBoostedResults = this.applyGraphBoostToResults(hybridResults);

    return graphBoostedResults;
  }

  /**
   * Applies weighted fusion strategy
   */
  async applyWeightedFusion(resultSets: SearchResultSet[]): Promise<HybridSearchResult[]> {
    const scoreMap = new Map<string, number>();
    const detailMap = new Map<string, any>();
    const methodsMap = new Map<string, Set<string>>();
    const methodScoresMap = new Map<string, MethodScores>();

    // Apply weighted scoring
    resultSets.forEach((resultSet) => {
      const weight = resultSet.weight || this.getDefaultWeight(resultSet.method);
      
      resultSet.results.forEach((result) => {
        const weightedScore = result.score * weight;
        const currentScore = scoreMap.get(result.id) || 0;
        scoreMap.set(result.id, currentScore + weightedScore);
        
        // Store result details
        if (!detailMap.has(result.id)) {
          detailMap.set(result.id, result);
          methodsMap.set(result.id, new Set());
          methodScoresMap.set(result.id, {});
        }
        
        // Track methods and scores
        methodsMap.get(result.id)!.add(resultSet.method);
        const methodScores = methodScoresMap.get(result.id)!;
        methodScores[resultSet.method as keyof MethodScores] = result.score;
      });
    });

    // Convert to hybrid results and sort by weighted score
    const hybridResults = Array.from(scoreMap.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([id, score], index) => {
        const primaryResult = detailMap.get(id);
        const methods = Array.from(methodsMap.get(id) || []);
        const methodScores = methodScoresMap.get(id) || {};

        return this.createHybridResult(
          primaryResult,
          score,
          methods,
          methodScores,
          index
        );
      });

    return hybridResults;
  }

  /**
   * Ranks results using specified strategy
   */
  async rankResults(results: SearchResult[], strategy: RankingStrategy): Promise<SearchResult[]> {
    switch (strategy.algorithm) {
      case 'rrf':
        // Create mock result sets for RRF
        const resultSet: SearchResultSet = {
          results,
          weight: 1.0,
          type: 'mixed',
          method: 'mixed'
        };
        const hybridResults = await this.applyRRF([resultSet], strategy.parameters.k);
        return hybridResults;

      case 'weighted':
        // Apply custom weights if provided
        const weights = strategy.parameters.weights || {};
        return results
          .map(result => ({
            ...result,
            score: result.score * (weights[result.searchMethod] || 1.0)
          }))
          .sort((a, b) => b.score - a.score);

      case 'linear':
        // Simple linear combination
        return results.sort((a, b) => b.score - a.score);

      default:
        throw new Error(`Unknown ranking algorithm: ${strategy.algorithm}`);
    }
  }

  /**
   * Gets current fusion configuration
   */
  getConfiguration(): FusionConfiguration {
    return { ...this.config };
  }

  /**
   * Updates fusion configuration
   */
  async updateConfiguration(config: Partial<FusionConfiguration>): Promise<void> {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets fusion performance metrics
   */
  async getMetrics(): Promise<FusionMetrics> {
    const strategyUsage: Record<string, number> = {};
    for (const [strategy, count] of this.metrics.strategyUsage.entries()) {
      strategyUsage[strategy] = count;
    }

    const averageInputSize = this.metrics.inputSizes.length > 0 
      ? this.metrics.inputSizes.reduce((sum, size) => sum + size, 0) / this.metrics.inputSizes.length
      : 0;

    const averageOutputSize = this.metrics.outputSizes.length > 0
      ? this.metrics.outputSizes.reduce((sum, size) => sum + size, 0) / this.metrics.outputSizes.length
      : 0;

    const averageFusionTime = this.metrics.totalOperations > 0
      ? this.metrics.totalFusionTime / this.metrics.totalOperations
      : 0;

    return {
      totalOperations: this.metrics.totalOperations,
      averageFusionTime,
      strategyUsage,
      averageInputSize,
      averageOutputSize
    };
  }

  // Private helper methods

  /**
   * Apply hardcoded graph boost to RRF results
   */
  private applyGraphBoostToResults(results: HybridSearchResult[]): HybridSearchResult[] {
    try {
      // Convert results to format expected by GraphOperations
      const records = results.map(result => ({
        record: {
          id: result.id,
          filePath: result.metadata?.filePath || result.filePath || '',
          content: result.content || '',
          metadata: {
            ...result.metadata,
            links: result.metadata?.links || {}
          }
        },
        similarity: result.score
      }));

      // Apply graph boost with hardcoded parameters
      const graphBoostedRecords = this.graphOperations.applyGraphBoost(records, {
        useGraphBoost: true,
        boostFactor: 0.3, // Hardcoded 30% boost factor
        maxDistance: 1,   // Only boost direct connections
        includeNeighbors: true
      });

      // Convert back to HybridSearchResult format and re-sort by boosted scores
      return graphBoostedRecords
        .map((item, index) => ({
          ...results.find(r => r.id === item.record.id)!,
          score: item.similarity, // Use the graph-boosted score
          metadata: {
            ...results.find(r => r.id === item.record.id)!.metadata,
            finalRank: index + 1,
            graphBoosted: true,
            graphBoostFactor: 0.3
          }
        }))
        .sort((a, b) => b.score - a.score); // Re-sort by boosted scores

    } catch (error) {
      console.error('[ResultFusion] Graph boost failed, returning original results:', error);
      return results;
    }
  }

  private async applySimpleFusion(resultSets: SearchResultSet[]): Promise<HybridSearchResult[]> {
    // Simple concatenation with deduplication
    const seenIds = new Set<string>();
    const results: HybridSearchResult[] = [];

    resultSets.forEach((resultSet, setIndex) => {
      resultSet.results.forEach((result, resultIndex) => {
        if (!seenIds.has(result.id)) {
          seenIds.add(result.id);
          
          const hybridResult = this.createHybridResult(
            result,
            result.score * (resultSet.weight || 1.0),
            [resultSet.method],
            { [resultSet.method]: result.score } as MethodScores,
            results.length
          );
          
          results.push(hybridResult);
        }
      });
    });

    return results.sort((a, b) => b.score - a.score);
  }

  private createHybridResult(
    primaryResult: SearchResult,
    fusionScore: number,
    methods: string[],
    methodScores: MethodScores,
    rank: number
  ): HybridSearchResult {
    return {
      id: primaryResult.id,
      title: primaryResult.title,
      snippet: primaryResult.snippet,
      score: fusionScore,
      searchMethod: 'hybrid',
      originalMethods: methods,
      metadata: {
        // Copy additional metadata from primary result first
        ...primaryResult.metadata,
        filePath: primaryResult.metadata?.filePath || primaryResult.filePath || '',
        fileId: primaryResult.id,
        timestamp: Date.now(),
        hybridScore: fusionScore,
        methodScores,
        contentTypeBoost: 1.0,
        exactMatchBoost: 1.0,
        finalRank: rank + 1
      },
      content: primaryResult.content,
      filePath: primaryResult.filePath
    };
  }

  private getDefaultWeight(method: string): number {
    return this.config.defaultTypeWeights[method] || 0.5;
  }

  private recordStrategyUsage(strategy: string): void {
    const current = this.metrics.strategyUsage.get(strategy) || 0;
    this.metrics.strategyUsage.set(strategy, current + 1);
  }

  private recordInputSize(size: number): void {
    this.metrics.inputSizes.push(size);
    // Keep only recent measurements
    if (this.metrics.inputSizes.length > 100) {
      this.metrics.inputSizes.shift();
    }
  }

  private recordOutputSize(size: number): void {
    this.metrics.outputSizes.push(size);
    // Keep only recent measurements
    if (this.metrics.outputSizes.length > 100) {
      this.metrics.outputSizes.shift();
    }
  }

  /**
   * Validates fusion input
   */
  private validateFusionInput(resultSets: SearchResultSet[]): void {
    if (!resultSets || resultSets.length === 0) {
      throw new Error('No result sets provided for fusion');
    }

    for (const resultSet of resultSets) {
      if (!resultSet.results || !Array.isArray(resultSet.results)) {
        throw new Error('Invalid result set: results must be an array');
      }
      
      if (typeof resultSet.weight !== 'number' || resultSet.weight < 0) {
        resultSet.weight = this.getDefaultWeight(resultSet.method);
      }
    }
  }

  /**
   * Normalizes scores within a result set
   */
  private normalizeScores(results: SearchResult[]): SearchResult[] {
    if (results.length === 0) return results;

    const scores = results.map(r => r.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const scoreRange = maxScore - minScore;

    if (scoreRange === 0) return results;

    return results.map(result => ({
      ...result,
      score: (result.score - minScore) / scoreRange
    }));
  }
}