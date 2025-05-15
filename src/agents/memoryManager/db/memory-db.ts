import { EmbeddingRecord, MemoryQueryParams, MemoryQueryResult } from '../../../types';

/**
 * Interface for a vector store implementation
 * This is an abstraction that could have multiple implementations
 * (e.g. in-memory, IndexedDB, server-based, etc.)
 */
export interface VectorStore {
    initialize(): Promise<void>;
    close(): Promise<void>;
    addEmbeddings(embeddings: EmbeddingRecord[]): Promise<void>;
    deleteEmbedding(id: string): Promise<void>;
    deleteEmbeddingsForFile(filePath: string): Promise<void>;
    getEmbeddingsForFile(filePath: string): Promise<EmbeddingRecord[]>;
    getEmbedding(id: string): Promise<EmbeddingRecord | undefined>;
    getAllEmbeddings(): Promise<EmbeddingRecord[]>;
    getAllFilePaths(): Promise<string[]>;
    countEmbeddings(): Promise<number>;
    findSimilar(queryEmbedding: number[], params: MemoryQueryParams): Promise<MemoryQueryResult>;
    clearDatabase(): Promise<void>;
    hasFile(filePath: string): Promise<boolean>;
    deleteOrphanedEmbeddings(existingFilePaths: string[]): Promise<number>;
    shouldReindexFile(filePath: string, modifiedTime: number): Promise<boolean>;
}

/**
 * Factory function to create a vector store
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
            const { VectorStore } = await import('./indexeddb-vector-store');
            const store = new VectorStore(options);
            // Initialize the database before returning
            await store.initialize();
            return store;
        default:
            throw new Error(`Unsupported vector store type: ${type}`);
    }
}