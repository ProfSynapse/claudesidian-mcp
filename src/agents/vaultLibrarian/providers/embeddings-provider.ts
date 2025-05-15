import { EmbeddingProvider } from '../../../types';

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
    validateTokenLimit(text: string, maxTokens: number = 8191): boolean {
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
 * Dummy embedding provider for testing or when API is not available
 * Returns random vectors of the specified dimension
 */
export class DummyEmbeddingProvider extends BaseEmbeddingProvider {
    private dimensions: number;
    
    constructor(dimensions: number = 1536) {
        super();
        this.dimensions = dimensions;
    }
    
    getName(): string {
        return 'dummy';
    }
    
    async getEmbedding(text: string): Promise<number[]> {
        // Generate random vector of specified dimension
        return Array.from({ length: this.dimensions }, () => Math.random() * 2 - 1);
    }
    
    getDimensions(): number {
        return this.dimensions;
    }
}