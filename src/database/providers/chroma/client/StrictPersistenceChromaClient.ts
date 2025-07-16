/**
 * StrictPersistenceChromaClient - Refactored following SOLID principles
 * Orchestrates specialized services for client operations
 */

import { ChromaClientOptions, CollectionMetadata, ChromaCollectionOptions, Collection, ChromaEmbeddingFunction } from '../PersistentChromaClient';
import { StrictPersistentCollection } from '../collection/StrictPersistentCollection';
import { FileSystemInterface } from '../services';

// Import specialized services
import { ClientInitializer } from './lifecycle/ClientInitializer';
import { CollectionLoader } from './lifecycle/CollectionLoader';
import { ResourceManager } from './lifecycle/ResourceManager';
import { CollectionManager } from './management/CollectionManager';
import { CollectionCache } from './management/CollectionCache';
import { ErrorHandler } from './management/ErrorHandler';

/**
 * Refactored StrictPersistenceChromaClient following SOLID principles
 * Orchestrates specialized services for client operations
 */
export class StrictPersistenceChromaClient {
  private storagePath: string | null = null;
  private fs: FileSystemInterface | null = null;
  
  // Composed services following Dependency Injection principle
  private clientInitializer: ClientInitializer;
  private collectionLoader: CollectionLoader | null = null;
  private resourceManager: ResourceManager | null = null;
  private collectionManager: CollectionManager | null = null;
  private collectionCache: CollectionCache;
  private errorHandler: ErrorHandler;

  /**
   * Create a new StrictPersistenceChromaClient
   */
  constructor(options: ChromaClientOptions = {}) {
    // Initialize core services
    this.clientInitializer = new ClientInitializer();
    this.collectionCache = new CollectionCache();
    this.errorHandler = new ErrorHandler();
    
    // Initialize client
    this.initializeClient(options);
  }

  /**
   * Initialize the client
   */
  private async initializeClient(options: ChromaClientOptions): Promise<void> {
    try {
      // Initialize client components
      const initResult = await this.clientInitializer.initializeClient(options);
      if (!initResult.success) {
        throw new Error(initResult.error);
      }

      // Set up client state
      this.storagePath = initResult.storagePath!;
      this.fs = initResult.fs!;

      // Initialize dependent services
      this.collectionLoader = new CollectionLoader(this.storagePath, this.fs, initResult.persistenceManager!);
      this.resourceManager = new ResourceManager(initResult.persistenceManager!, this.collectionCache.getAllCollections());
      this.collectionManager = new CollectionManager(this.collectionCache.getAllCollections(), this.storagePath, this.fs, this);

      // Load collections from disk
      await this.loadCollectionsFromDisk();
    } catch (error) {
      const errorResult = this.errorHandler.handleInitializationError(error);
      console.error('Client initialization failed:', errorResult.error);
      throw new Error(errorResult.error);
    }
  }

  /**
   * Load collections from disk
   */
  private async loadCollectionsFromDisk(): Promise<void> {
    if (!this.collectionLoader) {
      throw new Error('Collection loader not initialized');
    }

    try {
      const loadResult = await this.collectionLoader.loadCollectionsFromDisk();
      if (!loadResult.success) {
        throw new Error(loadResult.error);
      }

      // Load collections into cache
      this.collectionCache.loadCollections(loadResult.loadedCollections!);
    } catch (error) {
      const errorResult = this.errorHandler.handleError(error, 'Loading collections from disk');
      throw new Error(errorResult.error);
    }
  }

  /**
   * Create or get a collection
   */
  async createOrGetCollection(options: ChromaCollectionOptions): Promise<Collection> {
    try {
      await this.collectionCache.ensureCollectionsLoaded();
      
      if (!this.collectionManager) {
        throw new Error('Collection manager not initialized');
      }

      const result = await this.collectionManager.createOrGetCollection(options);
      if (!result.success) {
        throw new Error(result.error);
      }

      return result.collection!;
    } catch (error) {
      const errorResult = this.errorHandler.handleCollectionError(error, options.name, 'create or get');
      throw new Error(errorResult.error);
    }
  }

