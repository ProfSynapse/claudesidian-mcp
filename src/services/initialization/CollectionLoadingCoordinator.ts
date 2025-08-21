/**
 * CollectionLoadingCoordinator - Coordinates collection loading across all services
 * Follows Single Responsibility Principle - only coordinates collection loading
 * Follows DRY principle - single source of truth for collection loading
 * Implements Boy Scout Rule - cleaner coordination without duplication
 */

import { Plugin } from 'obsidian';
import { 
  ICollectionLoadingCoordinator, 
  CollectionLoadingResult, 
  CollectionMetadata 
} from './interfaces/ICollectionLoadingCoordinator';
import { IInitializationStateManager } from './interfaces/IInitializationStateManager';
// CollectionLoader removed - functionality moved to CollectionManager
import { PersistenceManager } from '../../database/providers/chroma/services/PersistenceManager';

export class CollectionLoadingCoordinator implements ICollectionLoadingCoordinator {
  private static readonly COLLECTIONS_KEY = 'collections_loading';
  private static readonly DEFAULT_TIMEOUT = 60000; // 60 seconds

  private loadedCollections = new Map<string, any>();
  private collectionMetadata = new Map<string, CollectionMetadata>();
  private lastResult: CollectionLoadingResult | null = null;
  // CollectionLoader removed - functionality moved to CollectionManager

  constructor(
    private readonly plugin: Plugin,
    private readonly stateManager: IInitializationStateManager,
    private readonly vectorStore: any // Will be injected as dependency
  ) {
    // CollectionManager functionality is accessed through vectorStore
    // No initialization needed as vectorStore handles collection management
  }
  
  /**
   * Collection loading is now handled through the vector store's collection manager.
   * This eliminates the need for separate collection loader initialization.
   */

  /**
   * Ensures all collections are loaded exactly once
   */
  async ensureCollectionsLoaded(): Promise<CollectionLoadingResult> {
    // Check if we already have a successful cached result
    if (this.lastResult && this.lastResult.success) {
      // Returning cached result
      return this.lastResult;
    }

    const result = await this.stateManager.ensureInitialized(
      CollectionLoadingCoordinator.COLLECTIONS_KEY,
      () => this.performCollectionLoading(),
      CollectionLoadingCoordinator.DEFAULT_TIMEOUT
    );

    if (result.success && result.result) {
      this.lastResult = result.result;
      return result.result;
    }

    // Return error result
    const errorResult: CollectionLoadingResult = {
      success: false,
      collectionsLoaded: 0,
      errors: [{ collectionName: 'general', error: result.error || new Error('Unknown error') }],
      loadTime: 0
    };

    this.lastResult = errorResult;
    return errorResult;
  }

  /**
   * Performs the actual collection loading using the vector store's CollectionManager
   */
  private async performCollectionLoading(): Promise<CollectionLoadingResult> {
    const startTime = Date.now();
    const errors: Array<{ collectionName: string; error: Error }> = [];
    let collectionsLoaded = 0;

    try {
      // Starting collection loading
      
      if (!this.vectorStore) {
        throw new Error('Vector store not available');
      }

      // Use the vector store to list and load collections
      const collectionNames = await this.vectorStore.listCollections();
      
      // Process each collection
      for (const collectionName of collectionNames) {
        try {
          // Check if collection exists and get basic metadata
          const exists = await this.vectorStore.hasCollection(collectionName);
          
          if (exists) {
            // Store minimal collection reference
            this.loadedCollections.set(collectionName, { name: collectionName });
            await this.updateCollectionMetadata(collectionName, { name: collectionName });
            collectionsLoaded++;
            // Collection loaded
          }
        } catch (collectionError) {
          console.warn(`[CollectionLoadingCoordinator] Failed to load collection ${collectionName}:`, collectionError);
          errors.push({ 
            collectionName, 
            error: collectionError as Error 
          });
        }
      }

      const loadTime = Date.now() - startTime;
      // Collection loading completed

      return {
        success: true,
        collectionsLoaded,
        errors,
        loadTime
      };

    } catch (error) {
      const loadTime = Date.now() - startTime;
      console.error('[CollectionLoadingCoordinator] Collection loading failed:', error);
      
      return {
        success: false,
        collectionsLoaded,
        errors: [{ collectionName: 'general', error: error as Error }, ...errors],
        loadTime
      };
    }
  }

