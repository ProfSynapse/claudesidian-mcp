import { EmbeddingRecord, MemoryQueryParams, MemoryQueryResult } from '../../../types';
import { DEFAULT_DB_NAME } from './constants';
import { IndexedDBStore } from './core';
import { EmbeddingOperations, FileOperations, SearchOperations, GraphOperations } from './operations';
import { VectorMath, LinkUtils } from './utils';

/**
 * Main Vector Store class
 * Provides a unified interface for all vector store operations
 * Delegates to specialized modules for specific functionality
 */
export class VectorStore {
    private dbStore: IndexedDBStore;
    private embeddingOps: EmbeddingOperations;
    private fileOps: FileOperations;
    private searchOps: SearchOperations;
    private graphOps: GraphOperations;
    private vectorMath: VectorMath;
    private linkUtils: LinkUtils;
    
    /**
     * Create a new vector store
     * @param dbName The name of the database to use
     */
    constructor(dbName: string = DEFAULT_DB_NAME) {
        this.dbStore = new IndexedDBStore(dbName);
        this.vectorMath = new VectorMath();
        this.linkUtils = new LinkUtils();
        this.embeddingOps = new EmbeddingOperations(this.dbStore);
        this.fileOps = new FileOperations(this.dbStore, this.embeddingOps);
        this.graphOps = new GraphOperations(this.linkUtils);
        this.searchOps = new SearchOperations(this.embeddingOps, this.vectorMath, this.graphOps);
    }
    
    /**
     * Initialize the database connection
     * Creates the database and object stores if they don't exist
     */
    async initialize(): Promise<void> {
        return this.dbStore.initialize();
    }
    
    /**
     * Get the store name
     * @returns The name of the store
     */
    getStoreName(): string {
        return this.dbStore.getStoreName();
    }
    
    /**
     * Get database statistics
     * @returns Database statistics
     */
    async getStats(): Promise<{ totalEmbeddings: number; dbSizeMB: number }> {
        return this.dbStore.getStats();
    }
    
    /**
     * Close the database connection
     */
    async close(): Promise<void> {
        return this.dbStore.close();
    }
    
    /**
     * Add or update embeddings in the database
     * @param embeddings Array of embedding records to add
     */
    async addEmbeddings(embeddings: EmbeddingRecord[]): Promise<void> {
        return this.embeddingOps.addEmbeddings(embeddings);
    }
    
    /**
     * Delete an embedding from the database
     * @param id The ID of the embedding to delete
     */
    async deleteEmbedding(id: string): Promise<void> {
        return this.embeddingOps.deleteEmbedding(id);
    }
    
    /**
     * Delete all embeddings for a specific file
     * @param filePath The file path to delete embeddings for
     */
    async deleteEmbeddingsForFile(filePath: string): Promise<void> {
        return this.fileOps.deleteEmbeddingsForFile(filePath);
    }
    
    /**
     * Get all embeddings for a specific file
     * @param filePath The file path to get embeddings for
     */
    async getEmbeddingsForFile(filePath: string): Promise<EmbeddingRecord[]> {
        return this.fileOps.getEmbeddingsForFile(filePath);
    }
    
    /**
     * Get an embedding by ID
     * @param id The ID of the embedding to get
     */
    async getEmbedding(id: string): Promise<EmbeddingRecord | undefined> {
        return this.embeddingOps.getEmbedding(id);
    }
    
    /**
     * Get all embeddings in the database
     */
    async getAllEmbeddings(): Promise<EmbeddingRecord[]> {
        return this.embeddingOps.getAllEmbeddings();
    }
    
    /**
     * Get all file paths that have embeddings
     */
    async getAllFilePaths(): Promise<string[]> {
        return this.fileOps.getAllFilePaths();
    }
    
    /**
     * Count total number of embeddings in the database
     */
    async countEmbeddings(): Promise<number> {
        return this.embeddingOps.countEmbeddings();
    }
    
    /**
     * Find records similar to the given embedding
     * @param queryEmbedding Query embedding to compare against
     * @param params Query parameters
     */
    async findSimilar(
        queryEmbedding: number[],
        params: MemoryQueryParams
    ): Promise<MemoryQueryResult> {
        return this.searchOps.findSimilar(queryEmbedding, params);
    }
    
    /**
     * Clear all data from the database
     */
    async clearDatabase(): Promise<void> {
        return this.dbStore.clearDatabase();
    }
    
    /**
     * Check if a file exists in the database
     * @param filePath The file path to check
     */
    async hasFile(filePath: string): Promise<boolean> {
        return this.fileOps.hasFile(filePath);
    }
    
    /**
     * Delete embeddings that don't match any existing file
     * @param existingFilePaths Array of file paths that exist
     */
    async deleteOrphanedEmbeddings(existingFilePaths: string[]): Promise<number> {
        return this.fileOps.deleteOrphanedEmbeddings(existingFilePaths);
    }
    
    /**
     * Check if a file needs to be reindexed
     * @param filePath The file path to check
     * @param modifiedTime The file's modified timestamp
     */
    async shouldReindexFile(filePath: string, modifiedTime: number): Promise<boolean> {
        return this.fileOps.shouldReindexFile(filePath, modifiedTime);
    }
}

// Export other components for advanced usage
export * from './interfaces';
export * from './constants';
export * from './core';
export * from './operations';
export * from './utils';