  /**
   * Get a collection
   */
  async getCollection(params: { name: string, embeddingFunction?: ChromaEmbeddingFunction }): Promise<Collection> {
    const { name } = params;
    
    try {
      await this.collectionCache.ensureCollectionsLoaded();
      
      if (!this.collectionManager) {
        throw new Error('Collection manager not initialized');
      }

      const result = await this.collectionManager.getCollection(name);
      if (!result.success) {
        throw new Error(result.error);
      }

      return result.collection!;
    } catch (error) {
      const errorResult = this.errorHandler.handleCollectionError(error, name, 'get');
      throw new Error(errorResult.error);
    }
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<CollectionMetadata[]> {
    try {
      await this.collectionCache.ensureCollectionsLoaded();
      
      if (!this.collectionManager) {
        throw new Error('Collection manager not initialized');
      }

      const result = await this.collectionManager.listCollections();
      if (!result.success) {
        throw new Error(result.error);
      }

      return result.collections!;
    } catch (error) {
      const errorResult = this.errorHandler.handleOperationError(error, 'list collections');
      throw new Error(errorResult.error);
    }
  }

  /**
   * Delete a collection
   */
  async deleteCollection(params: { name: string }): Promise<void> {
    const { name } = params;
    
    try {
      await this.collectionCache.ensureCollectionsLoaded();
      
      if (!this.collectionManager) {
        throw new Error('Collection manager not initialized');
      }

      const result = await this.collectionManager.deleteCollection(name);
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      const errorResult = this.errorHandler.handleCollectionError(error, name, 'delete');
      throw new Error(errorResult.error);
    }
  }

  /**
   * Force save all collections to disk
   */
  async saveAllCollectionsToDisk(): Promise<{
    success: boolean;
    savedCollections: string[];
    errors: string[];
  }> {
    try {
      if (!this.storagePath) {
        return {
          success: false,
          savedCollections: [],
          errors: ['No storage path configured for persistence']
        };
      }

      const result = await this.collectionCache.saveAllCachedCollections();
      
      if (!result.success) {
        console.error('Failed to save some collections:', result.errors);
      }

      return result;
    } catch (error) {
      const errorResult = this.errorHandler.handlePersistenceError(error, 'save all collections');
      return {
        success: false,
        savedCollections: [],
        errors: [errorResult.error]
      };
    }
  }

  /**
   * Force a reload of all collections from disk
   */
  async repairAndReloadCollections(): Promise<{
    success: boolean;
    repairedCollections: string[];
    errors: string[];
  }> {
    try {
      if (!this.storagePath || !this.fs) {
        return {
          success: false,
          repairedCollections: [],
          errors: ['No storage path configured for persistence']
        };
      }

      // Clear existing collections
      this.collectionCache.clearCache();

      // Load all collections from disk
      await this.loadCollectionsFromDisk();

      // Report success
      const repairedCollections = this.collectionCache.getCollectionNames();

      return {
        success: true,
        repairedCollections,
        errors: []
      };
    } catch (error) {
      const errorResult = this.errorHandler.handleResourceError(error, 'collections', 'repair and reload');
      return {
        success: false,
        repairedCollections: [],
        errors: [errorResult.error]
      };
    }
  }

  /**
   * Get client diagnostics
   */
  async getDiagnostics(): Promise<{
    client: {
      initialized: boolean;
      storagePath: string | null;
      collectionsLoaded: boolean;
    };
    collections: {
      count: number;
      names: string[];
    };
    cache: {
      status: any;
      stats: any;
    };
    errors: {
      recent: any[];
      statistics: any;
    };
  }> {
    return {
      client: {
        initialized: this.storagePath !== null && this.fs !== null,
        storagePath: this.storagePath,
        collectionsLoaded: this.collectionCache.isCollectionsLoaded()
      },
      collections: {
        count: this.collectionCache.getCollectionCount(),
        names: this.collectionCache.getCollectionNames()
      },
      cache: {
        status: this.collectionCache.getCacheStatus(),
        stats: this.collectionCache.getCacheStats()
      },
      errors: {
        recent: this.errorHandler.getRecentErrorLogs(5),
        statistics: this.errorHandler.getErrorStatistics()
      }
    };
  }

  /**
   * Create a collection (alias for createOrGetCollection for backward compatibility)
   */
  async createCollection(options: ChromaCollectionOptions): Promise<Collection> {
    return this.createOrGetCollection(options);
  }

  /**
   * Get or create a collection (alias for createOrGetCollection for backward compatibility)
   */
  async getOrCreateCollection(options: ChromaCollectionOptions): Promise<Collection> {
    return this.createOrGetCollection(options);
  }

  /**
   * Heartbeat method for health checks
   */
  async heartbeat(): Promise<{ success: boolean }> {
    try {
      // Simple health check - verify storage path and collections
      if (!this.storagePath || !this.fs) {
        return { success: false };
      }

      // Check if we can access the collections
      const collectionsLoaded = this.collectionCache.isCollectionsLoaded();
      return { success: collectionsLoaded };
    } catch (error) {
      return { success: false };
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.resourceManager) {
        await this.resourceManager.cleanup();
      }
      
      this.collectionCache.clearCache();
      this.errorHandler.clearErrorLogs();
    } catch (error) {
      const errorResult = this.errorHandler.handleResourceError(error, 'client', 'cleanup');
      console.error('Client cleanup failed:', errorResult.error);
    }
  }
}