  /**
   * Get the actual item count for a collection from the vector store
   */
  private async getVectorStoreItemCount(collectionName: string): Promise<number> {
    try {
      if (this.vectorStore && this.vectorStore.count) {
        return await this.vectorStore.count(collectionName);
      }
      return 0;
    } catch (error) {
      console.warn(`[CollectionLoadingCoordinator] Failed to get vector store count for ${collectionName}:`, error);
      return 0;
    }
  }

  /**
   * Update metadata for a loaded collection
   */
  private async updateCollectionMetadata(collectionName: string, collection: any): Promise<void> {
    try {
      // Get item count directly from the loaded collection
      let itemCount = 0;
      if (collection && typeof collection.count === 'function') {
        itemCount = await collection.count();
      } else if (collection && collection.items && Array.isArray(collection.items)) {
        itemCount = collection.items.length;
      }
      // No fallback to vector store - use the data we have from the loaded collection
      
      const hasIndex = await this.checkCollectionHasIndex(collectionName);
      
      const metadata: CollectionMetadata = {
        name: collectionName,
        itemCount,
        lastModified: Date.now(),
        hasIndex,
        indexType: hasIndex ? 'vector' : undefined
      };

      this.collectionMetadata.set(collectionName, metadata);
    } catch (error) {
      console.warn(`[CollectionLoadingCoordinator] Failed to update metadata for ${collectionName}:`, error);
    }
  }

  /**
   * Check if a collection has an index
   */
  private async checkCollectionHasIndex(collectionName: string): Promise<boolean> {
    try {
      // This would check for vector index existence
      // Implementation depends on the index storage mechanism
      return false; // Default to false for now
    } catch (error) {
      return false;
    }
  }

  /**
   * Get a specific loaded collection
   */
  getLoadedCollection(name: string): any | null {
    return this.loadedCollections.get(name) || null;
  }

  /**
   * Get metadata for all loaded collections
   */
  getCollectionMetadata(): Map<string, CollectionMetadata> {
    return new Map(this.collectionMetadata);
  }

  /**
   * Check if collections are currently loading
   */
  isLoading(): boolean {
    return this.stateManager.isInitializing(CollectionLoadingCoordinator.COLLECTIONS_KEY);
  }

  /**
   * Check if collections have been loaded
   */
  isLoaded(): boolean {
    return this.stateManager.isInitialized(CollectionLoadingCoordinator.COLLECTIONS_KEY);
  }

  /**
   * Get the last loading result
   */
  getLastResult(): CollectionLoadingResult | null {
    return this.lastResult;
  }

  /**
   * Reset loading state (for testing/recovery)
   */
  reset(): void {
    this.loadedCollections.clear();
    this.collectionMetadata.clear();
    this.lastResult = null;
    this.stateManager.reset(CollectionLoadingCoordinator.COLLECTIONS_KEY);
  }

  /**
   * Wait for collections to be loaded
   */
  async waitForCollections(timeout = CollectionLoadingCoordinator.DEFAULT_TIMEOUT): Promise<CollectionLoadingResult> {
    const result = await this.stateManager.waitForInitialization<CollectionLoadingResult>(
      CollectionLoadingCoordinator.COLLECTIONS_KEY,
      timeout
    );

    if (result.success && result.result) {
      return result.result;
    }

    throw new Error(`Failed to load collections: ${result.error?.message || 'Unknown error'}`);
  }

}