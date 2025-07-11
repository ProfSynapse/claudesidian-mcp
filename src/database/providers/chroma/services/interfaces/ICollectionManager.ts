import { Collection } from '../../PersistentChromaClient';

/**
 * Interface for collection management operations
 * Handles collection lifecycle, caching, and validation
 */
export interface ICollectionManager {
  /**
   * Get or create a collection, with intelligent caching
   * @param collectionName Name of the collection
   * @returns Collection instance
   */
  getOrCreateCollection(collectionName: string): Promise<Collection>;

  /**
   * Refresh the list of collections from storage
   */
  refreshCollections(): Promise<void>;

  /**
   * Check if a collection exists
   * @param collectionName Name of the collection
   * @returns true if collection exists, false otherwise
   */
  hasCollection(collectionName: string): Promise<boolean>;

  /**
   * List all available collections
   * @returns Array of collection names
   */
  listCollections(): Promise<string[]>;

  /**
   * Create a new collection
   * @param collectionName Name of the collection
   * @param metadata Optional collection metadata
   */
  createCollection(collectionName: string, metadata?: Record<string, any>): Promise<void>;

  /**
   * Delete a collection
   * @param collectionName Name of the collection to delete
   */
  deleteCollection(collectionName: string): Promise<void>;

  /**
   * Validate a collection by performing basic operations
   * @param collectionName Name of the collection to validate
   * @returns true if collection is valid, false otherwise
   */
  validateCollection(collectionName: string): Promise<boolean>;

  /**
   * Clear the collection cache
   */
  clearCache(): void;

  /**
   * Get cache statistics
   * @returns Cache statistics object
   */
  getCacheStats(): { size: number; hitRate: number };

  /**
   * Batch validate multiple collections
   * @param collectionNames Array of collection names to validate
   * @returns Object mapping collection names to validation results
   */
  batchValidateCollections(collectionNames: string[]): Promise<Record<string, boolean>>;
}