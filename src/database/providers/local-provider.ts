import { Notice } from 'obsidian';
import { MemorySettings } from '../../types';
import { BaseEmbeddingProvider } from './embeddings-provider';
import { IEmbeddingProvider, ITokenTrackingProvider } from '../interfaces/IEmbeddingProvider';
import { getErrorMessage } from '../../utils/errorUtils';

// Import transformer.js
import { pipeline, env } from '@xenova/transformers';

/**
 * Local embedding provider using transformers.js and all-MiniLM-L6-v2
 * Allows for local, private embedding generation without API calls
 */
export class LocalEmbeddingProvider extends BaseEmbeddingProvider implements ITokenTrackingProvider {
    // Model configuration
    private modelName: string = 'sentence-transformers/all-MiniLM-L6-v2';
    private dimensions: number = 384;  // Fixed dimensions for all-MiniLM-L6-v2
    private modelLoaded: boolean = false;
    private embeddingPipeline: any = null;
    private modelUsage: {[key: string]: number} = {
        'all-MiniLM-L6-v2': 0 
    };
    private isLoading: boolean = false;
    private loadError: string | null = null;
    
    // Configure the transformers.js cache location if needed
    // This would normally be in localStorage, but can be customized
    private configureCache() {
        try {
            // Set cache directory for transformers.js
            // This helps reduce redownloads of models
            env.cacheDir = './.cache/transformers.js';
            console.log('Set transformers.js cache directory to:', env.cacheDir);
        } catch (error) {
            console.warn('Unable to set cache directory:', error);
            // Continue anyway, transformers.js will use its default cache location
        }
    }
    
