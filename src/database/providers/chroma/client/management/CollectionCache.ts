/**
 * CollectionCache - Handles collection caching and lifecycle
 * Follows Single Responsibility Principle by focusing only on cache operations
 */

import { StrictPersistentCollection } from '../../collection/StrictPersistentCollection';

export interface CacheResult {
  success: boolean;
  error?: string;
}

export interface CacheStats {
  totalCollections: number;
  loadedCollections: number;
  cacheHitRate: number;
  totalCacheHits: number;
  totalCacheRequests: number;
}

/**
 * Service responsible for collection caching and lifecycle management
 * Follows SRP by focusing only on cache operations
 */
export class CollectionCache {
  private collections: Map<string, StrictPersistentCollection> = new Map();
  private collectionsLoaded = false;
  private cacheStats = {
    hits: 0,
    requests: 0
  };

  /**
   * Set collections loaded state
   */
  setCollectionsLoaded(loaded: boolean): void {
    this.collectionsLoaded = loaded;
  }

  /**
   * Check if collections are loaded
   */
  isCollectionsLoaded(): boolean {
    return this.collectionsLoaded;
  }

  /**
   * Wait for collections to be loaded
   */
  async ensureCollectionsLoaded(): Promise<CacheResult> {
    if (this.collectionsLoaded) {
      return { success: true };
    }

    let attempts = 0;
    const maxAttempts = 10;
    const attemptDelay = 100;

    while (!this.collectionsLoaded && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, attemptDelay));
      attempts++;
    }

    if (!this.collectionsLoaded) {
      return {
        success: false,
        error: 'Collections failed to load in time'
      };
    }

    return { success: true };
  }

  /**
   * Get collection from cache
   */
  getCollection(name: string): StrictPersistentCollection | undefined {
    this.cacheStats.requests++;
    
    const collection = this.collections.get(name);
    if (collection) {
      this.cacheStats.hits++;
    }
    
    return collection;
  }

  /**
   * Set collection in cache
   */
  setCollection(name: string, collection: StrictPersistentCollection): void {
    this.collections.set(name, collection);
  }

  /**
   * Remove collection from cache
   */
  removeCollection(name: string): boolean {
    return this.collections.delete(name);
  }

  /**
   * Check if collection exists in cache
   */
  hasCollection(name: string): boolean {
    return this.collections.has(name);
  }

  /**
   * Get all collections from cache
   */
  getAllCollections(): Map<string, StrictPersistentCollection> {
    return new Map(this.collections);
  }

  /**
   * Get collection names from cache
   */
  getCollectionNames(): string[] {
    return Array.from(this.collections.keys());
  }

  /**
   * Get collection count
   */
  getCollectionCount(): number {
    return this.collections.size;
  }

  /**
   * Clear all collections from cache
   */
  clearCache(): void {
    // Clean up individual collections
    for (const collection of this.collections.values()) {
      try {
        collection.cleanup();
      } catch (error) {
        console.error('Failed to cleanup collection during cache clear:', error);
      }
    }

    // Clear the cache
    this.collections.clear();
    this.collectionsLoaded = false;
  }

  /**
   * Load collections into cache
   */
  loadCollections(collections: Map<string, StrictPersistentCollection>): void {
    this.collections = new Map(collections);
    this.collectionsLoaded = true;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    const cacheHitRate = this.cacheStats.requests > 0 
      ? (this.cacheStats.hits / this.cacheStats.requests) * 100 
      : 0;

    return {
      totalCollections: this.collections.size,
      loadedCollections: this.collectionsLoaded ? this.collections.size : 0,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      totalCacheHits: this.cacheStats.hits,
      totalCacheRequests: this.cacheStats.requests
    };
  }

  /**
   * Reset cache statistics
   */
  resetCacheStats(): void {
    this.cacheStats = {
      hits: 0,
      requests: 0
    };
  }

  /**
   * Get cache status
   */
  getCacheStatus(): {
    isLoaded: boolean;
    collectionCount: number;
    collectionNames: string[];
    cacheStats: CacheStats;
  } {
    return {
      isLoaded: this.collectionsLoaded,
      collectionCount: this.collections.size,
      collectionNames: Array.from(this.collections.keys()),
      cacheStats: this.getCacheStats()
    };
  }

  /**
   * Validate cache integrity
   */
  async validateCacheIntegrity(): Promise<{
    valid: boolean;
    issues?: string[];
  }> {
    const issues: string[] = [];

    // Check if collections loaded flag matches actual state
    if (this.collectionsLoaded && this.collections.size === 0) {
      issues.push('Collections marked as loaded but cache is empty');
    }

    // Check individual collections
    for (const [name, collection] of this.collections) {
      try {
        // Try to get basic info from collection
        await collection.count();
      } catch (error) {
        issues.push(`Collection ${name} appears to be corrupted: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues: issues.length > 0 ? issues : undefined
    };
  }

  /**
   * Force save all cached collections
   */
  async saveAllCachedCollections(): Promise<{
    success: boolean;
    savedCollections: string[];
    errors: string[];
  }> {
    const savedCollections: string[] = [];
    const errors: string[] = [];

    for (const [name, collection] of this.collections) {
      try {
        await collection.forceSave();
        savedCollections.push(name);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to save collection ${name}: ${errorMsg}`);
      }
    }

    return {
      success: errors.length === 0,
      savedCollections,
      errors
    };
  }

  /**
   * Preload collections (useful for warming up cache)
   */
  async preloadCollections(collectionNames: string[]): Promise<{
    success: boolean;
    preloadedCollections: string[];
    errors: string[];
  }> {
    const preloadedCollections: string[] = [];
    const errors: string[] = [];

    for (const name of collectionNames) {
      try {
        const collection = this.collections.get(name);
        if (collection) {
          // Trigger some basic operations to warm up the collection
          await collection.count();
          await collection.metadata();
          preloadedCollections.push(name);
        } else {
          errors.push(`Collection ${name} not found in cache`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to preload collection ${name}: ${errorMsg}`);
      }
    }

    return {
      success: errors.length === 0,
      preloadedCollections,
      errors
    };
  }
}