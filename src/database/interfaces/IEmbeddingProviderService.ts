/**
 * Interface for embedding provider management service
 * Handles provider lifecycle, embedding generation, and settings management
 */
export interface IEmbeddingProviderService {
    /**
     * Initialize the service with settings
     * @param settings Memory settings
     */
    initialize(settings: any): Promise<void>;

    /**
     * Update provider settings and reinitialize if needed
     * @param settings Updated memory settings
     */
    updateSettings(settings: any): Promise<void>;

    /**
     * Get the current embedding provider
     * @returns Current provider instance or null
     */
    getProvider(): any | null;

    /**
     * Check if embeddings are enabled and provider is available
     * @returns True if embeddings are enabled
     */
    areEmbeddingsEnabled(): boolean;

    /**
     * Generate embeddings for a single text
     * @param text Text to generate embedding for
     * @returns Promise resolving to embedding vector or null
     */
    getEmbedding(text: string): Promise<number[] | null>;

    /**
     * Generate embeddings for multiple texts
     * @param texts Array of texts to generate embeddings for
     * @returns Promise resolving to array of embedding vectors or null
     */
    getEmbeddings(texts: string[]): Promise<number[][] | null>;

    /**
     * Calculate similarity between two embeddings
     * @param embedding1 First embedding vector
     * @param embedding2 Second embedding vector
     * @returns Similarity score between 0 and 1
     */
    calculateSimilarity(embedding1: number[], embedding2: number[]): number;

    /**
     * Get the provider type/model identifier
     * @returns Provider type string
     */
    getProviderType(): string;

    /**
     * Check if the provider supports token tracking
     * @returns True if provider implements ITokenTrackingProvider
     */
    supportsTokenTracking(): boolean;

    /**
     * Update token usage statistics (if provider supports it)
     * @param tokenCount Number of tokens used
     * @param model Optional model name
     */
    updateUsageStats(tokenCount: number, model?: string): Promise<void>;

    /**
     * Reset token usage statistics (if provider supports it)
     */
    resetUsageStats(): Promise<void>;

    /**
     * Get current token usage statistics (if provider supports it)
     * @returns Token usage information or null
     */
    getTokenUsage(): any | null;
}
