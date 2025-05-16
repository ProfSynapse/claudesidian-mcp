import { Notice, requestUrl } from 'obsidian';
import { MemorySettings } from '../../../types';
import { BaseEmbeddingProvider } from './embeddings-provider';

/**
 * OpenAI provider for generating embeddings
 * Uses the OpenAI API to create embeddings for text
 */
export class OpenAIProvider extends BaseEmbeddingProvider {
    private apiKey: string;
    private organization?: string;
    private model: string;
    private dimensions: number;
    private rateLimitPerMinute: number;
    private requestsThisMinute: number = 0;
    private lastRequestMinute: number = 0;
    private apiUrl: string = 'https://api.openai.com/v1/embeddings';
    
    /**
     * Create a new OpenAI provider
     * @param settings Memory settings containing OpenAI configuration
     */
    constructor(settings: MemorySettings) {
        super();
        this.apiKey = settings.openaiApiKey;
        this.organization = settings.openaiOrganization;
        this.model = settings.embeddingModel;
        this.dimensions = settings.dimensions;
        this.rateLimitPerMinute = settings.apiRateLimitPerMinute;
        
        // Validate API key
        if (!this.apiKey) {
            throw new Error('OpenAI API key is required');
        }
    }
    
    /**
     * Get the name of the provider
     */
    getName(): string {
        return 'openai';
    }
    
    /**
     * Get the dimensions of the embedding vectors
     */
    getDimensions(): number {
        return this.dimensions;
    }
    
    /**
     * Get a more accurate token count for OpenAI models
     * This is a simple approximation - for production, consider using tiktoken
     * @param text The text to count tokens for
     */
    getTokenCount(text: string): number {
        // This is a more accurate approximation for GPT models than the base class
        // For production use, you'd want to use the tiktoken library
        const tokenRegex = /(['"].*?['"]|\S+)/g;
        const matches = text.match(tokenRegex);
        return matches ? matches.length : 0;
    }
    
    /**
     * Get embeddings for a text using OpenAI API
     * Includes rate limiting and error handling
     * @param text The text to get embeddings for
     */
    async getEmbedding(text: string): Promise<number[]> {
        if (!text || text.trim().length === 0) {
            throw new Error('Text is required for embedding');
        }
        
        // Apply rate limiting
        await this.checkRateLimit();
        
        try {
            // Count tokens for usage tracking
            const tokenCount = this.getTokenCount(text);
            
            const response = await requestUrl({
                url: this.apiUrl,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    ...(this.organization ? { 'OpenAI-Organization': this.organization } : {})
                },
                body: JSON.stringify({
                    input: text,
                    model: this.model,
                    dimensions: this.dimensions
                })
            });
            
            // Update rate limiting tracker
            this.trackRequest();
            
            if (response.status === 200) {
                const data = response.json;
                
                // Track token usage (if vaultLibrarian is available)
                try {
                    const app = window.app;
                    if (app) {
                        const plugin = app.plugins.getPlugin('claudesidian-mcp');
                        if (plugin) {
                            const vaultLibrarian = plugin.connector.getVaultLibrarian();
                            if (vaultLibrarian && vaultLibrarian.trackTokenUsage) {
                                // Get actual token usage from response if available
                                const actualTokenCount = data.usage?.prompt_tokens || tokenCount;
                                vaultLibrarian.trackTokenUsage(actualTokenCount);
                            }
                        }
                    }
                } catch (usageError) {
                    console.warn('Failed to track token usage:', usageError);
                }
                
                // Handle response format for OpenAI embedding API
                if (data.data && data.data.length > 0 && data.data[0].embedding) {
                    return data.data[0].embedding;
                } else {
                    throw new Error('Invalid response format from OpenAI API');
                }
            } else {
                throw new Error(`OpenAI API error: ${response.status} ${response.text}`);
            }
        } catch (error) {
            // Log error and provide user notification
            console.error('Error generating embeddings:', error);
            new Notice('Error generating embeddings: ' + (error.message || error));
            throw error;
        }
    }
    
    /**
     * Track API requests for rate limiting
     */
    private trackRequest(): void {
        const now = new Date();
        const currentMinute = now.getMinutes();
        
        if (currentMinute !== this.lastRequestMinute) {
            // Reset counter for a new minute
            this.requestsThisMinute = 1;
            this.lastRequestMinute = currentMinute;
        } else {
            // Increment counter
            this.requestsThisMinute++;
        }
    }
    
    /**
     * Check rate limit before making a request
     * Implements delay if approaching limit
     */
    private async checkRateLimit(): Promise<void> {
        const now = new Date();
        const currentMinute = now.getMinutes();
        
        // Reset counter if we're in a new minute
        if (currentMinute !== this.lastRequestMinute) {
            this.requestsThisMinute = 0;
            this.lastRequestMinute = currentMinute;
            return;
        }
        
        // If we're approaching the limit, delay the request
        if (this.requestsThisMinute >= this.rateLimitPerMinute) {
            const secondsToNextMinute = 60 - now.getSeconds();
            // Add a small buffer to ensure we're in the next minute
            const delayMs = (secondsToNextMinute + 1) * 1000;
            
            new Notice(`Rate limit approached. Waiting ${secondsToNextMinute} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            
            // Reset after delay
            this.requestsThisMinute = 0;
        }
    }
}