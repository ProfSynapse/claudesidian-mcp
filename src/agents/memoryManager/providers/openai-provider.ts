import { MemorySettings } from '../../../types';
import { approximateTokenCount } from '../utils/tokenCounter';
import { BaseEmbeddingProvider } from './embeddings-provider';

/**
 * OpenAI embedding provider implementation
 * Uses the OpenAI API to generate embeddings
 */
export class OpenAIEmbeddingProvider extends BaseEmbeddingProvider {
    private apiKey: string;
    private organization?: string;
    private model: string;
    private dimensions: number;
    private embeddingCache: Map<string, number[]>;
    private apiRequestCounter: number;
    private apiRequestTimeWindow: number;
    private apiRequestMaxPerMinute: number;
    private lastRequestTime: number;
    private monthlyTokenCounter: number;
    private maxMonthlyTokens: number;
    
    /**
     * Create a new OpenAI embedding provider
     * @param settings Memory settings containing API keys and limits
     */
    constructor(settings: MemorySettings) {
        super();
        this.apiKey = settings.openaiApiKey;
        this.organization = settings.openaiOrganization;
        this.model = settings.embeddingModel;
        this.dimensions = settings.dimensions;
        
        // Initialize rate limiting
        this.apiRequestCounter = 0;
        this.apiRequestTimeWindow = 60 * 1000; // 1 minute in ms
        this.apiRequestMaxPerMinute = settings.apiRateLimitPerMinute;
        this.lastRequestTime = Date.now();
        
        // Initialize token usage tracking
        this.monthlyTokenCounter = 0; // This should be loaded from persistent storage
        this.maxMonthlyTokens = settings.maxTokensPerMonth;
        
        // Initialize cache for reusing embeddings
        this.embeddingCache = new Map<string, number[]>();
    }
    
    /**
     * Get the name of the provider
     */
    getName(): string {
        return `openai-${this.model}`;
    }
    
    /**
     * Get the dimensions of the embeddings
     */
    getDimensions(): number {
        return this.dimensions;
    }
    
    /**
     * Reset the monthly token counter
     */
    resetMonthlyTokenCounter(): void {
        this.monthlyTokenCounter = 0;
        // This should also persist the reset to storage
    }
    
    /**
     * Get the current monthly token usage
     */
    getMonthlyTokenUsage(): number {
        return this.monthlyTokenCounter;
    }
    
    /**
     * Check if monthly token limit is exceeded
     */
    isMonthlyTokenLimitExceeded(): boolean {
        return this.monthlyTokenCounter >= this.maxMonthlyTokens;
    }
    
    /**
     * Update API key from settings
     * @param apiKey New API key
     */
    updateApiKey(apiKey: string): void {
        this.apiKey = apiKey;
    }
    
    /**
     * Update organization ID from settings
     * @param organization New organization ID
     */
    updateOrganization(organization?: string): void {
        this.organization = organization;
    }
    
    /**
     * Update model from settings
     * @param model New model
     * @param dimensions New dimensions
     */
    updateModel(model: string, dimensions: number): void {
        this.model = model;
        this.dimensions = dimensions;
        // Clear cache when model changes
        this.embeddingCache.clear();
    }
    
    /**
     * Get embedding for a text
     * Uses the OpenAI API to generate embeddings
     * Implements caching, rate limiting, and token tracking
     * 
     * @param text The text to get embeddings for
     * @returns Vector embedding as an array of numbers
     */
    async getEmbedding(text: string): Promise<number[]> {
        // Check if we have this in cache
        const cacheKey = `${this.model}:${text}`;
        if (this.embeddingCache.has(cacheKey)) {
            return this.embeddingCache.get(cacheKey)!;
        }
        
        // Check if we've exceeded monthly token limit
        if (this.isMonthlyTokenLimitExceeded()) {
            throw new Error('Monthly token limit exceeded. Please reset the counter or increase the limit.');
        }
        
        // Implement rate limiting
        await this.enforceRateLimit();
        
        // Count tokens and update counter
        const tokenCount = this.getTokenCount(text);
        this.monthlyTokenCounter += tokenCount;
        
        try {
            const response = await this.callOpenAIAPI(text);
            
            // Cache the result
            this.embeddingCache.set(cacheKey, response);
            
            // Limit cache size to prevent memory issues (max 100 items)
            if (this.embeddingCache.size > 100) {
                const oldestKey = this.embeddingCache.keys().next().value;
                this.embeddingCache.delete(oldestKey);
            }
            
            return response;
        } catch (error) {
            console.error('Error generating embeddings:', error);
            throw error;
        }
    }
    
    /**
     * Call the OpenAI API to generate embeddings
     * This is separated for easier testing and mocking
     * 
     * @param text The text to get embeddings for
     * @returns Embedding vector
     */
    private async callOpenAIAPI(text: string): Promise<number[]> {
        if (!this.apiKey) {
            throw new Error('OpenAI API key not provided');
        }
        
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
        };
        
        if (this.organization) {
            headers['OpenAI-Organization'] = this.organization;
        }
        
        // Prepare the request body
        const requestBody = {
            model: this.model,
            input: text,
            dimensions: this.dimensions,
            encoding_format: 'float',
        };
        
        try {
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
            }
            
            const jsonResponse = await response.json();
            
            // Extract the embedding from the response
            if (jsonResponse.data && jsonResponse.data.length > 0) {
                return jsonResponse.data[0].embedding;
            } else {
                throw new Error('Invalid response format from OpenAI API');
            }
        } catch (error) {
            console.error('Error calling OpenAI API:', error);
            throw error;
        }
    }
    
    /**
     * Enforce rate limits to prevent API throttling
     * Implements a basic token bucket algorithm
     */
    private async enforceRateLimit(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        
        // Reset counter if time window has passed
        if (elapsed >= this.apiRequestTimeWindow) {
            this.apiRequestCounter = 0;
            this.lastRequestTime = now;
        }
        
        // If we've hit the rate limit, wait until the next window
        if (this.apiRequestCounter >= this.apiRequestMaxPerMinute) {
            const timeToWait = this.apiRequestTimeWindow - elapsed;
            if (timeToWait > 0) {
                await new Promise(resolve => setTimeout(resolve, timeToWait));
                // Recursive call after waiting
                return this.enforceRateLimit();
            } else {
                // Time window has passed while we were calculating
                this.apiRequestCounter = 0;
                this.lastRequestTime = Date.now();
            }
        }
        
        // Increment counter for this request
        this.apiRequestCounter++;
    }
    
    /**
     * Get token count for a text
     * Override to use a more accurate method for OpenAI models
     * 
     * @param text The text to count tokens for
     * @returns Token count
     */
    getTokenCount(text: string): number {
        // Using the approximate method for now
        // In a future version, we could integrate a proper tokenizer
        return approximateTokenCount(text);
    }
}