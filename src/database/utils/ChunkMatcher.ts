import { TextChunk } from './chunking';

/**
 * Result of matching chunks between old and new versions
 */
export interface ChunkMatchResult {
  /**
   * The new chunk
   */
  newChunk: TextChunk;
  
  /**
   * The matched old chunk (if any)
   */
  oldChunk?: TextChunk;
  
  /**
   * Match type
   */
  matchType: 'exact' | 'similar' | 'new';
  
  /**
   * Similarity score (0-1) for similar matches
   */
  similarity?: number;
  
  /**
   * The old chunk's embedding ID if it exists
   */
  oldEmbeddingId?: string;
}

/**
 * Utility class for intelligent chunk matching between document versions
 */
export class ChunkMatcher {
  /**
   * Find the best matches between old and new chunks
   * @param oldChunks Previous version chunks
   * @param newChunks New version chunks
   * @param oldEmbeddingIds Optional array of embedding IDs corresponding to old chunks
   * @returns Array of match results
   */
  static findBestMatches(
    oldChunks: TextChunk[], 
    newChunks: TextChunk[],
    oldEmbeddingIds?: string[]
  ): ChunkMatchResult[] {
    const results: ChunkMatchResult[] = [];
    const usedOldIndices = new Set<number>();
    
    // First pass: Find exact matches by hash
    for (const newChunk of newChunks) {
      let matched = false;
      
      if (newChunk.metadata.contentHash) {
        for (let i = 0; i < oldChunks.length; i++) {
          if (usedOldIndices.has(i)) continue;
          
          const oldChunk = oldChunks[i];
          if (oldChunk.metadata.contentHash === newChunk.metadata.contentHash) {
            results.push({
              newChunk,
              oldChunk,
              matchType: 'exact',
              similarity: 1.0,
              oldEmbeddingId: oldEmbeddingIds?.[i]
            });
            usedOldIndices.add(i);
            matched = true;
            break;
          }
        }
      }
      
      if (!matched) {
        // Store for second pass
        results.push({
          newChunk,
          matchType: 'new' // Temporary, may be updated in second pass
        });
      }
    }
    
    // Second pass: Find similar matches for unmatched chunks
    for (let resultIdx = 0; resultIdx < results.length; resultIdx++) {
      const result = results[resultIdx];
      if (result.matchType !== 'new') continue;
      
      const newChunk = result.newChunk;
      let bestMatch: { index: number; similarity: number } | null = null;
      
      for (let i = 0; i < oldChunks.length; i++) {
        if (usedOldIndices.has(i)) continue;
        
        const oldChunk = oldChunks[i];
        const similarity = this.calculateSimilarity(newChunk, oldChunk);
        
        // Consider it a match if similarity is above threshold
        if (similarity > 0.7) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { index: i, similarity };
          }
        }
      }
      
      if (bestMatch) {
        results[resultIdx] = {
          newChunk,
          oldChunk: oldChunks[bestMatch.index],
          matchType: 'similar',
          similarity: bestMatch.similarity,
          oldEmbeddingId: oldEmbeddingIds?.[bestMatch.index]
        };
        usedOldIndices.add(bestMatch.index);
      }
    }
    
    return results;
  }
  
  /**
   * Calculate similarity between two chunks
   * @param chunk1 First chunk
   * @param chunk2 Second chunk
   * @returns Similarity score between 0 and 1
   */
  static calculateSimilarity(chunk1: TextChunk, chunk2: TextChunk): number {
    // If semantic boundaries don't match, reduce similarity
    const boundaryMultiplier = 
      chunk1.metadata.semanticBoundary === chunk2.metadata.semanticBoundary ? 1.0 : 0.8;
    
    // Calculate text similarity using Jaccard coefficient on words
    const words1 = new Set(chunk1.content.toLowerCase().split(/\s+/));
    const words2 = new Set(chunk2.content.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    const jaccardSimilarity = intersection.size / union.size;
    
    // Also consider position similarity if available
    let positionSimilarity = 1.0;
    if (chunk1.metadata.chunkIndex !== undefined && chunk2.metadata.chunkIndex !== undefined) {
      const indexDiff = Math.abs(chunk1.metadata.chunkIndex - chunk2.metadata.chunkIndex);
      positionSimilarity = Math.max(0, 1 - (indexDiff * 0.1)); // Reduce by 10% per index difference
    }
    
    // Combine similarities
    return (jaccardSimilarity * 0.7 + positionSimilarity * 0.3) * boundaryMultiplier;
  }
  
  /**
   * Check if semantic boundary is preserved between chunks
   * @param chunk1 First chunk
   * @param chunk2 Second chunk
   * @returns true if boundaries match
   */
  static isSemanticBoundaryPreserved(chunk1: TextChunk, chunk2: TextChunk): boolean {
    return chunk1.metadata.semanticBoundary === chunk2.metadata.semanticBoundary;
  }
  
  /**
   * Get chunks that need re-embedding
   * @param matchResults Array of match results
   * @returns Array of match results that need new embeddings
   */
  static getChunksNeedingEmbedding(matchResults: ChunkMatchResult[]): ChunkMatchResult[] {
    return matchResults.filter(result => 
      result.matchType === 'new' || result.matchType === 'similar'
    );
  }
  
  /**
   * Get chunks that can reuse existing embeddings
   * @param matchResults Array of match results
   * @returns Array of match results with exact matches
   */
  static getReusableChunks(matchResults: ChunkMatchResult[]): ChunkMatchResult[] {
    return matchResults.filter(result => 
      result.matchType === 'exact' && result.oldEmbeddingId
    );
  }
}