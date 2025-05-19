import { EmbeddingProvider } from '../../types';

/**
 * Abstract base class for embedding providers
 * Defines common functionality for all embedding providers
 */
export abstract class BaseEmbeddingProvider implements EmbeddingProvider {
    /**
     * Get the name of the embedding provider
     */
    abstract getName(): string;
    
    /**
     * Get embeddings for a text
     * @param text The text to get embeddings for
     */
    abstract getEmbedding(text: string): Promise<number[]>;
    
    /**
     * Get the dimensions of the embedding vectors
     */
    abstract getDimensions(): number;
    
    /**
     * Get the token count for a text
     * @param text The text to count tokens for
     */
    getTokenCount(text: string): number {
        return this.approximateTokenCount(text);
    }
    
    /**
     * Validates if a text is within the model's token limits
     * @param text The text to validate
     * @param maxTokens The maximum number of tokens allowed
     */
    validateTokenLimit(text: string, maxTokens: number = 0): boolean {
        // If maxTokens is 0 or less, don't enforce a limit
        if (maxTokens <= 0) {
            return true;
        }
        const tokenCount = this.getTokenCount(text);
        return tokenCount <= maxTokens;
    }

    /**
     * Approximates the token count for a text.
     * This is a simple implementation that counts 4 characters as 1 token.
     * @param text The text to count tokens for
     */
    private approximateTokenCount(text: string): number {
        // A very crude approximation - 1 token is roughly 4 characters in English
        return Math.ceil(text.length / 4);
    }
}

/**
 * Fallback embedding provider for testing or when API is not available
 * Returns default vectors for testing purposes - suitable for development environments
 */
export class TestEmbeddingProvider extends BaseEmbeddingProvider {
    private dimensions: number;
    private deterministicMode: boolean;
    
    constructor(dimensions: number = 1536, deterministicMode: boolean = false) {
        super();
        this.dimensions = dimensions;
        this.deterministicMode = deterministicMode;
    }
    
    getName(): string {
        return 'test';
    }
    
    async getEmbedding(text: string): Promise<number[]> {
        if (this.deterministicMode) {
            // In deterministic mode, generate a pseudo-random vector based on the text hash
            // This ensures the same text always gets the same embedding
            return this.deterministicEmbedding(text);
        }
        
        // Generate random vector of specified dimension
        return Array.from({ length: this.dimensions }, () => Math.random() * 2 - 1);
    }
    
    /**
     * Generate a deterministic embedding based on the text
     * @param text The text to generate an embedding for
     * @returns A deterministic embedding vector
     */
    private deterministicEmbedding(text: string): number[] {
        // Simple hash function to generate a seed from the text
        const hash = text.split('').reduce((acc, char) => {
            return ((acc << 5) - acc) + char.charCodeAt(0);
        }, 0);
        
        // Use the hash as a seed to generate a deterministic vector
        const vector: number[] = [];
        let seed = Math.abs(hash);
        
        for (let i = 0; i < this.dimensions; i++) {
            // Generate a pseudo-random number based on the seed
            seed = (seed * 9301 + 49297) % 233280;
            const value = (seed / 233280) * 2 - 1;
            vector.push(value);
        }
        
        // Normalize the vector
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        return vector.map(val => val / magnitude);
    }
    
    getDimensions(): number {
        return this.dimensions;
    }
}