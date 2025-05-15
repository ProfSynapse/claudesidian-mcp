import { EmbeddingRecord, MemoryQueryParams, MemoryQueryResult } from '../../../types';

/**
 * Database statistics interface for reporting
 */
export interface DatabaseStats {
    totalEmbeddings: number;
    dbSizeMB: number;
}

/**
 * Interface for our database store structure
 */
export interface MemoryDB {
    embeddings: { 
        key: string;
        value: EmbeddingRecord;
        indexes: {
            'by-file': string;
            'by-timestamp': number;
        };
    };
}

/**
 * Core database interface for IndexedDB operations
 */
export interface IDBStore {
    initialize(): Promise<void>;
    close(): Promise<void>;
    getTransaction(storeName: string, mode: 'readonly' | 'readwrite'): any;
    getStats(): Promise<DatabaseStats>;
    clearDatabase(): Promise<void>;
}

/**
 * Interface for basic IndexedDB operations
 */
export interface IDBPDatabase<T> {
    transaction(store: string, mode: 'readonly' | 'readwrite'): any;
    get(store: string, key: string): Promise<any>;
    delete(store: string, key: string): Promise<void>;
    count(store: string): Promise<number>;
    getAll(store: string): Promise<any[]>;
    close(): void;
}

/**
 * Interface for embedding CRUD operations
 */
export interface IEmbeddingStore {
    addEmbeddings(embeddings: EmbeddingRecord[]): Promise<void>;
    getEmbedding(id: string): Promise<EmbeddingRecord | undefined>;
    getAllEmbeddings(): Promise<EmbeddingRecord[]>;
    deleteEmbedding(id: string): Promise<void>;
    countEmbeddings(): Promise<number>;
}

/**
 * Interface for file-specific embedding operations
 */
export interface IFileEmbeddingStore {
    getEmbeddingsForFile(filePath: string): Promise<EmbeddingRecord[]>;
    deleteEmbeddingsForFile(filePath: string): Promise<void>;
    getAllFilePaths(): Promise<string[]>;
    hasFile(filePath: string): Promise<boolean>;
    shouldReindexFile(filePath: string, modifiedTime: number): Promise<boolean>;
    deleteOrphanedEmbeddings(existingFilePaths: string[]): Promise<number>;
}

/**
 * Interface for vector search operations
 */
export interface ISearchOperations {
    findSimilar(
        queryEmbedding: number[], 
        params: MemoryQueryParams
    ): Promise<MemoryQueryResult>;
}

/**
 * Interface for graph-based relevance operations
 */
export interface IGraphOperations {
    applyGraphBoost(
        records: Array<{ record: EmbeddingRecord; similarity: number }>, 
        graphOptions: NonNullable<MemoryQueryParams['graphOptions']>
    ): Array<{ record: EmbeddingRecord; similarity: number }>;
    
    applySeedBoost(
        records: Array<{ record: EmbeddingRecord; similarity: number }>, 
        seedNotes: string[]
    ): Array<{ record: EmbeddingRecord; similarity: number }>;
}

/**
 * Interface for link text utilities
 */
export interface ILinkUtils {
    normalizeLinkText(linkText: string): string;
    addToLinkMap(linkMap: Map<string, string[]>, text: string, filePath: string): void;
    getNormalizedVariants(text: string): string[];
    findFuzzyMatches(linkMap: Map<string, string[]>, text: string): string[];
}

/**
 * Interface for vector math operations
 */
export interface IVectorMath {
    cosineSimilarity(a: number[], b: number[]): number;
}