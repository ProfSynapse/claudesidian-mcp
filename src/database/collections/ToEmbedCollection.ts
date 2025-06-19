/**
 * Collection for tracking files that need to be embedded
 */
export interface ToEmbedEntry {
    id: string;
    filePath: string;
    operation: 'create' | 'modify' | 'delete';
    timestamp: number;
    workspaceId?: string;
}

export class ToEmbedCollection {
    constructor(private vectorStore: any) {}

    /**
     * Add a file to the to_embed queue
     */
    async addFile(filePath: string, operation: 'create' | 'modify' | 'delete', workspaceId?: string): Promise<void> {
        const entry: ToEmbedEntry = {
            id: `${filePath}_${Date.now()}`,
            filePath,
            operation,
            timestamp: Date.now(),
            workspaceId: workspaceId || 'default'
        };

        await this.vectorStore.addItems('to_embed', {
            ids: [entry.id],
            embeddings: [[0]], // Dummy embedding - we don't need actual embeddings for this
            metadatas: [entry],
            documents: [filePath]
        });
    }

    /**
     * Get all files that need embedding
     */
    async getFilesToEmbed(): Promise<ToEmbedEntry[]> {
        try {
            const result = await this.vectorStore.query('to_embed', {
                nResults: 1000, // Get all
                include: ['metadatas']
            });

            if (!result.metadatas || !result.metadatas[0]) {
                return [];
            }

            return result.metadatas[0] as ToEmbedEntry[];
        } catch (error) {
            console.warn('[ToEmbedCollection] Error getting files to embed:', error);
            return [];
        }
    }

    /**
     * Remove a file from the to_embed queue after processing
     */
    async removeFile(entryId: string): Promise<void> {
        try {
            await this.vectorStore.deleteItems('to_embed', [entryId]);
        } catch (error) {
            console.warn('[ToEmbedCollection] Error removing file from queue:', error);
        }
    }

    /**
     * Clear all entries (for cleanup)
     */
    async clear(): Promise<void> {
        try {
            // Get all entries
            const entries = await this.getFilesToEmbed();
            if (entries.length > 0) {
                const ids = entries.map((_, index) => `item_${index}`);
                await this.vectorStore.deleteItems('to_embed', ids);
            }
        } catch (error) {
            console.warn('[ToEmbedCollection] Error clearing to_embed collection:', error);
        }
    }

    /**
     * Get count of files to embed
     */
    async getCount(): Promise<number> {
        try {
            return await this.vectorStore.count('to_embed');
        } catch (error) {
            console.warn('[ToEmbedCollection] Error getting count:', error);
            return 0;
        }
    }
}