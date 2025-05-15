import { VectorStore } from '../db/memory-db';
import { EmbeddingRecord, MemoryUsageStats } from '../../../types';
import { App, TFile } from 'obsidian';

/**
 * Utility class for database operations related to memory management
 * Centralizes database interaction logic and cleanup operations
 */
export class DatabaseOperations {
    /**
     * Delete all embeddings for a file
     * 
     * @param db Vector store instance
     * @param filePath Path to the file to delete embeddings for
     * @returns Promise that resolves when the operation completes
     */
    static async deleteEmbeddingsForFile(
        db: VectorStore | null,
        filePath: string
    ): Promise<void> {
        if (!db) {
            return;
        }
        
        try {
            await db.deleteEmbeddingsForFile(filePath);
        } catch (error) {
            console.error(`Error deleting embeddings for ${filePath}:`, error);
            throw error;
        }
    }
    
    /**
     * Clean up orphaned embeddings (files that no longer exist)
     * 
     * @param app Obsidian app instance
     * @param db Vector store instance
     * @param usageStats Usage stats object to update
     * @returns Promise that resolves when the operation completes
     */
    static async cleanOrphanedEmbeddings(
        app: App,
        db: VectorStore | null,
        usageStats: MemoryUsageStats
    ): Promise<void> {
        if (!db) {
            return;
        }
        
        try {
            // Get all files from vault
            const existingFiles = app.vault.getAllLoadedFiles();
            const existingFilePaths = existingFiles
                .filter(file => file instanceof TFile)
                .map(file => file.path);
            
            // Delete orphaned embeddings with a timeout and retry mechanism
            let deletedCount = 0;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
                try {
                    // Set a reasonable timeout to prevent indefinite hanging
                    const timeoutPromise = new Promise<number>((_, reject) => {
                        setTimeout(() => reject(new Error('Operation timed out')), 10000);
                    });
                    
                    // Try to delete orphaned embeddings with a timeout
                    deletedCount = await Promise.race([
                        db.deleteOrphanedEmbeddings(existingFilePaths),
                        timeoutPromise
                    ]);
                    
                    // If we get here, the operation succeeded
                    break;
                } catch (retryError) {
                    retryCount++;
                    console.log(`Retry ${retryCount}/${maxRetries} for cleaning orphaned embeddings`);
                    
                    if (retryCount >= maxRetries) {
                        // Log but don't rethrow on final attempt
                        console.error('Failed to clean orphaned embeddings after retries:', retryError);
                    } else {
                        // Wait before retrying
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
            
            // Update usage stats - even if cleanup failed
            try {
                await DatabaseOperations.updateDatabaseStats(db, usageStats);
            } catch (statsError) {
                console.error('Error updating database stats:', statsError);
                // Don't rethrow - stats update failure shouldn't affect the plugin's operation
            }
            
            console.log(`Cleaned ${deletedCount} orphaned embeddings`);
        } catch (error) {
            console.error('Error cleaning orphaned embeddings:', error);
            // Log but don't throw the error to prevent plugin initialization failure
        }
    }
    
    /**
     * Update database statistics in the usage stats object
     * 
     * @param db Vector store instance
     * @param usageStats Usage stats object to update
     * @returns Promise that resolves when the operation completes
     */
    static async updateDatabaseStats(
        db: VectorStore | null,
        usageStats: MemoryUsageStats
    ): Promise<void> {
        if (!db) {
            return;
        }
        
        try {
            // Ensure database is initialized first (if it's not already)
            try {
                await db.initialize();
            } catch (initError) {
                console.warn('Database initialization warning during stats update:', initError);
                // Continue anyway - the initialize() method is idempotent and returns early if 
                // already initialized, so this is just a safety check
            }
            
            // Update total embeddings
            const totalEmbeddings = await db.countEmbeddings();
            usageStats.totalEmbeddings = totalEmbeddings;
            
            // Estimate database size
            // This is a rough approximation based on typical embedding size
            // In a real implementation, we would use a more accurate size calculation
            usageStats.dbSizeMB = totalEmbeddings * 0.02; // Assuming average 20KB per embedding
        } catch (error) {
            console.error('Error updating database stats:', error);
            throw error;
        }
    }
    
    /**
     * Check if a file's embeddings need to be updated
     * 
     * @param db Vector store instance
     * @param filePath Path to the file to check
     * @param file The file object
     * @returns Promise that resolves to true if the file needs to be re-indexed
     */
    static async shouldReindexFile(
        db: VectorStore | null,
        filePath: string,
        file: TFile
    ): Promise<boolean> {
        if (!db) {
            return false;
        }
        
        try {
            const existingEmbeddings = await db.getEmbeddingsForFile(filePath);
            
            if (existingEmbeddings.length === 0) {
                // No existing embeddings, should index
                return true;
            }
            
            // Check if file has been modified since last indexing
            const lastUpdated = Math.max(...existingEmbeddings.map(e => e.updatedAt));
            return file.stat.mtime > lastUpdated;
        } catch (error) {
            console.error(`Error checking if file should be reindexed: ${filePath}`, error);
            // If there's an error, re-index to be safe
            return true;
        }
    }
    
    /**
     * Add embeddings to the database
     * 
     * @param db Vector store instance
     * @param embeddings Embeddings to add
     * @returns Promise that resolves when the operation completes
     */
    static async addEmbeddings(
        db: VectorStore | null,
        embeddings: EmbeddingRecord[]
    ): Promise<void> {
        if (!db || embeddings.length === 0) {
            return;
        }
        
        try {
            await db.addEmbeddings(embeddings);
        } catch (error) {
            console.error('Error adding embeddings to database:', error);
            throw error;
        }
    }
}