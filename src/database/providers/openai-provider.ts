import { Notice, requestUrl } from 'obsidian';
import { MemorySettings } from '../../types';
import { BaseEmbeddingProvider } from './embeddings-provider';
import { IEmbeddingProvider, ITokenTrackingProvider } from '../interfaces/IEmbeddingProvider';
import * as gptTokenizer from 'gpt-tokenizer';
import { getErrorMessage } from '../../utils/errorUtils';

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
    private rateLimitPerMinute: number;
    private requestsThisMinute: number = 0;
    private lastRequestMinute: number = 0;
    private apiUrl: string = 'https://api.openai.com/v1/embeddings';
    private costPerThousandTokens: {[key: string]: number};
    private modelUsage: {[key: string]: number} = {
        'text-embedding-3-small': 0,
        'text-embedding-3-large': 0
    };
    
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
        this.costPerThousandTokens = settings.costPerThousandTokens || {
            // Convert per million token costs to per thousand token costs
            // $0.02 per million = $0.00002 per thousand for text-embedding-3-small
            // $0.13 per million = $0.00013 per thousand for text-embedding-3-large
            'text-embedding-3-small': 0.00002,
            'text-embedding-3-large': 0.00013
        };
        
        // Load saved model usage from localStorage if available
        try {
            if (typeof localStorage !== 'undefined') {
                const savedUsage = localStorage.getItem('claudesidian-tokens-used');
                if (savedUsage) {
                    const parsedUsage = JSON.parse(savedUsage);
                    // Validate that it's an object with model keys
                    if (typeof parsedUsage === 'object' && parsedUsage !== null) {
                        this.modelUsage = {
                            'text-embedding-3-small': parsedUsage['text-embedding-3-small'] || 0,
                            'text-embedding-3-large': parsedUsage['text-embedding-3-large'] || 0
                        };
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load token usage from localStorage:', error);
            // Continue with default model usage
        }
        
        // Validate API key
        if (!this.apiKey) {
            throw new Error('OpenAI API key is required');
        }
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
     * Maximum token limit for the embedding models
     * OpenAI's text-embedding-3 models have an 8192 token limit
     */
    private readonly MAX_TOKEN_LIMIT = 8192;
    
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
     * Get a precise token count for OpenAI models using gpt-tokenizer
     * @param text The text to count tokens for
     */
    getTokenCount(text: string): number {
        try {
            // Use cl100k_base encoding which is used by text-embedding-3 models
            return gptTokenizer.encode(text, { allowedSpecial: 'all' }).length;
        } catch (error) {
            console.warn('Error using gpt-tokenizer, falling back to regex approximation', error);
            // Fall back to regex approximation if tokenizer fails
            const tokenRegex = /(['"].*?['"]|\S+)/g;
            const matches = text.match(tokenRegex);
            return matches ? matches.length : 0;
        }
    }
    
    /**
     * Check if text exceeds the token limit
     * @param text Text to check
     * @returns True if the text exceeds token limit, false otherwise
     */
    private exceedsTokenLimit(text: string): boolean {
        const tokenCount = this.getTokenCount(text);
        return tokenCount > this.MAX_TOKEN_LIMIT;
    }
    
    /**
     * Split text into chunks that fit within token limits
     * @param text Text to split
     * @param maxTokens Maximum tokens per chunk (defaults to MAX_TOKEN_LIMIT)
     * @returns Array of text chunks
     */
    private splitTextByTokenLimit(text: string, maxTokens: number = this.MAX_TOKEN_LIMIT): string[] {
        if (!this.exceedsTokenLimit(text)) {
            return [text]; // No splitting needed
        }
        
        const chunks: string[] = [];
        
        // Try splitting by paragraphs first (most natural boundaries)
        const paragraphs = text.split(/\n\s*\n/);
        
        let currentChunk = "";
        let currentChunkTokens = 0;
        
        for (const paragraph of paragraphs) {
            const paragraphTokens = this.getTokenCount(paragraph);
            
            // If a single paragraph exceeds the limit, we'll need to split it further
            if (paragraphTokens > maxTokens) {
                // If we have content in the current chunk, add it first
                if (currentChunkTokens > 0) {
                    chunks.push(currentChunk);
                    currentChunk = "";
                    currentChunkTokens = 0;
                }
                
                // Split the large paragraph by sentences
                const sentenceChunks = this.splitLargeParagraph(paragraph, maxTokens);
                chunks.push(...sentenceChunks);
                continue;
            }
            
            // Check if adding this paragraph would exceed the limit
            if (currentChunkTokens + paragraphTokens + 1 > maxTokens) { // +1 for the newline
                // Add the current chunk to the result and start a new one
                chunks.push(currentChunk);
                currentChunk = paragraph;
                currentChunkTokens = paragraphTokens;
            } else {
                // Add to the current chunk
                if (currentChunk.length > 0) {
                    currentChunk += "\n\n" + paragraph;
                    currentChunkTokens += paragraphTokens + 2; // +2 for the newlines
                } else {
                    currentChunk = paragraph;
                    currentChunkTokens = paragraphTokens;
                }
            }
        }
        
        // Add the last chunk if it has content
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        
        return chunks;
    }
    
    /**
     * Split a large paragraph into smaller chunks by sentences
     * @param paragraph Large paragraph to split
     * @param maxTokens Maximum tokens per chunk
     * @returns Array of text chunks
     */
    private splitLargeParagraph(paragraph: string, maxTokens: number): string[] {
        const chunks: string[] = [];
        
        // Split by sentences - try to be smarter about sentence boundaries
        const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
        
        let currentChunk = "";
        let currentChunkTokens = 0;
        
        for (const sentence of sentences) {
            const sentenceTokens = this.getTokenCount(sentence);
            
            // If a single sentence exceeds the limit, we'll need to split it further by words
            if (sentenceTokens > maxTokens) {
                // If we have content in the current chunk, add it first
                if (currentChunkTokens > 0) {
                    chunks.push(currentChunk);
                    currentChunk = "";
                    currentChunkTokens = 0;
                }
                
                // Split the large sentence by words
                const words = sentence.split(/\s+/);
                let wordChunk = "";
                let wordChunkTokens = 0;
                
                for (const word of words) {
                    const wordTokens = this.getTokenCount(word);
                    
                    if (wordChunkTokens + wordTokens + 1 > maxTokens) { // +1 for the space
                        chunks.push(wordChunk);
                        wordChunk = word;
                        wordChunkTokens = wordTokens;
                    } else {
                        if (wordChunk.length > 0) {
                            wordChunk += " " + word;
                            wordChunkTokens += wordTokens + 1; // +1 for the space
                        } else {
                            wordChunk = word;
                            wordChunkTokens = wordTokens;
                        }
                    }
                }
                
                // Add the last word chunk if it has content
                if (wordChunk.length > 0) {
                    chunks.push(wordChunk);
                }
                
                continue;
            }
            
            // Check if adding this sentence would exceed the limit
            if (currentChunkTokens + sentenceTokens + 1 > maxTokens) { // +1 for the space
                // Add the current chunk to the result and start a new one
                chunks.push(currentChunk);
                currentChunk = sentence;
                currentChunkTokens = sentenceTokens;
            } else {
                // Add to the current chunk
                if (currentChunk.length > 0) {
                    currentChunk += " " + sentence;
                    currentChunkTokens += sentenceTokens + 1; // +1 for the space
                } else {
                    currentChunk = sentence;
                    currentChunkTokens = sentenceTokens;
                }
            }
        }
        
        // Add the last chunk if it has content
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        
        return chunks;
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
        await this.checkRateLimit();
        
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
            this.trackRequest();
            
            if (response.status === 200) {
                const data = response.json;
                
                // Track token usage (if vaultLibrarian is available)
                try {
                    // Get actual token usage from response if available
                    const actualTokenCount = data.usage?.prompt_tokens || tokenCount;
                    
                    // Track model-specific usage
                    this.modelUsage[this.model] = (this.modelUsage[this.model] || 0) + actualTokenCount;
                    
                    // Save to local storage for persistence
                    try {
                        if (typeof localStorage !== 'undefined') {
                            localStorage.setItem('claudesidian-tokens-used', JSON.stringify(this.modelUsage));
                            
                            // Dispatch a storage event to notify other components
                            // This is needed because localStorage events don't fire in the same window
                            try {
                                if (typeof StorageEvent === 'function' && typeof window.dispatchEvent === 'function') {
                                    window.dispatchEvent(new StorageEvent('storage', {
                                        key: 'claudesidian-tokens-used',
                                        newValue: JSON.stringify(this.modelUsage),
                                        storageArea: localStorage
                                    }));
                                    console.log('Dispatched storage event for token usage update');
                                } else {
                                    console.log('StorageEvent not supported in this browser, skipping dispatch');
                                }
                            } catch (dispatchError) {
                                console.warn('Failed to dispatch storage event:', dispatchError);
                            }
                            
                            // Try to emit event using the plugin's EventManager if available
                            try {
                                const app = (window as any).app;
                                const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
                                
                                if (plugin?.eventManager?.emit) {
                                    plugin.eventManager.emit('token-usage-updated', {
                                        modelUsage: this.modelUsage,
                                        tokensThisMonth: this.getTokensThisMonth(),
                                        estimatedCost: this.getTotalCost()
                                    });
                                    console.log('Emitted token-usage-updated event');
                                }
                            } catch (emitError) {
                                console.warn('Failed to emit token usage event:', emitError);
                            }
                        }
                    } catch (storageError) {
                        console.warn('Failed to save token usage to localStorage:', storageError);
                    }
                    
                    // Calculate cost
                    const cost = (actualTokenCount / 1000) * (this.costPerThousandTokens[this.model] || 0);
                    
                    const app = (window as any).app;
                    if (app) {
                        const plugin = app.plugins.getPlugin('claudesidian-mcp');
                        if (plugin) {
                            // First try to use VectorManager which is the correct agent for embedding operations
                            const vectorManager = plugin.connector?.getVectorManager?.();
                            if (vectorManager && vectorManager.trackTokenUsage) {
                                // Track token usage with detailed info
                                vectorManager.trackTokenUsage(actualTokenCount, {
                                    model: this.model,
                                    cost: cost,
                                    modelUsage: this.modelUsage
                                });
                            } else {
                                console.warn('VectorManager not available for token tracking, updating stats directly');
                                // If VectorManager is not available, update stats directly
                                this.updateUsageStats(actualTokenCount);
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
                await this.checkRateLimit();
                
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
                this.trackRequest();
                
                if (response.status === 200) {
                    const data = response.json;
                    
                    // Track token usage
                    try {
                        const actualTokenCount = data.usage?.prompt_tokens || tokenCount;
                        this.modelUsage[this.model] = (this.modelUsage[this.model] || 0) + actualTokenCount;
                        
                        // Save to local storage for persistence
                        try {
                            if (typeof localStorage !== 'undefined') {
                                localStorage.setItem('claudesidian-tokens-used', JSON.stringify(this.modelUsage));
                                
                                // Dispatch a storage event to notify other components
                                // This is needed because localStorage events don't fire in the same window
                                try {
                                    window.dispatchEvent(new StorageEvent('storage', {
                                        key: 'claudesidian-tokens-used',
                                        newValue: JSON.stringify(this.modelUsage),
                                        storageArea: localStorage
                                    }));
                                    console.log('Dispatched storage event for token usage update');
                                } catch (dispatchError) {
                                    console.warn('Failed to dispatch storage event:', dispatchError);
                                }
                                
                                // Try to emit event using the plugin's EventManager if available
                                try {
                                    const app = (window as any).app;
                                    const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
                                    
                                    if (plugin?.eventManager?.emit) {
                                        plugin.eventManager.emit('token-usage-updated', {
                                            modelUsage: this.modelUsage,
                                            tokensThisMonth: this.getTokensThisMonth(),
                                            estimatedCost: this.getTotalCost()
                                        });
                                        console.log('Emitted token-usage-updated event');
                                    }
                                } catch (emitError) {
                                    console.warn('Failed to emit token usage event:', emitError);
                                }
                            }
                        } catch (storageError) {
                            console.warn('Failed to save token usage to localStorage:', storageError);
                        }
                        
                        const cost = (actualTokenCount / 1000) * (this.costPerThousandTokens[this.model] || 0);
                        
                        const app = (window as any).app;
                        if (app) {
                            const plugin = app.plugins.getPlugin('claudesidian-mcp');
                            if (plugin) {
                                // First try to use VectorManager which is the correct agent for embedding operations
                                const vectorManager = plugin.connector?.getVectorManager?.();
                                if (vectorManager && vectorManager.trackTokenUsage) {
                                    // Track token usage with detailed info
                                    vectorManager.trackTokenUsage(actualTokenCount, {
                                        model: this.model,
                                        cost: cost,
                                        modelUsage: this.modelUsage
                                    });
                                } else {
                                    console.warn('VectorManager not available for token tracking, updating stats directly');
                                    // If VectorManager is not available, update stats directly
                                    this.updateUsageStats(actualTokenCount);
                                }
                            }
                        }
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
        return (this.costPerThousandTokens[this.model] || 0) / 1000;
    }
    
    /**
     * Get the total cost incurred for this provider instance
     */
    getTotalCost(): number {
        let totalCost = 0;
        
        // Iterate through each model in the usage stats
        for (const model in this.modelUsage) {
            // Get the token count for this model
            const tokens = this.modelUsage[model];
            
            // Ensure the model has a cost defined
            const costPerThousand = this.costPerThousandTokens[model] || 0;
            
            // Calculate the cost for this model and add to the total
            // (tokens / 1000) * cost per thousand tokens
            const modelCost = (tokens / 1000) * costPerThousand;
            totalCost += modelCost;
            
            console.log(`Cost calculation for ${model}: ${tokens} tokens at $${costPerThousand} per 1k = $${modelCost.toFixed(6)}`);
        }
        
        console.log(`Total cost calculated: $${totalCost.toFixed(6)}`);
        return totalCost;
    }
    
    /**
     * Get model usage stats
     */
    getModelUsage(): {[key: string]: number} {
        return { ...this.modelUsage };
    }
    
    /**
     * Get total tokens used this month
     */
    getTokensThisMonth(): number {
        let total = 0;
        for (const model in this.modelUsage) {
            total += this.modelUsage[model];
        }
        return total;
    }
    
    /**
     * Update usage stats with a new token count
     * @param tokenCount Number of tokens to add
     * @param model Optional model name (defaults to current model)
     */
    async updateUsageStats(tokenCount: number, model?: string): Promise<void> {
        // Add to the specified model's usage count, or create a new entry if it doesn't exist
        const modelToUpdate = model || this.model;
        const currentUsage = this.modelUsage[modelToUpdate] || 0;
        this.modelUsage[modelToUpdate] = currentUsage + tokenCount;
        
        console.log(`Updated token usage for ${modelToUpdate}: ${currentUsage} + ${tokenCount} = ${this.modelUsage[modelToUpdate]}`);
        
        // Save to localStorage for persistence
        try {
            // Use localStorage if available (in Obsidian environment)
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('claudesidian-tokens-used', JSON.stringify(this.modelUsage));
                console.log(`Saved updated token usage to localStorage: `, this.modelUsage);
                
                // Dispatch a storage event to notify other components
                try {
                    if (typeof StorageEvent === 'function' && typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new StorageEvent('storage', {
                            key: 'claudesidian-tokens-used',
                            newValue: JSON.stringify(this.modelUsage),
                            storageArea: localStorage
                        }));
                        console.log('Dispatched storage event for manual token usage update');
                    } else {
                        console.log('StorageEvent not supported in this browser, skipping dispatch');
                    }
                } catch (dispatchError) {
                    console.warn('Failed to dispatch storage event:', dispatchError);
                }
                
                // Try to emit event using the plugin's EventManager if available
                try {
                    const app = (window as any).app;
                    const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
                    
                    if (plugin?.eventManager?.emit) {
                        plugin.eventManager.emit('token-usage-updated', {
                            modelUsage: this.modelUsage,
                            tokensThisMonth: this.getTokensThisMonth(),
                            estimatedCost: this.getTotalCost()
                        });
                        console.log('Emitted token-usage-updated event for manual update');
                    }
                } catch (emitError) {
                    console.warn('Failed to emit token usage event:', emitError);
                }
            }
        } catch (error) {
            console.warn('Failed to save token usage to localStorage:', error);
        }
    }
    
    /**
     * Reset usage stats
     */
    async resetUsageStats(): Promise<void> {
        // Reset all model usage to zero
        for (const model in this.modelUsage) {
            this.modelUsage[model] = 0;
        }
        
        // Save to local storage for persistence
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('claudesidian-tokens-used', JSON.stringify(this.modelUsage));
                
                // Dispatch a storage event to notify other components
                try {
                    if (typeof StorageEvent === 'function' && typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new StorageEvent('storage', {
                            key: 'claudesidian-tokens-used',
                            newValue: JSON.stringify(this.modelUsage),
                            storageArea: localStorage
                        }));
                        console.log('Dispatched storage event for token usage reset');
                    } else {
                        console.log('StorageEvent not supported in this browser, skipping dispatch');
                    }
                } catch (dispatchError) {
                    console.warn('Failed to dispatch storage event:', dispatchError);
                }
                
                // Try to emit event using the plugin's EventManager if available
                try {
                    const app = (window as any).app;
                    const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
                    
                    if (plugin?.eventManager?.emit) {
                        plugin.eventManager.emit('token-usage-reset', {
                            modelUsage: this.modelUsage,
                            tokensThisMonth: 0,
                            estimatedCost: 0
                        });
                        console.log('Emitted token-usage-reset event');
                    }
                } catch (emitError) {
                    console.warn('Failed to emit token usage event:', emitError);
                }
            }
        } catch (error) {
            console.warn('Failed to save token usage to localStorage:', error);
        }
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