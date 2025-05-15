/**
 * Base embedding provider interface
 * This is an abstract class that all embedding providers should extend
 */
export abstract class BaseEmbeddingProvider {
    /**
     * Get the name of the provider
     * @returns Provider name
     */
    abstract getName(): string;
    
    /**
     * Get the dimensions of the embeddings
     * @returns Number of dimensions
     */
    abstract getDimensions(): number;
    
    /**
     * Get embedding for a text
     * @param text The text to get embeddings for
     * @returns Vector embedding as an array of numbers
     */
    abstract getEmbedding(text: string): Promise<number[]>;
    
    /**
     * Get token count for a text
     * Default implementation is a simple approximation
     * Providers can override this with more accurate methods
     * 
     * @param text The text to count tokens for
     * @returns Token count
     */
    getTokenCount(text: string): number {
        // Simple approximation: 1 token is roughly 0.75 words
        const wordCount = text.split(/\s+/).length;
        return Math.ceil(wordCount / 0.75);
    }
}
