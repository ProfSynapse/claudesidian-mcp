/**
 * VectorCalculator - Handles vector similarity calculations
 * Applies Single Responsibility Principle by focusing only on vector math
 */
export class VectorCalculator {
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
}