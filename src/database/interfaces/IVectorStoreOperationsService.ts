import { IVectorStore } from './IVectorStore';
import { FileEmbedding } from '../workspace-types';

export interface VectorStoreQuery {
  where?: any;
  include?: string[];
  nResults?: number;
}

export interface VectorStoreQueryResult {
  ids?: string[][];
  metadatas?: any[][];
  documents?: string[][];
  distances?: number[][];
}

export interface IVectorStoreOperationsService {
  /**
   * Query file embeddings by file path
   * @param filePath Path of the file to query
   * @returns Array of existing embeddings for the file
   */
  queryFileEmbeddings(filePath: string): Promise<any[]>;

  /**
   * Store a file embedding in the vector store
   * @param embedding File embedding to store
   */
  storeEmbedding(embedding: FileEmbedding): Promise<void>;

  /**
   * Store multiple embeddings in batch
   * @param embeddings Array of embeddings to store
   */
  storeEmbeddings(embeddings: FileEmbedding[]): Promise<void>;

  /**
   * Delete embeddings by IDs
   * @param ids Array of embedding IDs to delete
   */
  deleteEmbeddings(ids: string[]): Promise<void>;

  /**
   * Purge an entire collection
   * @param collectionName Name of collection to purge
   */
  purgeCollection(collectionName: string): Promise<void>;

  /**
   * Count embeddings in a collection
   * @param collectionName Name of collection to count
   * @returns Number of embeddings in collection
   */
  countEmbeddings(collectionName: string): Promise<number>;

  /**
   * Execute an operation with system operation flag management
   * @param operation Operation to execute
   * @returns Result of the operation
   */
  withSystemOperation<T>(operation: () => Promise<T>): Promise<T>;

  /**
   * Check if collections exist and have embeddings
   * @returns true if embeddings exist in the system
   */
  hasExistingEmbeddings(): Promise<boolean>;

  /**
   * Query vector store with custom parameters
   * @param collectionName Collection to query
   * @param query Query parameters
   * @returns Query result
   */
  query(collectionName: string, query: VectorStoreQuery): Promise<VectorStoreQueryResult>;

  /**
   * Start a system operation
   * @deprecated Use withSystemOperation instead
   */
  startSystemOperation(): void;

  /**
   * End a system operation
   * @deprecated Use withSystemOperation instead
   */
  endSystemOperation(): void;

  /**
   * Get file embeddings
   * @param filePath Path of the file to get embeddings for
   * @returns Array of embeddings
   * @deprecated Use queryFileEmbeddings instead
   */
  getFileEmbeddings(filePath: string): Promise<any[]>;

  /**
   * Add a file embedding
   * @param embedding File embedding to add
   * @deprecated Use storeEmbedding instead
   */
  addFileEmbedding(embedding: FileEmbedding): Promise<void>;

  /**
   * Get collection count
   * @param collectionName Name of collection
   * @returns Number of items in collection
   */
  getCollectionCount(collectionName: string): Promise<number>;

  /**
   * Delete a collection
   * @param collectionName Name of collection to delete
   */
  deleteCollection(collectionName: string): Promise<void>;

  /**
   * Create a collection
   * @param collectionName Name of collection to create
   */
  createCollection(collectionName: string): Promise<void>;
}
