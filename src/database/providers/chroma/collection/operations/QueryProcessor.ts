/**
 * QueryProcessor - Handles query execution and result processing
 * Follows Single Responsibility Principle by focusing only on query operations
 */

import { CollectionRepository } from '../../services/CollectionRepository';
import { VectorCalculator } from '../../services/VectorCalculator';
import { FilterEngine } from '../../services/FilterEngine';
import { ChromaQueryParams } from '../../PersistentChromaClient';

export interface QueryResult {
  ids: string[][];
  embeddings?: number[][][];
  metadatas?: Record<string, any>[][];
  documents?: string[][];
  distances?: number[][];
}

/**
 * Service responsible for query execution and result processing
 * Follows SRP by focusing only on query operations
 */
export class QueryProcessor {
  private vectorCalculator: VectorCalculator;
  private filterEngine: FilterEngine;

  constructor(
    private repository: CollectionRepository,
    private embeddingFunction?: any
  ) {
    this.vectorCalculator = new VectorCalculator();
    this.filterEngine = new FilterEngine();
  }

  /**
   * Execute a query against the collection
   */
  async executeQuery(params: ChromaQueryParams): Promise<QueryResult> {
    const { queryEmbeddings, queryTexts, nResults = 10, where, include = ['embeddings', 'metadatas', 'documents'] } = params;

    // Get query embeddings
    let embeddings: number[][];
    if (queryEmbeddings) {
      embeddings = queryEmbeddings;
    } else if (queryTexts && this.embeddingFunction) {
      embeddings = await this.embeddingFunction.generate(queryTexts);
    } else {
      throw new Error('Either queryEmbeddings or queryTexts must be provided');
    }

    // Get all items that match the where clause
    const allItems = this.repository.getItems(undefined, where);

    // Initialize results
    const results: QueryResult = {
      ids: [],
      embeddings: include.includes('embeddings') ? [] : undefined,
      metadatas: include.includes('metadatas') ? [] : undefined,
      documents: include.includes('documents') ? [] : undefined,
      distances: include.includes('distances') ? [] : undefined
    };

    // Process each query embedding
    for (const queryEmbedding of embeddings) {
      const queryResults = this.processQueryEmbedding(queryEmbedding, allItems, nResults, include);
      
      // Add to results
      results.ids.push(queryResults.ids);
      
      if (include.includes('embeddings')) {
        results.embeddings!.push(queryResults.embeddings);
      }
      
      if (include.includes('metadatas')) {
        results.metadatas!.push(queryResults.metadatas);
      }
      
      if (include.includes('documents')) {
        results.documents!.push(queryResults.documents);
      }
      
      if (include.includes('distances')) {
        results.distances!.push(queryResults.distances);
      }
    }

    return results;
  }

  /**
   * Process a single query embedding
   */
  private processQueryEmbedding(
    queryEmbedding: number[],
    allItems: any[],
    nResults: number,
    include: string[]
  ): {
    ids: string[];
    embeddings: number[][];
    metadatas: Record<string, any>[];
    documents: string[];
    distances: number[];
  } {
    // Calculate distances for all items
    const itemsWithDistances = allItems.map(item => ({
      ...item,
      distance: VectorCalculator.cosineDistance(queryEmbedding, item.embedding)
    }));

    // Sort by distance (ascending - closer items first)
    itemsWithDistances.sort((a, b) => a.distance - b.distance);

    // Take top N results
    const topResults = itemsWithDistances.slice(0, nResults);

    // Build result arrays
    const ids: string[] = [];
    const embeddings: number[][] = [];
    const metadatas: Record<string, any>[] = [];
    const documents: string[] = [];
    const distances: number[] = [];

    for (const item of topResults) {
      ids.push(item.id);
      
      if (include.includes('embeddings')) {
        embeddings.push(item.embedding);
      }
      
      if (include.includes('metadatas')) {
        metadatas.push(item.metadata);
      }
      
      if (include.includes('documents')) {
        documents.push(item.document);
      }
      
      if (include.includes('distances')) {
        distances.push(item.distance);
      }
    }

    return {
      ids,
      embeddings,
      metadatas,
      documents,
      distances
    };
  }
}