import { EmbeddingRecord, MemoryQueryParams, MemoryQueryResult } from '../../../types';

/**
 * Interface for vector storage implementations
 */
export interface VectorStore {
    /**
     * Initialize the database
     */
    initialize(): Promise<void>;
    
    /**
     * Add an embedding record to the database
     * @param record The embedding record to add
     */
    addEmbedding(record: EmbeddingRecord): Promise<void>;
    
    /**
     * Add multiple embedding records to the database
     * @param records The embedding records to add
     */
    addEmbeddings(records: EmbeddingRecord[]): Promise<void>;
    
    /**
     * Update an existing embedding record
     * @param id The ID of the record to update
     * @param updates The partial record with updated fields
     */
    updateEmbedding(id: string, updates: Partial<EmbeddingRecord>): Promise<void>;
    
    /**
     * Delete an embedding record
     * @param id The ID of the record to delete
     */
    deleteEmbedding(id: string): Promise<void>;
    
    /**
     * Delete all embeddings for a file
     * @param filePath The file path to delete embeddings for
     */
    deleteEmbeddingsForFile(filePath: string): Promise<void>;
    
    /**
     * Find similar embeddings using vector similarity search
     * @param embedding The query embedding vector
     * @param params Query parameters including filters and limits
     */
    findSimilar(embedding: number[], params: MemoryQueryParams): Promise<MemoryQueryResult>;
    
    /**
     * Get embedding by ID
     * @param id The ID of the embedding to retrieve
     */
    getEmbedding(id: string): Promise<EmbeddingRecord | null>;
    
    /**
     * Get all embeddings for a file
     * @param filePath The file path to get embeddings for
     */
    getEmbeddingsForFile(filePath: string): Promise<EmbeddingRecord[]>;
    
    /**
     * Get database statistics
     */
    getStats(): Promise<{
        totalEmbeddings: number;
        dbSizeMB: number;
    }>;
    
    /**
     * Get a transaction for operations on the database
     * @param storeName The store name to operate on
     * @param mode The transaction mode (readonly or readwrite)
     */
    getTransaction(storeName: string, mode: 'readonly' | 'readwrite'): IDBTransaction;
    
    /**
     * Get the name of the primary store
     */
    getStoreName(): string;
    
    /**
     * Compact the database to reclaim space
     */
    compact(): Promise<void>;
    
    /**
     * Close the database connection
     */
    close(): Promise<void>;
}

/**
 * Factory function to create a vector store based on the provided type
 * Currently only supports IndexedDB
 * 
 * @param type The type of vector store to create
 * @param options Options for the vector store
 */
export async function createVectorStore(
    type: 'indexeddb',
    options: any
): Promise<VectorStore> {
    switch (type) {
        case 'indexeddb':
            // Dynamically import to prevent loading issues in environments without IndexedDB
            const { IndexedDBVectorStore } = await import('./indexeddb-vector-store');
            return new IndexedDBVectorStore(options);
        default:
            throw new Error(`Unsupported vector store type: ${type}`);
    }
}