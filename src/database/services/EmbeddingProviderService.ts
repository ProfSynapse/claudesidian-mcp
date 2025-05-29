import { IEmbeddingProviderService } from '../interfaces/IEmbeddingProviderService';
import { IEmbeddingProvider, ITokenTrackingProvider } from '../interfaces/IEmbeddingProvider';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Service for managing embedding providers
 * Handles provider lifecycle, embedding generation, and settings management
 */
export class EmbeddingProviderService implements IEmbeddingProviderService {
    private embeddingProvider: IEmbeddingProvider | null = null;
    private settings: MemorySettings;
    private initialized: boolean = false;

    constructor(settings?: MemorySettings) {
        this.settings = settings || { ...DEFAULT_MEMORY_SETTINGS };
    }

    /**
     * Initialize the service with settings
     */
    async initialize(settings: MemorySettings): Promise<void> {
        this.settings = settings;
        await this.initializeProvider();
        this.initialized = true;
    }

    /**
     * Initialize the embedding provider
     */
    private async initializeProvider(): Promise<void> {
        if (this.settings.embeddingsEnabled && this.settings.openaiApiKey) {
            try {
                // Create provider with OpenAI configuration
                this.embeddingProvider = VectorStoreFactory.createEmbeddingProvider(
                    this.settings.openaiApiKey, 
                    this.settings.embeddingModel
                );
                await this.embeddingProvider.initialize();
                
                console.log("OpenAI embedding provider initialized successfully");
            } catch (providerError) {
                console.error("Error initializing OpenAI provider:", providerError);
                this.settings.embeddingsEnabled = false;
                this.embeddingProvider = null;
                throw new Error(`Failed to initialize embedding provider: ${getErrorMessage(providerError)}`);
            }
        } else {
            // Use default provider in disabled mode
            this.embeddingProvider = VectorStoreFactory.createEmbeddingProvider();
            await this.embeddingProvider.initialize();
            
            console.log("Embeddings are disabled - using default provider");
        }
    }

    /**
     * Update provider settings and reinitialize if needed
     */
    async updateSettings(settings: MemorySettings): Promise<void> {
        this.settings = settings;
        
        // Only validate API key if embeddings are being enabled
        if (settings.embeddingsEnabled && (!settings.openaiApiKey || settings.openaiApiKey.trim() === "")) {
            console.warn("OpenAI API key is required but not provided. Provider will not be initialized.");
            return;
        }
        
        // Reinitialize provider only if we have valid settings
        if (settings.embeddingsEnabled && settings.openaiApiKey && settings.openaiApiKey.trim() !== "") {
            await this.initializeProvider();
        }
    }

    /**
     * Get the current embedding provider
     */
    getProvider(): IEmbeddingProvider | null {
        return this.embeddingProvider;
    }

    /**
     * Check if embeddings are enabled and provider is available
     */
    areEmbeddingsEnabled(): boolean {
        return this.settings.embeddingsEnabled && this.embeddingProvider !== null;
    }

    /**
     * Generate embeddings for a single text
     */
    async getEmbedding(text: string): Promise<number[] | null> {
        if (!this.initialized) {
            throw new Error('EmbeddingProviderService not initialized');
        }
        
        if (!this.settings.embeddingsEnabled || !this.embeddingProvider) {
            return null;
        }
        
        try {
            const embeddings = await this.embeddingProvider.generateEmbeddings([text]);
            return embeddings[0];
        } catch (error) {
            console.error('Error generating embedding:', error);
            return null;
        }
    }

    /**
     * Generate embeddings for multiple texts
     */
    async getEmbeddings(texts: string[]): Promise<number[][] | null> {
        if (!this.initialized) {
            throw new Error('EmbeddingProviderService not initialized');
        }
        
        if (!this.settings.embeddingsEnabled || !this.embeddingProvider) {
            return null;
        }
        
        try {
            return await this.embeddingProvider.generateEmbeddings(texts);
        } catch (error) {
            console.error('Error generating embeddings:', error);
            return null;
        }
    }

    /**
     * Calculate similarity between two embeddings
     */
    calculateSimilarity(embedding1: number[], embedding2: number[]): number {
        if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
            return 0;
        }
        
        // Calculate cosine similarity
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < embedding1.length; i++) {
            dotProduct += embedding1[i] * embedding2[i];
            norm1 += embedding1[i] * embedding1[i];
            norm2 += embedding2[i] * embedding2[i];
        }
        
        if (norm1 === 0 || norm2 === 0) {
            return 0;
        }
        
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    /**
     * Get the provider type/model identifier
     */
    getProviderType(): string {
        if (!this.embeddingProvider) {
            return 'none';
        }
        
        return this.embeddingProvider.getType();
    }

    /**
     * Check if the provider supports token tracking
     */
    supportsTokenTracking(): boolean {
        if (!this.embeddingProvider) {
            return false;
        }
        
        return this.isTokenTrackingProvider(this.embeddingProvider);
    }

    /**
     * Check if provider implements token tracking interface
     */
    private isTokenTrackingProvider(provider: IEmbeddingProvider): provider is ITokenTrackingProvider {
        return (
            provider &&
            typeof (provider as ITokenTrackingProvider).getTokensThisMonth === 'function' &&
            typeof (provider as ITokenTrackingProvider).updateUsageStats === 'function' &&
            typeof (provider as ITokenTrackingProvider).getTotalCost === 'function' &&
            typeof (provider as ITokenTrackingProvider).resetUsageStats === 'function'
        );
    }

    /**
     * Update token usage statistics (if provider supports it)
     */
    async updateUsageStats(tokenCount: number, model?: string): Promise<void> {
        if (!this.embeddingProvider || !this.supportsTokenTracking()) {
            console.warn('Provider does not support token tracking');
            return;
        }
        
        const trackingProvider = this.embeddingProvider as ITokenTrackingProvider;
        await trackingProvider.updateUsageStats(tokenCount, model);
    }

    /**
     * Reset token usage statistics (if provider supports it)
     */
    async resetUsageStats(): Promise<void> {
        if (!this.embeddingProvider || !this.supportsTokenTracking()) {
            console.warn('Provider does not support token tracking');
            return;
        }
        
        const trackingProvider = this.embeddingProvider as ITokenTrackingProvider;
        await trackingProvider.resetUsageStats();
    }

    /**
     * Get current token usage statistics (if provider supports it)
     */
    getTokenUsage(): any | null {
        if (!this.embeddingProvider || !this.supportsTokenTracking()) {
            return null;
        }
        
        const trackingProvider = this.embeddingProvider as ITokenTrackingProvider;
        return {
            tokensThisMonth: trackingProvider.getTokensThisMonth(),
            totalCost: trackingProvider.getTotalCost(),
            modelUsage: trackingProvider.getModelUsage()
        };
    }
}
