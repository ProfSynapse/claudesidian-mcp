/**
 * EmbeddingChecker - Handles embedding existence checks
 * Follows Single Responsibility Principle by focusing only on embedding verification
 */

import { EmbeddingService } from '../../../../database/services/EmbeddingService';

/**
 * Service responsible for checking embedding existence
 * Follows SRP by focusing only on embedding verification operations
 */
export class EmbeddingChecker {
    constructor(
        private app: any,
        private embeddingService: EmbeddingService | null
    ) {}

    /**
     * Check if any embeddings exist in the system
     */
    async checkEmbeddingsExist(): Promise<boolean> {
        // First try using embeddingService if available
        if (this.embeddingService) {
            try {
                return await this.embeddingService.hasExistingEmbeddings();
            } catch (error) {
                console.error('Error checking for embeddings via service:', error);
            }
        }
        
        // If the service didn't work or isn't available, try a direct check
        return await this.checkEmbeddingsDirectly();
    }

    /**
     * Check embeddings directly through vector store
     */
    private async checkEmbeddingsDirectly(): Promise<boolean> {
        try {
            const plugin = this.app.plugins.plugins['claudesidian-mcp'];
            if (!plugin || !plugin.vectorStore) {
                return false;
            }

            const collections = await plugin.vectorStore.listCollections();
            
            if (!collections || collections.length === 0) {
                return false;
            }
            
            // Check for specific collections that would contain embeddings
            const embeddingCollections = this.getEmbeddingCollections();
            
            const collectionExists = embeddingCollections.some(name => 
                collections.includes(name)
            );
            
            if (!collectionExists) {
                return false;
            }
            
            // Check if any matching collections have items
            for (const collectionName of embeddingCollections) {
                if (collections.includes(collectionName)) {
                    try {
                        const count = await plugin.vectorStore.count(collectionName);
                        if (count > 0) {
                            return true;
                        }
                    } catch (countError) {
                        console.warn(`Error getting count for ${collectionName}:`, countError);
                    }
                }
            }
        } catch (error) {
            console.error('Error checking for embeddings directly:', error);
        }
        
        return false;
    }

    /**
     * Get list of embedding collection names
     */
    getEmbeddingCollections(): string[] {
        return [
            'file_embeddings', 
            'memory_traces', 
            'sessions',
            'snapshots',
            'workspaces'
        ];
    }

    /**
     * Delete all embeddings
     */
    async deleteAllEmbeddings(): Promise<void> {
        const plugin = this.app.plugins.plugins['claudesidian-mcp'];
        if (!plugin) {
            throw new Error('Claudesidian plugin not found');
        }
        
        const vectorStore = plugin.vectorStore;
        if (!vectorStore) {
            throw new Error('Vector store not found');
        }
        
        const embeddingCollections = this.getEmbeddingCollections();
        
        for (const collectionName of embeddingCollections) {
            if (await vectorStore.hasCollection(collectionName)) {
                await vectorStore.deleteCollection(collectionName);
            }
        }
    }

    /**
     * Get embedding statistics
     */
    async getEmbeddingStats(): Promise<{
        collectionsFound: string[];
        totalItems: number;
        collectionCounts: Record<string, number>;
    }> {
        const stats = {
            collectionsFound: [] as string[],
            totalItems: 0,
            collectionCounts: {} as Record<string, number>
        };

        try {
            const plugin = this.app.plugins.plugins['claudesidian-mcp'];
            if (!plugin || !plugin.vectorStore) {
                return stats;
            }

            const collections = await plugin.vectorStore.listCollections();
            const embeddingCollections = this.getEmbeddingCollections();

            for (const collectionName of embeddingCollections) {
                if (collections.includes(collectionName)) {
                    try {
                        const count = await plugin.vectorStore.count(collectionName);
                        stats.collectionsFound.push(collectionName);
                        stats.collectionCounts[collectionName] = count;
                        stats.totalItems += count;
                    } catch (error) {
                        console.warn(`Error getting count for ${collectionName}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error getting embedding stats:', error);
        }

        return stats;
    }
}