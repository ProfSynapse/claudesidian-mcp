import { Notice } from 'obsidian';
import { IEmbeddingProvider } from '../interfaces/IEmbeddingProvider';
import { LocalModelManager } from '../services/LocalModelManager';
import { getErrorMessage } from '../../utils/errorUtils';

interface LocalEmbeddingConfig {
    model: string;
    maxBatchSize: number;
    maxConcurrency: number;
    enableGPU: boolean;
}

/**
 * Local embedding provider using ONNX models and Transformers.js
 * Provides privacy-first embedding generation without external API calls
 */
export class LocalEmbeddingProvider implements IEmbeddingProvider {
    private modelManager: LocalModelManager;
    private config: LocalEmbeddingConfig;
    private isInitialized = false;
    private activeRequests = 0;
    private requestQueue: Array<() => void> = [];

    private readonly DEFAULT_CONFIG: LocalEmbeddingConfig = {
        model: 'all-MiniLM-L6-v2',
        maxBatchSize: 32,
        maxConcurrency: 2,
        enableGPU: false // Conservative default, can be enabled in settings
    };

    constructor(config?: Partial<LocalEmbeddingConfig>) {
        this.config = { ...this.DEFAULT_CONFIG, ...config };
        this.modelManager = LocalModelManager.getInstance();
    }

    /**
     * Initialize the local embedding provider
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('Initializing LocalEmbeddingProvider...');
            
            // Initialize the model manager
            await this.modelManager.initialize();
            
            // Load the default model
            await this.modelManager.loadModel(this.config.model);
            
            this.isInitialized = true;
            console.log('LocalEmbeddingProvider initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize LocalEmbeddingProvider:', error);
            throw new Error(`Failed to initialize local embedding provider: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Generate embeddings for an array of texts
     * @param texts Array of text content to embed
     * @returns Array of embedding vectors
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!texts || texts.length === 0) {
            return [];
        }

        // Filter out empty texts and track original indices
        const textIndexMap: number[] = [];
        const validTexts: string[] = [];
        
        texts.forEach((text, index) => {
            if (text && text.trim().length > 0) {
                validTexts.push(text.trim());
                textIndexMap.push(index);
            }
        });

        if (validTexts.length === 0) {
            // Return zero vectors for all inputs
            const dimensions = this.getDimension();
            return texts.map(() => new Array(dimensions).fill(0));
        }

        try {
            // Process texts in batches to manage memory and performance
            const batches = this.createBatches(validTexts, this.config.maxBatchSize);
            const embeddings: number[][] = [];

            for (const batch of batches) {
                await this.waitForSlot();
                try {
                    this.activeRequests++;
                    const batchEmbeddings = await this.generateBatchEmbeddings(batch);
                    embeddings.push(...batchEmbeddings);
                } finally {
                    this.activeRequests--;
                    this.processQueue();
                }
            }

            // Map results back to original indices, filling in zero vectors for empty texts
            const results: number[][] = [];
            const dimensions = this.getDimension();
            let embeddingIndex = 0;

            for (let i = 0; i < texts.length; i++) {
                if (textIndexMap.includes(i)) {
                    results.push(embeddings[embeddingIndex++]);
                } else {
                    results.push(new Array(dimensions).fill(0));
                }
            }

            return results;

        } catch (error) {
            console.error('Error generating local embeddings:', error);
            new Notice(`Error generating local embeddings: ${getErrorMessage(error)}`);
            
            // Return zero vectors as fallback
            const dimensions = this.getDimension();
            return texts.map(() => new Array(dimensions).fill(0));
        }
    }

    /**
     * Generate embeddings for a batch of texts
     * @param texts Array of texts to process
     * @returns Array of embedding vectors
     */
    private async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
        const model = this.modelManager.getModel(this.config.model);
        if (!model || !model.pipeline) {
            throw new Error(`Model ${this.config.model} is not loaded`);
        }

