import { ICollectionManager } from './interfaces/ICollectionManager';
import { Collection, ChromaClient } from '../PersistentChromaClient';
import { IDirectoryService } from './interfaces/IDirectoryService';
import { getErrorMessage } from '../../../../utils/errorUtils';
import { ObsidianPathManager } from '../../../../core/ObsidianPathManager';
import { VaultOperations } from '../../../../core/VaultOperations';
import { StructuredLogger } from '../../../../core/StructuredLogger';
import { VaultOperationsDirectoryServiceAdapter } from './adapters/VaultOperationsDirectoryServiceAdapter';
import { CollectionValidator } from '../../../services/CollectionValidator';
import { CollectionMetadataManager } from '../../../services/CollectionMetadataManager';

/**
 * Location: src/database/providers/chroma/services/CollectionManager.ts
 * 
 * Summary: Handles collection lifecycle management with intelligent caching and validation.
 * Now uses extracted services (CollectionValidator, CollectionMetadataManager) via dependency injection
 * to follow Single Responsibility Principle and reduce complexity.
 * 
 * Used by: ChromaDB service layer for all collection operations
 * Dependencies: ChromaClient, IDirectoryService, CollectionValidator, CollectionMetadataManager
 */
export class CollectionManager implements ICollectionManager {
  private client: InstanceType<typeof ChromaClient>;
  private directoryService: IDirectoryService;
  private collections: Set<string> = new Set();
  private collectionCache: Map<string, Collection> = new Map();
  private cacheHits = 0;
  private cacheRequests = 0;
  private persistentPath: string | null;
  private pathManager: ObsidianPathManager | null = null;
  private vaultOps: VaultOperations | null = null;
  private logger: StructuredLogger | null = null;
  private validator: CollectionValidator;
  private metadataManager: CollectionMetadataManager;

  constructor(
    client: InstanceType<typeof ChromaClient>,
    directoryService: IDirectoryService,
    persistentPath: string | null = null,
    validator?: CollectionValidator,
    metadataManager?: CollectionMetadataManager
  ) {
    this.client = client;
    this.directoryService = directoryService;
    this.persistentPath = persistentPath;
    
    // Initialize extracted services with dependency injection
    this.validator = validator || new CollectionValidator(client, directoryService);
    this.metadataManager = metadataManager || new CollectionMetadataManager(client, directoryService, null, persistentPath);
    
    // ObsidianPathManager and VaultOperations will be injected via setters when available
  }

  /**
   * Set ObsidianPathManager for consistent path handling
   * Called during service initialization
   */
  setPathManager(pathManager: ObsidianPathManager): void {
    this.pathManager = pathManager;
    this.validator.setPathManager(pathManager);
    this.metadataManager.setPathManager(pathManager);
    this.updateDirectoryServiceAdapter();
  }

  /**
   * Set VaultOperations for file I/O operations
   * Called during service initialization
   */
  setVaultOperations(vaultOps: VaultOperations): void {
    this.vaultOps = vaultOps;
    this.updateDirectoryServiceAdapter();
  }

  /**
   * Set StructuredLogger for proper logging
   * Called during service initialization
   */
  setLogger(logger: StructuredLogger): void {
    this.logger = logger;
    this.updateDirectoryServiceAdapter();
  }

  /**
   * Update directory service to use VaultOperations adapter when all dependencies are available
   */
  private updateDirectoryServiceAdapter(): void {
    if (this.vaultOps && this.pathManager && this.logger) {
      this.directoryService = new VaultOperationsDirectoryServiceAdapter(
        this.vaultOps,
        this.pathManager,
        this.logger
      );
      this.logger.debug('Updated CollectionManager to use VaultOperations adapter', undefined, 'CollectionManager');
    }
  }

  /**
   * Get collection path using metadata manager
   */
  private getCollectionPath(collectionName: string): string {
    return this.metadataManager.getCollectionPath(collectionName);
  }

  /**
   * Get or create a collection with intelligent caching and error recovery
   */
  async getOrCreateCollection(collectionName: string, contextAware = false): Promise<Collection> {
    this.cacheRequests++;

    // Check cache first
    if (this.collectionCache.has(collectionName)) {
      const cachedCollection = this.collectionCache.get(collectionName)!;
      
      // Validate cached collection using validator service
      if (await this.validator.validateCachedCollection(cachedCollection)) {
        this.cacheHits++;
        return cachedCollection;
      } else {
        // Remove invalid collection from cache
        this.collectionCache.delete(collectionName);
      }
    }

    // Collection not in cache or validation failed
    return await this.createOrRecoverCollection(collectionName, contextAware);
  }

