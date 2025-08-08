/**
 * FilterEngine - Handles filtering logic and vector calculations for collection queries
 * CONSOLIDATED: Now includes VectorCalculator functionality for similarity calculations
 * Applies Single Responsibility Principle by focusing on data filtering and vector math
 * Enhanced with comprehensive vector similarity calculations and distance metrics
 */

export interface DatabaseItem {
  id: string;
  embedding: number[];
  metadata: Record<string, any>;
  document: string;
}

export interface WhereClause {
  [key: string]: any;
}

/**
 * Distance calculation methods for vector similarity
 */
export enum DistanceMethod {
  COSINE = 'cosine',
  EUCLIDEAN = 'euclidean',
  MANHATTAN = 'manhattan'
}

/**
 * Vector similarity calculation result
 */
export interface SimilarityResult {
  distance: number;
  similarity: number;
  method: DistanceMethod;
}

export class FilterEngine {
  /**
   * Filter items by where clause
   * @param items Items to filter
   * @param where Where clause filter
   * @returns Filtered items
   */
  static filterByWhere<T extends DatabaseItem>(items: T[], where?: WhereClause): T[] {
    if (!where) {
      return items;
    }
    
    return items.filter(item => this.matchesWhereClause(item, where));
  }

  /**
   * Check if an item matches a where clause
   * @param item Item to check
   * @param where Where clause
   * @returns True if item matches
   */
  static matchesWhereClause(item: DatabaseItem, where: WhereClause): boolean {
    for (const [key, value] of Object.entries(where)) {
      if (!this.matchesCondition(item.metadata[key], value)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if a field value matches a condition
   * @param fieldValue The field value from the item
   * @param condition The condition to match against
   * @returns True if condition matches
   */
  private static matchesCondition(fieldValue: any, condition: any): boolean {
    // Handle $eq operator format: { field: { $eq: value } }
    if (typeof condition === 'object' && condition !== null && '$eq' in condition) {
      return fieldValue === condition.$eq;
    }
    
    // Handle $ne (not equal) operator
    if (typeof condition === 'object' && condition !== null && '$ne' in condition) {
      return fieldValue !== condition.$ne;
    }
    
    // Handle $in operator (value in array)
    if (typeof condition === 'object' && condition !== null && '$in' in condition) {
      return Array.isArray(condition.$in) && condition.$in.includes(fieldValue);
    }
    
    // Handle $nin operator (value not in array)
    if (typeof condition === 'object' && condition !== null && '$nin' in condition) {
      return Array.isArray(condition.$nin) && !condition.$nin.includes(fieldValue);
    }
    
    // Handle $gt (greater than) operator
    if (typeof condition === 'object' && condition !== null && '$gt' in condition) {
      return fieldValue > condition.$gt;
    }
    
    // Handle $gte (greater than or equal) operator
    if (typeof condition === 'object' && condition !== null && '$gte' in condition) {
      return fieldValue >= condition.$gte;
    }
    
    // Handle $lt (less than) operator
    if (typeof condition === 'object' && condition !== null && '$lt' in condition) {
      return fieldValue < condition.$lt;
    }
    
    // Handle $lte (less than or equal) operator
    if (typeof condition === 'object' && condition !== null && '$lte' in condition) {
      return fieldValue <= condition.$lte;
    }
    
    // Handle $regex operator for string matching
    if (typeof condition === 'object' && condition !== null && '$regex' in condition) {
      if (typeof fieldValue === 'string') {
        const regex = new RegExp(condition.$regex, condition.$options || '');
        return regex.test(fieldValue);
      }
      return false;
    }
    
    // Handle direct value format: { field: value }
    return fieldValue === condition;
  }

  /**
   * Apply pagination to filtered results
   * @param items Items to paginate
   * @param offset Starting offset
   * @param limit Maximum number of items
   * @returns Paginated items
   */
  static paginate<T>(items: T[], offset?: number, limit?: number): T[] {
    const startIndex = offset || 0;
    const endIndex = limit ? startIndex + limit : undefined;
    return items.slice(startIndex, endIndex);
  }

  /**
   * Filter items by IDs
   * @param items Items to filter
   * @param ids Array of IDs to match
   * @returns Items matching the provided IDs
   */
  static filterByIds<T extends DatabaseItem>(items: T[], ids: string[]): T[] {
    if (ids.length === 0) {
      return items;
    }
    
    const idSet = new Set(ids);
    return items.filter(item => idSet.has(item.id));
  }

  // ============================================================================
  // VECTOR CALCULATOR FUNCTIONALITY (CONSOLIDATED)
  // ============================================================================

  /**
   * Calculate cosine distance between two vectors
   * @param vecA First vector
   * @param vecB Second vector
   * @returns Cosine distance (1 - similarity, 0 = identical, 2 = opposite)
   */
  static cosineDistance(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      return 0.99; // High distance for mismatched dimensions
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0.99; // High distance for zero vectors
    }
    
    // Calculate cosine similarity and convert to distance
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return 1 - similarity; // Convert to distance
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param vecA First vector
   * @param vecB Second vector
   * @returns Cosine similarity (-1 to 1, 1 = identical, -1 = opposite)
   */
  static cosineSimilarity(vecA: number[], vecB: number[]): number {
    return 1 - this.cosineDistance(vecA, vecB);
  }

  /**
   * Calculate Euclidean distance between two vectors
   * @param vecA First vector
   * @param vecB Second vector
   * @returns Euclidean distance
   */
  static euclideanDistance(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      return Number.MAX_VALUE;
    }
    
    let sum = 0;
    for (let i = 0; i < vecA.length; i++) {
      const diff = vecA[i] - vecB[i];
      sum += diff * diff;
    }
    
    return Math.sqrt(sum);
  }

  /**
   * Calculate Manhattan distance between two vectors
   * @param vecA First vector
   * @param vecB Second vector
   * @returns Manhattan distance
   */
  static manhattanDistance(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      return Number.MAX_VALUE;
    }
    
    let sum = 0;
    for (let i = 0; i < vecA.length; i++) {
      sum += Math.abs(vecA[i] - vecB[i]);
    }
    
    return sum;
  }

  /**
   * Calculate dot product between two vectors
   * @param vecA First vector
   * @param vecB Second vector
   * @returns Dot product
   */
  static dotProduct(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      return 0;
    }
    
    let result = 0;
    for (let i = 0; i < vecA.length; i++) {
      result += vecA[i] * vecB[i];
    }
    
    return result;
  }

