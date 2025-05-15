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
            // Get database stats before cleaning
            const statsBefore = await db.getStats();
            
            if (!db) {
                return;
            }
            
            // Get all embeddings from the database
            const transaction = db.getTransaction(db.getStoreName(), 'readonly');
            const store = transaction.objectStore(db.getStoreName());
            const request = store.getAll();
            
            // Process all embeddings when the request completes
            return new Promise<void>((resolve, reject) => {
                request.onsuccess = async () => {
                    try {
                        const allEmbeddings = request.result as EmbeddingRecord[];
                        
                        // Group by file path
                        const filePathMap = new Map<string, EmbeddingRecord[]>();
                        allEmbeddings.forEach((record) => {
                            const filePath = record.filePath;
                            if (!filePathMap.has(filePath)) {
                                filePathMap.set(filePath, []);
                            }
                            filePathMap.get(filePath)?.push(record);
                        });
                        
                        // Check each file
                        for (const [filePath, _] of filePathMap) {
                            const file = app.vault.getAbstractFileByPath(filePath);
                            if (!file) {
                                // File doesn't exist anymore, delete embeddings
                                await db.deleteEmbeddingsForFile(filePath);
                            }
                        }
                        
                        // Get database stats after cleaning - check if db is still available
                        if (db) {
                            const statsAfter = await db.getStats();
                            
                            // Update usage stats
                            usageStats.totalEmbeddings = statsAfter.totalEmbeddings;
                            usageStats.dbSizeMB = statsAfter.dbSizeMB;
                        }
                        
                        console.log(`Cleaned orphaned embeddings`);
                        resolve();
                    } catch (error) {
                        console.error('Error cleaning orphaned embeddings:', error);
                        reject(error);
                    }
                };
                
                request.onerror = (event) => {
                    console.error('Error getting all embeddings:', event);
                    reject(new Error('Failed to get all embeddings'));
                };
            });
            
        } catch (error) {
            console.error('Error cleaning orphaned embeddings:', error);
            throw error;
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
            const stats = await db.getStats();
            usageStats.totalEmbeddings = stats.totalEmbeddings;
            usageStats.dbSizeMB = stats.dbSizeMB;
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