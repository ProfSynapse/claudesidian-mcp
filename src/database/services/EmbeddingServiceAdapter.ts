import { App, TFile } from 'obsidian';
import { EmbeddingService } from './EmbeddingService';
import { EmbeddingManager } from './embeddingManager';
import { ProgressTracker } from '../utils/progressTracker';
import { IndexingService } from './indexingService';

/**
 * Adapter class that wraps EmbeddingService to provide IndexingService-compatible interface
 * This solves the type compatibility issues during the transition to ChromaDB
 * 
 * By extending IndexingService directly, we inherit all required methods and properties
 * without having to reimplement them, ensuring type compatibility
 */
export class EmbeddingServiceAdapter extends IndexingService {
    /**
     * Create a new EmbeddingServiceAdapter
     * @param embeddingService The EmbeddingService to adapt
     * @param app Obsidian App instance
     */
    constructor(
        private embeddingService: EmbeddingService,
        app: App
    ) {
        // Create a mock EmbeddingManager that delegates to our EmbeddingService
        const mockEmbeddingManager = {
            areEmbeddingsEnabled: () => embeddingService.areEmbeddingsEnabled(),
            getEmbedding: (text: string) => embeddingService.getEmbedding(text),
            getSettings: () => ({ 
                chunkSize: 1000, 
                chunkOverlap: 0, 
                minContentLength: 50,
                batchSize: 10,
                processingDelay: 1000
            }),
            getProvider: () => ({ 
                getEmbedding: (text: string) => embeddingService.getEmbedding(text) 
            })
        } as unknown as EmbeddingManager;
        
        // Call the parent constructor with our mock EmbeddingManager
        // This initializes all the necessary properties and methods
        super(app, mockEmbeddingManager);
    }
    
    /**
     * Pass through method to EmbeddingService
     * Get an embedding for the given text
     * @param text The text to embed
     * @returns Promise resolving to the embedding vector or null if embeddings are disabled
     */
    async getEmbedding(text: string): Promise<number[] | null> {
        return this.embeddingService.getEmbedding(text);
    }
}