import { Notice, requestUrl } from 'obsidian';
import { MemorySettings } from '../../types';
import { BaseEmbeddingProvider } from './embeddings-provider';
import { IEmbeddingProvider, ITokenTrackingProvider } from '../interfaces/IEmbeddingProvider';
import { getErrorMessage } from '../../utils/errorUtils';
import { OpenAITokenManager } from './base/TokenManager';
import { RateLimiter } from './base/RateLimiter';
import { UsageTracker, IEventEmitter } from './base/UsageTracker';

/**
 * OpenAI provider for generating embeddings
 * Uses the OpenAI API to create embeddings for text
 */
// Implement both interfaces separately since they have different requirements
export class OpenAIProvider extends BaseEmbeddingProvider implements ITokenTrackingProvider {
    private apiKey: string;
    private organization?: string;
    private model: string;
    private dimensions: number;
    private apiUrl: string = 'https://api.openai.com/v1/embeddings';
    
    // Composed components following SRP
    private tokenManager: OpenAITokenManager;
    private rateLimiter: RateLimiter;
    private usageTracker: UsageTracker;
    
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
        
        // Validate API key
        if (!this.apiKey) {
            throw new Error('OpenAI API key is required');
        }
        
        // Initialize composed components
        this.tokenManager = new OpenAITokenManager();
        
        this.rateLimiter = new RateLimiter({
            requestsPerMinute: settings.apiRateLimitPerMinute,
            showNotifications: true
        });
        
        // Create event emitter for plugin integration
        const eventEmitter: IEventEmitter = {
            emit: (event: string, data: any) => {
                try {
                    const app = (window as any).app;
                    const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
                    if (plugin?.eventManager?.emit) {
                        plugin.eventManager.emit(event, data);
                    }
                } catch (error) {
                    console.warn('Failed to emit event:', error);
                }
            }
        };
        