        try {
            // Generate embeddings using the pipeline
            const results = await model.pipeline(texts, {
                pooling: 'mean',
                normalize: true
            });

            // Handle both single text and batch results
            if (texts.length === 1) {
                // Single text result - wrap in array
                return [Array.from(results.data)];
            } else {
                // Batch result - convert to array of arrays
                const embeddings: number[][] = [];
                const dimensions = this.getDimension();
                
                for (let i = 0; i < texts.length; i++) {
                    const start = i * dimensions;
                    const end = start + dimensions;
                    embeddings.push(Array.from(results.data.slice(start, end)));
                }
                
                return embeddings;
            }

        } catch (error) {
            console.error('Error in generateBatchEmbeddings:', error);
            throw new Error(`Failed to generate embeddings: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Create batches from an array of texts
     * @param texts Array of texts
     * @param batchSize Maximum batch size
     * @returns Array of text batches
     */
    private createBatches(texts: string[], batchSize: number): string[][] {
        const batches: string[][] = [];
        for (let i = 0; i < texts.length; i += batchSize) {
            batches.push(texts.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Wait for an available processing slot
     */
    private async waitForSlot(): Promise<void> {
        if (this.activeRequests < this.config.maxConcurrency) {
            return;
        }

        return new Promise<void>((resolve) => {
            this.requestQueue.push(resolve);
        });
    }

    /**
     * Process the request queue
     */
    private processQueue(): void {
        if (this.requestQueue.length > 0 && this.activeRequests < this.config.maxConcurrency) {
            const next = this.requestQueue.shift();
            if (next) {
                next();
            }
        }
    }

    /**
     * Calculate cosine similarity between two vectors
     * @param a First vector
     * @param b Second vector
     * @returns Similarity score between 0 and 1
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
     * Normalize a vector to unit length
     * @param vector Vector to normalize
     * @returns Normalized vector
     */
    normalizeVector(vector: number[]): number[] {
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        
        if (norm === 0) {
            return new Array(vector.length).fill(0);
        }
        
        return vector.map(val => val / norm);
    }

    /**
     * Get the dimension of embeddings produced by this provider
     * @returns Embedding dimension
     */
    getDimension(): number {
        const config = this.modelManager.getModelConfig(this.config.model);
        return config?.dimensions || 384; // Default for all-MiniLM-L6-v2
    }

    /**
     * Get the type/model of the embedding provider
     * @returns Provider type identifier
     */
    getType(): string {
        return 'local';
    }

    /**
     * Get the name of the provider
     */
    getName(): string {
        return 'local';
    }

    /**
     * Get the dimensions of the embedding vectors
     */
    getDimensions(): number {
        return this.getDimension();
    }

    /**
     * Get configuration information
     */
    getConfig(): LocalEmbeddingConfig {
        return { ...this.config };
    }

    /**
     * Update configuration
     * @param newConfig Partial configuration to update
     */
    async updateConfig(newConfig: Partial<LocalEmbeddingConfig>): Promise<void> {
        const oldModel = this.config.model;
        this.config = { ...this.config, ...newConfig };

        // If model changed, load the new model
        if (newConfig.model && newConfig.model !== oldModel) {
            try {
                await this.modelManager.loadModel(this.config.model);
                console.log(`Switched to model: ${this.config.model}`);
            } catch (error) {
                // Revert to old model on error
                this.config.model = oldModel;
                throw new Error(`Failed to switch to model ${newConfig.model}: ${getErrorMessage(error)}`);
            }
        }
    }

    /**
     * Get model status information
     */
    getModelStatus(): {
        currentModel: string;
        isLoaded: boolean;
        isLoading: boolean;
        supportedModels: string[];
        memoryUsage: any;
    } {
        const status = this.modelManager.getModelStatus(this.config.model);
        const memoryUsage = this.modelManager.getMemoryUsage();
        
        return {
            currentModel: this.config.model,
            isLoaded: status.isLoaded,
            isLoading: status.isLoading,
            supportedModels: this.modelManager.getSupportedModels(),
            memoryUsage
        };
    }

    /**
     * Warm up the model by generating a test embedding
     * This can help ensure the model is ready for actual use
     */
    async warmUp(): Promise<void> {
        try {
            console.log('Warming up local embedding model...');
            const testText = 'This is a test sentence for model warmup.';
            await this.generateEmbeddings([testText]);
            console.log('Model warmup completed successfully');
        } catch (error) {
            console.warn('Model warmup failed:', error);
            // Don't throw error, as this is just optimization
        }
    }

    /**
     * Cleanup method to be called when the provider is no longer needed
     */
    async cleanup(): Promise<void> {
        // Wait for active requests to complete
        while (this.activeRequests > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Clear the request queue
        this.requestQueue.length = 0;

        // Note: We don't cleanup the model manager here as it's a singleton
        // that might be used by other instances
        
        this.isInitialized = false;
        console.log('LocalEmbeddingProvider cleanup completed');
    }
}