  /**
   * Calculate magnitude (norm) of a vector
   * @param vec Vector
   * @returns Vector magnitude
   */
  static magnitude(vec: number[]): number {
    let sum = 0;
    for (const value of vec) {
      sum += value * value;
    }
    return Math.sqrt(sum);
  }

  /**
   * Calculate distance using specified method
   * @param vecA First vector
   * @param vecB Second vector
   * @param method Distance calculation method
   * @returns Distance calculation result
   */
  static calculateDistance(vecA: number[], vecB: number[], method: DistanceMethod = DistanceMethod.COSINE): SimilarityResult {
    let distance: number;
    let similarity: number;

    switch (method) {
      case DistanceMethod.COSINE:
        distance = this.cosineDistance(vecA, vecB);
        similarity = 1 - distance;
        break;
      case DistanceMethod.EUCLIDEAN:
        distance = this.euclideanDistance(vecA, vecB);
        // Convert Euclidean distance to similarity (0-1 range)
        similarity = 1 / (1 + distance);
        break;
      case DistanceMethod.MANHATTAN:
        distance = this.manhattanDistance(vecA, vecB);
        // Convert Manhattan distance to similarity (0-1 range)
        similarity = 1 / (1 + distance);
        break;
      default:
        distance = this.cosineDistance(vecA, vecB);
        similarity = 1 - distance;
    }

    return {
      distance,
      similarity,
      method
    };
  }

  /**
   * Find most similar vectors from a collection
   * @param queryVector Query vector
   * @param vectors Array of vectors to search
   * @param topK Number of top results to return
   * @param method Distance calculation method
   * @returns Array of indices and similarity results
   */
  static findMostSimilar(
    queryVector: number[],
    vectors: number[][],
    topK: number = 10,
    method: DistanceMethod = DistanceMethod.COSINE
  ): Array<{ index: number; result: SimilarityResult }> {
    const results = vectors.map((vec, index) => ({
      index,
      result: this.calculateDistance(queryVector, vec, method)
    }));

    // Sort by similarity (higher is better) or distance (lower is better for most methods)
    if (method === DistanceMethod.COSINE) {
      results.sort((a, b) => a.result.distance - b.result.distance); // Lower distance is better
    } else {
      results.sort((a, b) => b.result.similarity - a.result.similarity); // Higher similarity is better
    }

    return results.slice(0, Math.min(topK, results.length));
  }

  /**
   * Normalize a vector to unit length
   * @param vec Vector to normalize
   * @returns Normalized vector
   */
  static normalize(vec: number[]): number[] {
    const mag = this.magnitude(vec);
    if (mag === 0) {
      return vec.slice(); // Return copy of zero vector
    }
    return vec.map(val => val / mag);
  }

  /**
   * Calculate vector similarity using different methods
   * @param vecA First vector
   * @param vecB Second vector
   * @param methods Array of methods to use
   * @returns Object with results for each method
   */
  static compareVectors(
    vecA: number[], 
    vecB: number[], 
    methods: DistanceMethod[] = [DistanceMethod.COSINE]
  ): Record<string, SimilarityResult> {
    const results: Record<string, SimilarityResult> = {};
    
    for (const method of methods) {
      results[method] = this.calculateDistance(vecA, vecB, method);
    }
    
    return results;
  }

}