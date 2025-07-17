/**
 * Interface for coordinating collection loading across the plugin
 * Follows Single Responsibility Principle - only coordinates collection loading
 * Follows Dependency Inversion Principle - depends on abstractions not concretions
 */

export interface CollectionLoadingResult {
  success: boolean;
  collectionsLoaded: number;
  errors: Array<{ collectionName: string; error: Error }>;
  loadTime: number;
}

export interface CollectionMetadata {
  name: string;
  itemCount: number;
  lastModified: number;
  hasIndex: boolean;
  indexType?: string;
}

export interface ICollectionLoadingCoordinator {
  /**
   * Ensures all collections are loaded exactly once
   * Subsequent calls return cached results
   */
  ensureCollectionsLoaded(): Promise<CollectionLoadingResult>;

  /**
   * Get a specific loaded collection
   */
  getLoadedCollection(name: string): any | null;

  /**
   * Get metadata for all loaded collections
   */
  getCollectionMetadata(): Map<string, CollectionMetadata>;

  /**
   * Check if collections are currently loading
   */
  isLoading(): boolean;

  /**
   * Check if collections have been loaded
   */
  isLoaded(): boolean;

  /**
   * Get the last loading result
   */
  getLastResult(): CollectionLoadingResult | null;

  /**
   * Reset loading state (for testing/recovery)
   */
  reset(): void;

  /**
   * Wait for collections to be loaded
   */
  waitForCollections(timeout?: number): Promise<CollectionLoadingResult>;
}