        this.usageTracker = new UsageTracker({
            costPerThousandTokens: settings.costPerThousandTokens || {
                'text-embedding-3-small': 0.00002,
                'text-embedding-3-large': 0.00013
            },
            storageKey: 'claudesidian-tokens-used',
            eventEmitter
        });
    }
    
    // IEmbeddingProvider implementation
    async initialize(): Promise<void> {
        console.log('OpenAI embedding provider initialized');
        return Promise.resolve();
    }
    
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
    
    normalizeVector(vector: number[]): number[] {
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        
        if (norm === 0) {
            return new Array(vector.length).fill(0);
        }
        
        return vector.map(val => val / norm);
    }
    
    getDimension(): number {
        return this.dimensions;
    }
    
    getType(): string {
        return 'openai';
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
     * Check if we should include dimensions parameter in the API request
     * Only include if it's a valid dimension for the model
     */
    private shouldIncludeDimensions(): boolean {
        // For text-embedding-3-small: dimensions must be between 512 and 1536 (in steps of 64)
        if (this.model === 'text-embedding-3-small') {
            return this.dimensions >= 512 && this.dimensions <= 1536 && this.dimensions % 64 === 0;
        }
        
        // For text-embedding-3-large: dimensions must be between 1024 and 3072 (in steps of 64)
        if (this.model === 'text-embedding-3-large') {
            return this.dimensions >= 1024 && this.dimensions <= 3072 && this.dimensions % 64 === 0;
        }
        
        // For older models, don't include dimensions parameter
        return false;
    }
    
    /**
     * Get a precise token count for OpenAI models
     * @param text The text to count tokens for
     */
    getTokenCount(text: string): number {
        return this.tokenManager.getTokenCount(text);
    }
    
    /**
     * Check if text exceeds the token limit
     * @param text Text to check
     * @returns True if the text exceeds token limit, false otherwise
     */
    private exceedsTokenLimit(text: string): boolean {
        return this.tokenManager.exceedsTokenLimit(text);
    }
    
    /**
     * Split text into chunks that fit within token limits
     * @param text Text to split
     * @param maxTokens Maximum tokens per chunk
     * @returns Array of text chunks
     */
    private splitTextByTokenLimit(text: string, maxTokens?: number): string[] {
        return this.tokenManager.splitTextByTokenLimit(text, maxTokens);
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
        
        // Check if the text exceeds token limit
        if (this.exceedsTokenLimit(text)) {
            console.log(`Text exceeds token limit (${this.getTokenCount(text)} tokens). Splitting and averaging embeddings.`);
            return this.getEmbeddingForLongText(text);
        }
        
        // Apply rate limiting
        await this.rateLimiter.checkRateLimit();
        
        try {
            // Count tokens for usage tracking - get precise count with gpt-tokenizer
            const tokenCount = this.getTokenCount(text);
            
            const requestBody = {
                input: text,
                model: this.model,
                ...(this.shouldIncludeDimensions() ? { dimensions: this.dimensions } : {})
            };
            
            // Debug logging
            console.log('[OpenAI Debug] API Request:', {
                url: this.apiUrl,
                model: this.model,
                dimensions: this.dimensions,
                shouldIncludeDimensions: this.shouldIncludeDimensions(),
                requestBody: requestBody,
                apiKeyPrefix: this.apiKey.substring(0, 7) + '...',
                organization: this.organization
            });
            
            const response = await requestUrl({
                url: this.apiUrl,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    ...(this.organization ? { 'OpenAI-Organization': this.organization } : {})
                },
                body: JSON.stringify(requestBody)
            });
            
            // Update rate limiting tracker
            this.rateLimiter.trackRequest();
            
            if (response.status === 200) {
                const data = response.json;
                
                // Track token usage
                try {
                    const actualTokenCount = data.usage?.prompt_tokens || tokenCount;
                    await this.usageTracker.trackUsage(actualTokenCount, this.model);
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
                console.error('[OpenAI Debug] API Error Response:', {
                    status: response.status,
                    statusText: response.status === 404 ? 'Not Found' : 'Unknown',
                    responseText: response.text,
                    headers: response.headers,
                    url: this.apiUrl,
                    model: this.model
                });
                throw new Error(`OpenAI API error: ${response.status} ${response.text}`);
            }
        } catch (error) {
            // Log error and provide user notification
            console.error('Error generating embeddings:', error);
            new Notice('Error generating embeddings: ' + getErrorMessage(error));
            throw new Error(`Failed to generate embeddings: ${getErrorMessage(error)}`);
        }
    }
    
    /**
     * Get embedding for a long text by splitting it into chunks, getting embeddings for each chunk,
     * and then averaging the embeddings weighted by chunk length
     * @param text Long text to get embedding for
     * @returns Averaged embedding vector
     */
    private async getEmbeddingForLongText(text: string): Promise<number[]> {
        // Split the text into chunks that fit within token limits
        const chunks = this.splitTextByTokenLimit(text);
        console.log(`Split long text into ${chunks.length} chunks for embedding.`);
        
        // Get embeddings for each chunk
        const embeddings: number[][] = [];
        const weights: number[] = [];
        
        for (const chunk of chunks) {
            try {
                // Apply rate limiting
                await this.rateLimiter.checkRateLimit();
                
                // Skip empty chunks
                if (!chunk || chunk.trim().length === 0) continue;
                
                const tokenCount = this.getTokenCount(chunk);
                weights.push(tokenCount); // Use token count as weight
                
                const response = await requestUrl({
                    url: this.apiUrl,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        ...(this.organization ? { 'OpenAI-Organization': this.organization } : {})
                    },
                    body: JSON.stringify({
                        input: chunk,
                        model: this.model,
                        ...(this.shouldIncludeDimensions() ? { dimensions: this.dimensions } : {})
                    })
                });
                
                // Update rate limiting tracker
                this.rateLimiter.trackRequest();
                
                if (response.status === 200) {
                    const data = response.json;
                    
                    // Track token usage
                    try {
                        const actualTokenCount = data.usage?.prompt_tokens || tokenCount;
                        await this.usageTracker.trackUsage(actualTokenCount, this.model);
                    } catch (usageError) {
                        console.warn('Failed to track token usage:', usageError);
                    }
                    
                    if (data.data && data.data.length > 0 && data.data[0].embedding) {
                        embeddings.push(data.data[0].embedding);
                    } else {
                        console.warn('Invalid response format for chunk, skipping');
                    }
                } else {
                    console.warn(`Error embedding chunk: ${response.status} ${response.text}`);
                }
            } catch (error) {
                console.warn('Error embedding chunk:', error);
                // Continue with other chunks
            }
        }
        
        // If we couldn't get any embeddings, throw an error
        if (embeddings.length === 0) {
            throw new Error('Failed to generate embeddings for all chunks');
        }
        
        // If we only got one embedding, return it
        if (embeddings.length === 1) {
            return embeddings[0];
        }
        
        // Otherwise, average the embeddings, weighted by chunk token count
        return this.weightedAverageEmbeddings(embeddings, weights);
    }
    
    /**
     * Calculate the weighted average of multiple embeddings
     * @param embeddings Array of embedding vectors
     * @param weights Array of weights (same length as embeddings)
     * @returns Weighted average embedding vector
     */
    private weightedAverageEmbeddings(embeddings: number[][], weights: number[]): number[] {
        if (embeddings.length === 0) {
            throw new Error('No embeddings to average');
        }
        
        if (embeddings.length !== weights.length) {
            // If weights don't match, use equal weights
            weights = embeddings.map(() => 1);
        }
        
        const dimensions = embeddings[0].length;
        const result = new Array(dimensions).fill(0);
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        
        // If total weight is 0, use equal weights
        const normalizedWeights = totalWeight === 0 
            ? weights.map(() => 1 / weights.length) 
            : weights.map(w => w / totalWeight);
        
        // Calculate weighted average
        for (let i = 0; i < embeddings.length; i++) {
            const embedding = embeddings[i];
            const weight = normalizedWeights[i];
            
            for (let j = 0; j < dimensions; j++) {
                result[j] += embedding[j] * weight;
            }
        }
        
        // Normalize the result vector
        const norm = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
        if (norm > 0) {
            for (let i = 0; i < dimensions; i++) {
                result[i] /= norm;
            }
        }
        
        return result;
    }
    
    /**
     * Get the cost per token for the current model
     */
    getCostPerToken(): number {
        // Get cost breakdown to calculate per-token cost
        const breakdown = this.usageTracker.getCostBreakdown();
        const modelInfo = breakdown[this.model];
        if (modelInfo && modelInfo.tokens > 0) {
            return modelInfo.cost / modelInfo.tokens;
        }
        return 0; // No usage recorded yet
    }
    
    /**
     * Get the total cost incurred for this provider instance
     */
    getTotalCost(): number {
        return this.usageTracker.getTotalCost();
    }
    
    /**
     * Get model usage stats
     */
    getModelUsage(): {[key: string]: number} {
        return this.usageTracker.getModelUsage();
    }
    
    /**
     * Get total tokens used this month
     */
    getTokensThisMonth(): number {
        return this.usageTracker.getTokensThisMonth();
    }
    
    /**
     * Update usage stats with a new token count
     * @param tokenCount Number of tokens to add
     * @param model Optional model name (defaults to current model)
     */
    async updateUsageStats(tokenCount: number, model?: string): Promise<void> {
        const modelToUpdate = model || this.model;
        await this.usageTracker.trackUsage(tokenCount, modelToUpdate);
    }
    
    /**
     * Reset usage stats
     */
    async resetUsageStats(): Promise<void> {
        await this.usageTracker.resetUsageStats();
    }
    
    // Implement generateEmbeddings from IEmbeddingProvider
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        if (!texts || texts.length === 0) {
            return [];
        }
        
        const results: number[][] = [];
        
        // Process each text individually to handle token limits properly
        for (const text of texts) {
            try {
                const embedding = await this.getEmbedding(text);
                results.push(embedding);
            } catch (error) {
                console.error('Error generating embedding for text:', error);
                // Push null or a zero vector to maintain array length matching input
                results.push(new Array(this.dimensions).fill(0));
            }
        }
        
        return results;
    }
}