  /**
   * Refresh the list of collections with enhanced error handling
   */
  async refreshCollections(): Promise<void> {
    try {
      const collections = await this.client.listCollections();
      
      // Track collection changes
      const existingNames = new Set(this.collections);
      const foundNames = new Set<string>();
      const newNames = new Set<string>();
      const missingNames = new Set<string>();
      
      // Clear and repopulate collections set
      this.collections.clear();
      
      // Process collections from ChromaDB
      for (const collection of collections) {
        const collectionName = this.extractCollectionName(collection);
        
        if (collectionName) {
          this.collections.add(collectionName);
          foundNames.add(collectionName);
          
          if (!existingNames.has(collectionName)) {
            newNames.add(collectionName);
          }
          
          // Validate and cache if not already cached
          await this.metadataManager.validateAndCache(collectionName, this.collectionCache, this.collections);
        }
      }
      
      // Find removed collections
      for (const existingName of existingNames) {
        if (!foundNames.has(existingName)) {
          missingNames.add(existingName);
          this.collectionCache.delete(existingName);
        }
      }
      
      // Recovery: Check filesystem for collections that might not be loaded
      if (this.persistentPath) {
        await this.metadataManager.recoverCollectionsFromFilesystem(this.collections, this.collectionCache);
      }
      
    } catch (error) {
      throw new Error(`Collection refresh failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Check if a collection exists with filesystem-first detection
   * CRITICAL FIX: Use authoritative filesystem validation instead of relying on empty in-memory Set
   */
  async hasCollection(collectionName: string): Promise<boolean> {
    // Fast path: Check in-memory cache first
    if (this.collections.has(collectionName)) {
      // Validate cache entry is still valid using validator service
      if (await this.validator.validateCacheEntry(collectionName, this.persistentPath)) {
        return true;
      } else {
        // Remove invalid cache entry
        this.collections.delete(collectionName);
        this.collectionCache.delete(collectionName);
      }
    }
    
    // Authoritative path: Filesystem detection
    if (this.persistentPath) {
      // Use consistent path construction
      const collectionPath = this.getCollectionPath(collectionName);
      const metadataPath = `${collectionPath}/metadata.json`;
      
      if (await this.directoryService.directoryExists(collectionPath) && 
          await this.directoryService.fileExists(metadataPath)) {
        
        try {
          // Validate metadata content
          const metadataContent = await this.directoryService.readFile(metadataPath, 'utf8');
          const metadata = JSON.parse(metadataContent);
          
          // Validate required fields
          if (metadata.collectionName === collectionName && metadata.version) {
            
            // MEMORY FIX: Only mark collection as existing, don't load data
            // Data will be loaded on-demand by ContextualEmbeddingManager
            this.collections.add(collectionName);
            // Collection found but not loaded (lazy loading mode)
            return true;
          } else {
            console.warn(`[CollectionManager] Invalid metadata for ${collectionName}:`, {
              nameMatch: metadata.collectionName === collectionName,
              hasVersion: !!metadata.version
            });
          }
        } catch (error) {
          console.warn(`[CollectionManager] Failed to parse metadata for ${collectionName}:`, error);
        }
      } else {
      }
    }
    
    // Fallback: ChromaDB client check
    try {
      const collections = await this.client.listCollections();
      const exists = collections.some(c => this.extractCollectionName(c) === collectionName);
      
      if (exists) {
        // Load into cache using metadata manager
        const collection = await this.client.getCollection(collectionName);
        this.metadataManager.registerCollection(collectionName, collection, this.collections, this.collectionCache);
        return true;
      }
    } catch (error) {
      console.warn(`[CollectionManager] ChromaDB client check failed for ${collectionName}:`, error);
    }
    
    return false;
  }
  
  

  /**
   * List all available collections
   */
  async listCollections(): Promise<string[]> {
    return Array.from(this.collections);
  }

  /**
   * Create a new collection
   */
  async createCollection(collectionName: string, metadata?: Record<string, any>, contextAware = false): Promise<void> {
    if (this.collections.has(collectionName)) {
      return; // Collection already exists
    }
    
    try {
      const collectionMetadata = this.metadataManager.createCollectionMetadata(collectionName, metadata);
      await this.client.createCollection(collectionName, collectionMetadata, contextAware);
      
      this.collections.add(collectionName);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        this.collections.add(collectionName);
        return;
      }
      
      throw new Error(`Collection creation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Delete a collection
   */
  async deleteCollection(collectionName: string): Promise<void> {
    if (!this.collections.has(collectionName)) {
      return; // Collection doesn't exist
    }
    
    try {
      await this.client.deleteCollection(collectionName);
      
      this.collections.delete(collectionName);
      this.collectionCache.delete(collectionName);
    } catch (error) {
      throw new Error(`Collection deletion failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Validate a collection by performing basic operations
   */
  async validateCollection(collectionName: string): Promise<boolean> {
    return await this.validator.validateCollection(collectionName);
  }

  /**
   * Clear the collection cache
   */
  clearCache(): void {
    this.collectionCache.clear();
    this.cacheHits = 0;
    this.cacheRequests = 0;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    const hitRate = this.cacheRequests > 0 ? this.cacheHits / this.cacheRequests : 0;
    return {
      size: this.collectionCache.size,
      hitRate: Math.round(hitRate * 100) / 100
    };
  }


  /**
   * Create or recover a collection with error handling
   */
  private async createOrRecoverCollection(collectionName: string, contextAware = false): Promise<Collection> {
    try {
      let collection: Collection;
      let isRecreated = false;
      
      // Try to get the collection from ChromaDB (with context-aware mode)
      try {
        collection = await this.client.getCollection(collectionName, contextAware);
        
        // Validate the collection
        await collection.count(contextAware);
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          // Create new collection (with context-aware mode)
          const collectionMetadata = this.metadataManager.createCollectionMetadata(collectionName);
          collection = await this.client.createCollection(collectionName, collectionMetadata, contextAware);
        } else {
          // Collection exists but is corrupted, try to recreate
          try {
            await this.client.deleteCollection(collectionName);
          } catch (deleteError) {
            // Continue even if delete fails
          }
          
          const recoveryMetadata = this.metadataManager.createRecoveryMetadata(collectionName, 'validation_failed');
          collection = await this.client.createCollection(collectionName, recoveryMetadata, contextAware);
          
          isRecreated = true;
        }
      }
      
      // Update tracking
      this.collections.add(collectionName);
      this.collectionCache.set(collectionName, collection);
      
      return collection;
    } catch (error) {
      throw new Error(`Collection operation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Extract collection name from various collection object formats
   */
  private extractCollectionName(collection: any): string {
    return this.metadataManager.extractCollectionName(collection);
  }


  

  /**
   * Get collection with retry logic
   */
  async getCollectionWithRetry(collectionName: string, maxRetries = 3): Promise<Collection> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.getOrCreateCollection(collectionName);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          // Clear cache entry before retry
          this.collectionCache.delete(collectionName);
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        }
      }
    }

    throw new Error(`Failed to get collection after ${maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Batch validate multiple collections
   */
  async batchValidateCollections(collectionNames: string[]): Promise<Record<string, boolean>> {
    return await this.validator.batchValidateCollections(collectionNames);
  }

  /**
   * Register a loaded collection with the manager
   * Used when collections are loaded from disk with actual data
   */
  registerCollection(collectionName: string, collection: Collection): void {
    this.metadataManager.registerCollection(collectionName, collection, this.collections, this.collectionCache);
  }


  /**
   * Clean up obsolete collections
   * NOTE: snapshots, workspaces, sessions, memory_traces are ACTIVE collections used by memoryManager
   */
  async cleanupObsoleteCollections(): Promise<{ cleaned: string[], errors: string[] }> {
    const obsoleteCollections: string[] = []; // No obsolete collections currently
    const cleaned: string[] = [];
    const errors: string[] = [];

    for (const collectionName of obsoleteCollections) {
      try {
        if (await this.hasCollection(collectionName)) {
          await this.deleteCollection(collectionName);
          cleaned.push(collectionName);
        }
      } catch (error) {
        const errorMsg = `Failed to clean up ${collectionName}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        if (this.logger) {
          this.logger.warn(`Failed to clean up obsolete collection: ${errorMsg}`, undefined, 'CollectionManager');
        }
      }
    }

    return { cleaned, errors };
  }
}