import { Plugin } from 'obsidian';
import { ToEmbedCollection, ToEmbedEntry } from '../database/collections/ToEmbedCollection';
import { EmbeddingService } from '../database/services/EmbeddingService';

/**
 * Simple service to manage the to_embed collection
 */
export class ToEmbedService {
    private toEmbedCollection!: ToEmbedCollection;
    private isProcessing: boolean = false;

    constructor(
        private plugin: Plugin,
        private vectorStore: any,
        private embeddingService: EmbeddingService
    ) {
        this.toEmbedCollection = new ToEmbedCollection(vectorStore);
    }

    /**
     * Add a file to the embedding queue
     */
    async queueFile(filePath: string, operation: 'create' | 'modify' | 'delete', workspaceId?: string): Promise<void> {
        console.log(`[ToEmbedService] Queuing file: ${filePath} (${operation})`);
        await this.toEmbedCollection.addFile(filePath, operation, workspaceId);
    }

    /**
     * Process all queued files for embedding
     */
    async processQueue(): Promise<void> {
        if (this.isProcessing) {
            console.log('[ToEmbedService] Already processing queue, skipping');
            return;
        }

        this.isProcessing = true;

        try {
            const filesToEmbed = await this.toEmbedCollection.getFilesToEmbed();
            
            if (filesToEmbed.length === 0) {
                console.log('[ToEmbedService] No files to embed');
                return;
            }

            console.log(`[ToEmbedService] Processing ${filesToEmbed.length} queued files`);

            // Group by operation
            const createModifyFiles = filesToEmbed.filter(f => f.operation === 'create' || f.operation === 'modify');
            const deleteFiles = filesToEmbed.filter(f => f.operation === 'delete');

            // Process deletes first
            for (const entry of deleteFiles) {
                try {
                    // Delete embeddings for this file
                    await this.deleteFileEmbeddings(entry.filePath);
                    await this.toEmbedCollection.removeFile(entry.id);
                    console.log(`[ToEmbedService] Deleted embeddings for: ${entry.filePath}`);
                } catch (error) {
                    console.error(`[ToEmbedService] Error deleting embeddings for ${entry.filePath}:`, error);
                }
            }

            // Process creates/modifies
            if (createModifyFiles.length > 0) {
                const filePaths = createModifyFiles.map(f => f.filePath);
                
                try {
                    await this.embeddingService.incrementalIndexFiles(filePaths);
                    
                    // Remove successfully processed files from queue
                    for (const entry of createModifyFiles) {
                        await this.toEmbedCollection.removeFile(entry.id);
                    }
                    
                    console.log(`[ToEmbedService] Successfully processed ${createModifyFiles.length} files`);
                } catch (error) {
                    console.error('[ToEmbedService] Error processing files:', error);
                }
            }

        } catch (error) {
            console.error('[ToEmbedService] Error processing queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Get queue status
     */
    async getQueueStatus(): Promise<{ count: number; files: ToEmbedEntry[] }> {
        const files = await this.toEmbedCollection.getFilesToEmbed();
        return {
            count: files.length,
            files
        };
    }

    /**
     * Clear the queue
     */
    async clearQueue(): Promise<void> {
        await this.toEmbedCollection.clear();
        console.log('[ToEmbedService] Queue cleared');
    }

    /**
     * Delete embeddings for a file
     */
    private async deleteFileEmbeddings(filePath: string): Promise<void> {
        try {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const queryResult = await this.vectorStore.query('file_embeddings', {
                where: { filePath: { $eq: normalizedPath } },
                nResults: 1000,
                include: ['ids']
            });

            if (queryResult.ids && queryResult.ids[0] && queryResult.ids[0].length > 0) {
                await this.vectorStore.deleteItems('file_embeddings', queryResult.ids[0]);
            }
        } catch (error) {
            console.warn(`[ToEmbedService] Error deleting embeddings for ${filePath}:`, error);
        }
    }
}