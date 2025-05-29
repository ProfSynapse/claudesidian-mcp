import { requestUrl, RequestUrlParam } from 'obsidian';
import { BaseEmbeddingProvider } from './BaseEmbeddingProvider';
import { ITokenCounter } from './TokenManager';
import { IRateLimiter } from './RateLimiter';
import { IUsageTracker } from './UsageTracker';
import { getErrorMessage } from '../../../utils/errorUtils';

/**
 * Configuration for HTTP-based embedding providers
 */
export interface HttpEmbeddingConfig {
    apiUrl: string;
    apiKey: string;
    model: string;
    dimensions: number;
    headers?: { [key: string]: string };
}

/**
 * Base class for HTTP-based embedding providers
 * Handles common functionality like rate limiting, token tracking, and HTTP requests
 */
export abstract class HttpEmbeddingProvider extends BaseEmbeddingProvider {
    protected config: HttpEmbeddingConfig;
    protected tokenCounter: ITokenCounter;
    protected rateLimiter: IRateLimiter;
    protected usageTracker: IUsageTracker;

    constructor(
        config: HttpEmbeddingConfig,
        tokenCounter: ITokenCounter,
        rateLimiter: IRateLimiter,
        usageTracker: IUsageTracker
    ) {
        super();
        this.config = config;
        this.tokenCounter = tokenCounter;
        this.rateLimiter = rateLimiter;
        this.usageTracker = usageTracker;
    }

    /**
     * Get the name of the provider
     */
    abstract getName(): string;

    /**
     * Build the request body for the API
     */
    abstract buildRequestBody(text: string): any;

    /**
     * Extract embedding from API response
     */
    abstract extractEmbedding(response: any): number[];

    /**
     * Get token count from API response (if available)
     */
    abstract getResponseTokenCount(response: any): number | null;

    /**
     * Initialize the provider
     */
    async initialize(): Promise<void> {
        console.log(`${this.getName()} embedding provider initialized`);
    }

    /**
     * Get the type of the provider
     */
    getType(): string {
        return this.getName().toLowerCase();
    }

    /**
     * Get the dimensions of the embedding vectors
     */
    getDimensions(): number {
        return this.config.dimensions;
    }

    /**
     * Get a single embedding for text
     */
    async getEmbedding(text: string): Promise<number[]> {
        if (!text || text.trim().length === 0) {
            throw new Error('Text is required for embedding');
        }

        // Check if text exceeds token limit
        const tokenCount = this.tokenCounter.getTokenCount(text);
        const maxTokens = this.tokenCounter.getMaxTokenLimit();
        
        if (tokenCount > maxTokens) {
            console.log(`Text exceeds token limit (${tokenCount} tokens). Splitting and averaging embeddings.`);
            return this.getEmbeddingForLongText(text);
        }

        // Apply rate limiting
        await this.rateLimiter.checkRateLimit();

        try {
            const response = await this.makeApiRequest(text);
            
            // Track request
            this.rateLimiter.trackRequest();
            
            // Extract embedding
            const embedding = this.extractEmbedding(response);
            
            // Track usage
            const actualTokenCount = this.getResponseTokenCount(response) || tokenCount;
            await this.usageTracker.trackUsage(actualTokenCount, this.config.model);
            
            return embedding;
        } catch (error) {
            console.error(`Error generating embeddings with ${this.getName()}:`, error);
            throw new Error(`Failed to generate embeddings: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Make an API request to get embeddings
     */
    protected async makeApiRequest(text: string): Promise<any> {
        const requestBody = this.buildRequestBody(text);
        
        const requestConfig: RequestUrlParam = {
            url: this.config.apiUrl,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
                ...this.config.headers
            },
            body: JSON.stringify(requestBody)
        };

        const response = await requestUrl(requestConfig);
        
        if (response.status !== 200) {
            throw new Error(`API error: ${response.status} ${response.text}`);
        }
        
        return response.json;
    }

    /**
     * Get embedding for long text by splitting and averaging
     */
    protected async getEmbeddingForLongText(text: string): Promise<number[]> {
        // This would use the TokenManager to split text
        // For now, throw an error - subclasses can override if needed
        throw new Error('Text too long for embedding. Please split into smaller chunks.');
    }

    /**
     * Generate embeddings for multiple texts
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        if (!texts || texts.length === 0) {
            return [];
        }

        const results: number[][] = [];
        
        for (const text of texts) {
            try {
                const embedding = await this.getEmbedding(text);
                results.push(embedding);
            } catch (error) {
                console.error('Error generating embedding for text:', error);
                // Push zero vector to maintain array length
                results.push(new Array(this.config.dimensions).fill(0));
            }
        }
        
        return results;
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    calculateSimilarity(a: number[], b: number[]): number {
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
            return 0;
        }
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Normalize a vector
     */
    normalizeVector(vector: number[]): number[] {
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        
        if (norm === 0) {
            return new Array(vector.length).fill(0);
        }
        
        return vector.map(val => val / norm);
    }
}