import { EmbeddingRecord } from '../../../../types';
import { IDBStore, IFileEmbeddingStore, IEmbeddingStore } from '../interfaces';
import { STORE_NAMES, INDEX_NAMES } from '../constants';

/**
 * Handles file-specific embedding operations
 */
export class FileOperations implements IFileEmbeddingStore {
    private storeName = STORE_NAMES.EMBEDDINGS;
    
    /**
     * Create a new FileOperations instance
     * @param dbStore The database store to use
     * @param embeddingStore The embedding store for basic operations
     */
    constructor(
        private dbStore: IDBStore,
        private embeddingStore: IEmbeddingStore
    ) {}
    
    /**
     * Get all embeddings for a specific file
     * @param filePath The file path to get embeddings for
     */
    async getEmbeddingsForFile(filePath: string): Promise<EmbeddingRecord[]> {
        try {
            const tx = this.dbStore.getTransaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const index = store.index(INDEX_NAMES.BY_FILE);
            
            return await index.getAll(filePath);
        } catch (error: any) {
            console.error(`Failed to get embeddings for file ${filePath}:`, error);
            throw new Error(`Failed to get embeddings for file: ${error.message}`);
        }
    }
    
    /**
     * Delete all embeddings for a specific file
     * @param filePath The file path to delete embeddings for
     */
    async deleteEmbeddingsForFile(filePath: string): Promise<void> {
        try {
            // First try to get all embeddings for this file
            // This is safer than using a cursor
            const embeddings = await this.getEmbeddingsForFile(filePath);
            
            if (embeddings.length === 0) {
                // No embeddings to delete
                return;
            }
            
            // Delete each embedding by ID
            const tx = this.dbStore.getTransaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            
            // Delete each embedding individually
            for (const embedding of embeddings) {
                try {
                    await store.delete(embedding.id);
                } catch (deleteError) {
                    console.error(`Error deleting individual embedding ${embedding.id}:`, deleteError);
                    // Continue with other deletions
                }
            }
            
            // Wait for transaction to complete
            await tx.done;
        } catch (error: any) {
            console.error(`Failed to delete embeddings for file ${filePath}:`, error);
            throw new Error(`Failed to delete embeddings for file: ${error.message}`);
        }
    }
    
    /**
     * Get all file paths that have embeddings
     */
    async getAllFilePaths(): Promise<string[]> {
        try {
            const tx = this.dbStore.getTransaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const index = store.index(INDEX_NAMES.BY_FILE);
            
            // Use getAll instead of cursor for more reliable operation
            const allRecords = await index.getAll();
            const filePaths = new Set<string>();
            
            // Extract unique file paths from all records
            for (const record of allRecords) {
                if (record && record.filePath) {
                    filePaths.add(record.filePath);
                }
            }
            
            // Wait for transaction to complete before returning
            await tx.done;
            return Array.from(filePaths);
        } catch (error: any) {
            console.error('Failed to get all file paths:', error);
            throw new Error(`Failed to get all file paths: ${error.message}`);
        }
    }
    
    /**
     * Check if a file exists in the database
     * @param filePath The file path to check
     */
    async hasFile(filePath: string): Promise<boolean> {
        try {
            const tx = this.dbStore.getTransaction(this.storeName, 'readonly');
            const index = tx.objectStore(this.storeName).index(INDEX_NAMES.BY_FILE);
            const count = await index.count(filePath);
            return count > 0;
        } catch (error: any) {
            console.error(`Failed to check if file ${filePath} exists:`, error);
            throw new Error(`Failed to check if file exists: ${error.message}`);
        }
    }
    
    /**
     * Check if a file needs to be reindexed
     * @param filePath The file path to check
     * @param modifiedTime The file's modified timestamp
     */
    async shouldReindexFile(filePath: string, modifiedTime: number): Promise<boolean> {
        try {
            // Check if we have any embeddings for this file
            const embeddings = await this.getEmbeddingsForFile(filePath);
            
            if (embeddings.length === 0) {
                return true; // No embeddings, need to index
            }
            
            // Check if the file has been modified since last indexed
            // We compare the file's modified time to the newest embedding's updated time
            const newestEmbedding = embeddings.reduce((newest, current) => {
                return current.updatedAt > newest.updatedAt ? current : newest;
            }, embeddings[0]);
            
            return modifiedTime > newestEmbedding.updatedAt;
        } catch (error: any) {
            console.error(`Failed to check if file ${filePath} needs reindexing:`, error);
            throw new Error(`Failed to check if file needs reindexing: ${error.message}`);
        }
    }
    
    /**
     * Delete embeddings that don't match any existing file
     * @param existingFilePaths Array of file paths that exist
     */
    async deleteOrphanedEmbeddings(existingFilePaths: string[]): Promise<number> {
        try {
            // Create a set of existing files for efficient lookup
            const existingSet = new Set(existingFilePaths);
            
            // Get all file paths in the database with improved error handling
            let allFilePaths: string[] = [];
            try {
                allFilePaths = await this.getAllFilePaths();
            } catch (pathError: any) {
                console.error('Error getting file paths during orphaned cleanup:', pathError);
                return 0; // Return 0 deletions if we can't get file paths
            }
            
            // Find orphaned paths (paths in DB but not in the vault)
            const orphanedPaths = allFilePaths.filter(path => !existingSet.has(path));
            
            // Delete each orphaned path
            let deletedCount = 0;
            for (const path of orphanedPaths) {
                try {
                    await this.deleteEmbeddingsForFile(path);
                    deletedCount++;
                } catch (deleteError: any) {
                    console.error(`Error deleting embeddings for orphaned path ${path}:`, deleteError);
                    // Continue with other deletions even if one fails
                }
            }
            
            return deletedCount;
        } catch (error: any) {
            console.error('Failed to delete orphaned embeddings:', error);
            throw new Error(`Failed to delete orphaned embeddings: ${error.message}`);
        }
    }
}