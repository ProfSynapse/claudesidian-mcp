import { IVectorMath } from '../interfaces';

/**
 * Utility class for vector math operations
 */
export class VectorMath implements IVectorMath {
    /**
     * Calculate cosine similarity between two vectors
     * @param a First vector
     * @param b Second vector
     */
    cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have the same dimensions');
        }
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        if (normA === 0 || normB === 0) {
            return 0; // Handle zero vectors
        }
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}