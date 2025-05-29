/**
 * Interface for collection management services
 * Provides a unified API for working with vector store collections
 */

/**
 * Main collection service interface
 */
export interface ICollectionService {
  /**
   * Initialize the collection service
   */
  initialize(): Promise<void>;

  /**
   * Check if a collection exists
   * @param name Collection name
   * @returns True if collection exists
   */
  hasCollection(name: string): Promise<boolean>;

  /**
   * Create a new collection
   * @param name Collection name
   * @param metadata Optional metadata
   * @returns Created collection reference
   */
  createCollection(name: string, metadata?: CollectionMetadata): Promise<Collection>;

  /**
   * Delete a collection
   * @param name Collection name
   */
  deleteCollection(name: string): Promise<void>;

  /**
   * List all collections
   * @returns Array of collection names
   */
  listCollections(): Promise<string[]>;

  /**
   * Get a collection by name
   * @param name Collection name
   * @returns Collection reference
   */
  getCollection(name: string): Promise<Collection>;

  /**
   * Count items in a collection
   * @param name Collection name
   * @returns Number of items
   */
  countItems(name: string): Promise<number>;

  /**
   * Add items to a collection
   * @param name Collection name
   * @param items Items to add
   */
  addItems(name: string, items: CollectionItems): Promise<void>;

  /**
   * Delete items from a collection
   * @param name Collection name
   * @param ids Item IDs to delete
   */
  deleteItems(name: string, ids: string[]): Promise<void>;

  /**
   * Query items from a collection
   * @param name Collection name
   * @param query Query parameters
   * @returns Query results
   */
  queryItems(name: string, query: CollectionQuery): Promise<QueryResult>;

  /**
   * Get collection statistics
   * @param name Collection name
   * @returns Collection statistics
   */
  getCollectionStats(name: string): Promise<CollectionStats>;
}

/**
 * Collection metadata
 */
export interface CollectionMetadata {
  createdAt?: string;
  description?: string;
  type?: string;
  dimension?: number;
  [key: string]: any;
}

/**
 * Items to add to a collection
 */
export interface CollectionItems {
  ids: string[];
  embeddings?: number[][];
  metadatas?: Record<string, any>[];
  documents?: string[];
}

/**
 * Query parameters for searching collections
 */
export interface CollectionQuery {
  queryEmbeddings?: number[][];
  queryTexts?: string[];
  nResults?: number;
  where?: Record<string, any>;
  whereDocument?: Record<string, any>;
  include?: ('embeddings' | 'metadatas' | 'documents' | 'distances')[];
}

/**
 * Query result from collection search
 */
export interface QueryResult {
  ids: string[][];
  distances?: number[][];
  embeddings?: number[][][];
  metadatas?: Record<string, any>[][];
  documents?: string[][];
}

/**
 * Collection reference
 */
export interface Collection {
  name: string;
  metadata?: CollectionMetadata;
}

/**
 * Collection statistics
 */
export interface CollectionStats {
  name: string;
  count: number;
  sizeInBytes?: number;
  lastModified?: string;
  metadata?: CollectionMetadata;
}

/**
 * Collection service events
 */
export interface CollectionServiceEvents {
  'collection-created': { name: string; metadata?: CollectionMetadata };
  'collection-deleted': { name: string };
  'items-added': { collection: string; count: number };
  'items-deleted': { collection: string; count: number };
  'collection-queried': { collection: string; resultCount: number };
}