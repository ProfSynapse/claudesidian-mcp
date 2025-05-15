import { EmbeddingRecord } from '../../../../types';
import { IDBStore, IEmbeddingStore } from '../interfaces';
import { STORE_NAMES } from '../constants';

/**
 * Handles basic CRUD operations for embeddings
 */
export class EmbeddingOperations implements IEmbeddingStore {
    private storeName = STORE_NAMES.EMBEDDINGS;
    
    /**
     * Create a new EmbeddingOperations instance
     * @param dbStore The database store to use
     */
    constructor(private dbStore: IDBStore) {}
    
    /**
     * Add or update embeddings in the database
     * @param embeddings Array of embedding records to add
     */
    async addEmbeddings(embeddings: EmbeddingRecord[]): Promise<void> {
        try {
            const tx = this.dbStore.getTransaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            
            for (const embedding of embeddings) {
                await store.put(embedding);
            }
            
            await tx.done;
        } catch (error: any) {
            console.error('Failed to add embeddings:', error);
            throw new Error(`Failed to add embeddings: ${error.message}`);
        }
    }
    
    /**
     * Get an embedding by ID
     * @param id The ID of the embedding to get
     */
    async getEmbedding(id: string): Promise<EmbeddingRecord | undefined> {
        try {
            return await this.dbStore.getTransaction(this.storeName, 'readonly')
                .objectStore()
                .get(id);
        } catch (error: any) {
            console.error(`Failed to get embedding ${id}:`, error);
            throw new Error(`Failed to get embedding: ${error.message}`);
        }
    }
    
    /**
     * Get all embeddings in the database
     */
    async getAllEmbeddings(): Promise<EmbeddingRecord[]> {
        try {
            return await this.dbStore.getTransaction(this.storeName, 'readonly')
                .objectStore()
                .getAll();
        } catch (error: any) {
            console.error('Failed to get all embeddings:', error);
            throw new Error(`Failed to get all embeddings: ${error.message}`);
        }
    }
    
    /**
     * Delete an embedding from the database
     * @param id The ID of the embedding to delete
     */
    async deleteEmbedding(id: string): Promise<void> {
        try {
            await this.dbStore.getTransaction(this.storeName, 'readwrite')
                .objectStore()
                .delete(id);
        } catch (error: any) {
            console.error(`Failed to delete embedding ${id}:`, error);
            throw new Error(`Failed to delete embedding: ${error.message}`);
        }
    }
    
    /**
     * Count total number of embeddings in the database
     */
    async countEmbeddings(): Promise<number> {
        try {
            return await this.dbStore.getTransaction(this.storeName, 'readonly')
                .objectStore()
                .count();
        } catch (error: any) {
            console.error('Failed to count embeddings:', error);
            throw new Error(`Failed to count embeddings: ${error.message}`);
        }
    }
}