    /**
     * Create a new local embedding provider
     * @param settings Memory settings containing local model configuration
     */
    constructor(settings: MemorySettings) {
        super();
        
        // Configure cache
        this.configureCache();
        
        // Load saved model usage from localStorage if available
        try {
            if (typeof localStorage !== 'undefined') {
                const savedUsage = localStorage.getItem('claudesidian-local-tokens-used');
                if (savedUsage) {
                    const parsedUsage = JSON.parse(savedUsage);
                    // Validate that it's an object with model keys
                    if (typeof parsedUsage === 'object' && parsedUsage !== null) {
                        this.modelUsage = {
                            'all-MiniLM-L6-v2': parsedUsage['all-MiniLM-L6-v2'] || 0
                        };
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load token usage from localStorage:', error);
            // Continue with default model usage
        }
    }
    
    /**
     * Initialize the model
     * Loads the embedding model in the background
     */
    async initialize(): Promise<void> {
        if (this.isLoading) {
            console.log('Model is already loading...');
            return;
        }
        
        if (this.modelLoaded && this.embeddingPipeline) {
            console.log('Model already loaded');
            return;
        }
        
        try {
            this.isLoading = true;
            this.loadError = null;
            
            // Show loading notice to user
            const notice = new Notice(`Loading local embedding model: ${this.modelName}...`, 0);
            
            // Load the embedding pipeline
            console.log(`Loading embedding model: ${this.modelName}`);
            this.embeddingPipeline = await pipeline('feature-extraction', this.modelName);
            
            this.modelLoaded = true;
            this.isLoading = false;
            console.log('Local embedding model loaded successfully');
            
            // Close the notice
            notice.hide();
            
            // Show success notice
            new Notice('Local embedding model loaded successfully');
            
        } catch (error) {
            this.isLoading = false;
            this.loadError = getErrorMessage(error);
            console.error('Error loading local embedding model:', error);
            new Notice('Error loading local embedding model: ' + this.loadError);
            throw new Error(`Failed to load embedding model: ${this.loadError}`);
        }
    }
    
    /**
     * Get the embeddings for a text
     * @param text Text to generate embeddings for
     * @returns Vector embedding
     */
    async getEmbedding(text: string): Promise<number[]> {
        if (!text || text.trim().length === 0) {
            throw new Error('Text is required for embedding');
        }
        
        // Initialize model if not already loaded
        if (!this.modelLoaded) {
            await this.initialize();
        }
        
        if (!this.embeddingPipeline) {
            throw new Error('Embedding model not loaded properly');
        }
        
        try {
            const startTime = performance.now();
            
            // Generate the embedding
            const output = await this.embeddingPipeline(text, {
                pooling: 'mean', // Use mean pooling to get a single vector
                normalize: true  // Normalize the output embedding
            });
            
            const endTime = performance.now();
            console.log(`Embedding generation took ${endTime - startTime}ms`);
            
            // Get the embedding data as a typed array
            const embedding = Array.from(output.data) as number[];
            
            // Track token usage
            const tokenCount = this.getTokenCount(text);
            this.trackUsage(tokenCount);
            
            return embedding;
        } catch (error) {
            console.error('Error generating embedding:', error);
            throw new Error(`Failed to generate embedding: ${getErrorMessage(error)}`);
        }
    }
    
    /**
     * Generate embeddings for multiple texts in batch
     * More efficient than calling getEmbedding multiple times
     * @param texts Array of texts to get embeddings for
     * @returns Array of embedding vectors
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        if (!texts || texts.length === 0) {
            return [];
        }
        
        // Initialize model if not already loaded
        if (!this.modelLoaded) {
            await this.initialize();
        }
        
        if (!this.embeddingPipeline) {
            throw new Error('Embedding model not loaded properly');
        }
        
        const results: number[][] = [];
        const batchSize = 16; // Process in small batches to avoid memory issues
        
        try {
            for (let i = 0; i < texts.length; i += batchSize) {
                const batch = texts.slice(i, i + batchSize);
                
                // Show progress message
                if (texts.length > batchSize) {
                    console.log(`Processing batch ${i/batchSize + 1}/${Math.ceil(texts.length/batchSize)}`);
                }
                
                // Process each text in the batch
                for (const text of batch) {
                    try {
                        if (!text || text.trim().length === 0) {
                            // Add a zero vector for empty text
                            results.push(new Array(this.dimensions).fill(0));
                            continue;
                        }
                        
                        const output = await this.embeddingPipeline(text, {
                            pooling: 'mean',
                            normalize: true
                        });
                        
                        const embedding = Array.from(output.data) as number[];
                        results.push(embedding);
                        
                        // Track token usage
                        const tokenCount = this.getTokenCount(text);
                        this.trackUsage(tokenCount);
                        
                    } catch (innerError) {
                        console.error('Error generating embedding for text:', innerError);
                        // Add a zero vector for the failed text
                        results.push(new Array(this.dimensions).fill(0));
                    }
                }
            }
            
            return results;
        } catch (error) {
            console.error('Error generating batch embeddings:', error);
            throw new Error(`Failed to generate batch embeddings: ${getErrorMessage(error)}`);
        }
    }
    
    /**
     * Calculate cosine similarity between two embedding vectors
     * @param a First vector
     * @param b Second vector
     * @returns Similarity score (0-1)
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
     * Normalize a vector to unit length (L2 norm)
     * @param vector Input vector
     * @returns Normalized vector with unit length
     */
    normalizeVector(vector: number[]): number[] {
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        
        if (norm === 0) {
            return new Array(vector.length).fill(0);
        }
        
        return vector.map(val => val / norm);
    }
    
    /**
     * Track token usage for the model
     * @param tokenCount Number of tokens to track
     */
    private trackUsage(tokenCount: number): void {
        this.modelUsage['all-MiniLM-L6-v2'] += tokenCount;
        
        // Save updated usage to localStorage
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('claudesidian-local-tokens-used', JSON.stringify(this.modelUsage));
                
                // Try to emit event using the plugin's EventManager if available
                try {
                    const app = (window as any).app;
                    const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
                    
                    if (plugin?.eventManager?.emit) {
                        plugin.eventManager.emit('token-usage-updated', {
                            modelUsage: this.modelUsage,
                            tokensThisMonth: this.getTokensThisMonth(),
                            estimatedCost: this.getTotalCost() // Will be 0 for local models
                        });
                    }
                } catch (emitError) {
                    console.warn('Failed to emit token usage event:', emitError);
                }
            }
        } catch (storageError) {
            console.warn('Failed to save token usage to localStorage:', storageError);
        }
    }
    
    /**
     * Get token count for a text
     * Uses a simple approximation since the actual tokenizer is more complex
     * @param text Text to count tokens for
     * @returns Approximate token count
     */
    getTokenCount(text: string): number {
        // all-MiniLM-L6-v2 uses a WordPiece tokenizer with vocab size of 30522
        // We'll use a simple approximation: split by whitespace, then estimate subword units
        // This won't be exact but gives a reasonable estimate
        const words = text.split(/\s+/);
        let tokenCount = 0;
        
        for (const word of words) {
            // For short words, likely 1 token
            // For longer words, estimate 1 token per 5 characters
            if (word.length <= 5) {
                tokenCount += 1;
            } else {
                tokenCount += Math.ceil(word.length / 5);
            }
        }
        
        return Math.max(1, tokenCount); // At least 1 token
    }
    
    /**
     * Get the name of the provider
     */
    getName(): string {
        return 'local-minilm';
    }
    
    /**
     * Get the type of the embedding model
     */
    getType(): string {
        return 'local-minilm';
    }
    
    /**
     * Get the dimensions of the embedding vectors
     * MiniLM-L6-v2 produces 384-dimensional vectors
     */
    getDimension(): number {
        return this.dimensions;
    }
    
    /**
     * Get the dimensions of the embedding vectors
     * Alias for getDimension() for compatibility
     */
    getDimensions(): number {
        return this.dimensions;
    }
    
    // ITokenTrackingProvider implementation
    
    /**
     * Get total tokens used this month
     * For local models, this is just for tracking, not billing
     */
    getTokensThisMonth(): number {
        return this.modelUsage['all-MiniLM-L6-v2'] || 0;
    }
    
    /**
     * Get model usage stats
     */
    getModelUsage(): {[key: string]: number} {
        return { ...this.modelUsage };
    }
    
    /**
     * Get total cost - always 0 for local models
     */
    getTotalCost(): number {
        return 0; // Local models have no API cost
    }
    
    /**
     * Update token usage stats
     * @param tokenCount Number of tokens used
     * @param model Optional model name
     */
    async updateUsageStats(tokenCount: number, model?: string): Promise<void> {
        const modelToUpdate = model || 'all-MiniLM-L6-v2';
        this.modelUsage[modelToUpdate] = (this.modelUsage[modelToUpdate] || 0) + tokenCount;
        
        // Save to localStorage
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('claudesidian-local-tokens-used', JSON.stringify(this.modelUsage));
                
                // Try to emit event
                try {
                    const app = (window as any).app;
                    const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
                    
                    if (plugin?.eventManager?.emit) {
                        plugin.eventManager.emit('token-usage-updated', {
                            modelUsage: this.modelUsage,
                            tokensThisMonth: this.getTokensThisMonth(),
                            estimatedCost: 0
                        });
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
        this.modelUsage = {
            'all-MiniLM-L6-v2': 0
        };
        
        // Save to localStorage
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('claudesidian-local-tokens-used', JSON.stringify(this.modelUsage));
                
                // Try to emit event
                try {
                    const app = (window as any).app;
                    const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
                    
                    if (plugin?.eventManager?.emit) {
                        plugin.eventManager.emit('token-usage-reset', {
                            modelUsage: this.modelUsage,
                            tokensThisMonth: 0,
                            estimatedCost: 0
                        });
                    }
                } catch (emitError) {
                    console.warn('Failed to emit token usage event:', emitError);
                }
            }
        } catch (error) {
            console.warn('Failed to save token usage to localStorage:', error);
        }
    }
}