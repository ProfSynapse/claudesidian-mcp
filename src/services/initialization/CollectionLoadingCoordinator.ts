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
import { CollectionLoader } from '../../database/providers/chroma/client/lifecycle/CollectionLoader';
import { PersistenceManager, FileSystemInterface } from '../../database/providers/chroma/services/PersistenceManager';

export class CollectionLoadingCoordinator implements ICollectionLoadingCoordinator {
  private static readonly COLLECTIONS_KEY = 'collections_loading';
  private static readonly DEFAULT_TIMEOUT = 60000; // 60 seconds

  private loadedCollections = new Map<string, any>();
  private collectionMetadata = new Map<string, CollectionMetadata>();
  private lastResult: CollectionLoadingResult | null = null;
  private collectionLoader: CollectionLoader | null = null;

  constructor(
    private readonly plugin: Plugin,
    private readonly stateManager: IInitializationStateManager,
    private readonly vectorStore: any // Will be injected as dependency
  ) {
    this.initializeCollectionLoader();
  }
  
  /**
   * Initialize the collection loader with proper file system interface
   */
  private initializeCollectionLoader(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Get the storage path from the plugin
      let basePath;
      if (this.plugin.app.vault.adapter instanceof require('obsidian').FileSystemAdapter) {
        basePath = (this.plugin.app.vault.adapter as any).getBasePath();
      } else {
        throw new Error('FileSystemAdapter not available');
      }
      
      const pluginDir = path.join(basePath, '.obsidian', 'plugins', this.plugin.manifest.id);
      const dataDir = path.join(pluginDir, 'data', 'chroma-db');
      
      // Create file system interface
      const fsInterface: FileSystemInterface = {
        existsSync: (path: string) => fs.existsSync(path),
        mkdirSync: (path: string, options?: { recursive?: boolean }) => fs.mkdirSync(path, options),
        writeFileSync: (path: string, data: string) => fs.writeFileSync(path, data),
        readFileSync: (path: string, encoding: string) => fs.readFileSync(path, encoding),
        renameSync: (oldPath: string, newPath: string) => fs.renameSync(oldPath, newPath),
        unlinkSync: (path: string) => fs.unlinkSync(path),
        readdirSync: (path: string) => fs.readdirSync(path),
        statSync: (path: string) => fs.statSync(path),
        rmdirSync: (path: string) => fs.rmdirSync(path)
      };
      
      // Initialize collection loader
      this.collectionLoader = new CollectionLoader(
        dataDir,
        fsInterface,
        new PersistenceManager(fsInterface)
      );
    } catch (error) {
      console.error('[CollectionLoadingCoordinator] Failed to initialize collection loader:', error);
    }
  }

  /**
   * Ensures all collections are loaded exactly once
   */
  async ensureCollectionsLoaded(): Promise<CollectionLoadingResult> {
    // Check if we already have a successful cached result
    if (this.lastResult && this.lastResult.success) {
      console.log('[CollectionLoadingCoordinator] Returning cached collection loading result');
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
   * Performs the actual collection loading using the CollectionLoader
   */
  private async performCollectionLoading(): Promise<CollectionLoadingResult> {
    const startTime = Date.now();
    const errors: Array<{ collectionName: string; error: Error }> = [];
    let collectionsLoaded = 0;

    try {
      console.log('[CollectionLoadingCoordinator] Starting coordinated collection loading...');
      
      if (!this.collectionLoader) {
        throw new Error('Collection loader not initialized');
      }

      // Use the CollectionLoader to load collections from disk
      const loadResult = await this.collectionLoader.loadCollectionsFromDisk();
      
      if (loadResult.success && loadResult.loadedCollections) {
        // Process loaded collections
        for (const [collectionName, collection] of loadResult.loadedCollections) {
          this.loadedCollections.set(collectionName, collection);
          await this.updateCollectionMetadata(collectionName, collection);
          collectionsLoaded++;
          console.log(`[CollectionLoadingCoordinator] Loaded collection: ${collectionName}`);
        }
        
        // Add any errors from the loader
        if (loadResult.error) {
          errors.push({ 
            collectionName: 'loader', 
            error: new Error(loadResult.error) 
          });
        }
      } else {
        console.log('[CollectionLoadingCoordinator] No collections loaded from disk');
      }

      const loadTime = Date.now() - startTime;
      console.log(`[CollectionLoadingCoordinator] Completed loading ${collectionsLoaded} collections in ${loadTime}ms`);

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
      // Get item count from the loaded collection data
      let itemCount = 0;
      if (collection && collection.items && Array.isArray(collection.items)) {
        itemCount = collection.items.length;
      } else {
        // Fallback to vector store count
        itemCount = await this.getVectorStoreItemCount(collectionName);
      }
      
      const hasIndex = await this.checkCollectionHasIndex(collectionName);
      
      const metadata: CollectionMetadata = {
        name: collectionName,
        itemCount,
        lastModified: Date.now(),
        hasIndex,
        indexType: hasIndex ? 'hnsw' : undefined
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
      // This would check for HNSW index existence
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