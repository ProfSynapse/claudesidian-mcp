import { ICollectionManager, IDirectoryService } from '../types/ChromaTypes';
import { Collection, ChromaClient } from '../PersistentChromaClient';
import { getErrorMessage } from '../../../../utils/errorUtils';
import { ObsidianPathManager } from '../../../../core/ObsidianPathManager';
import { VaultOperations } from '../../../../core/VaultOperations';
import { StructuredLogger } from '../../../../core/StructuredLogger';
// VaultOperationsDirectoryServiceAdapter was consolidated - using PersistenceManager functionality
import { CollectionService } from '../../../services/core/CollectionService';

/**
 * Location: src/database/providers/chroma/services/CollectionManager.ts
 * 
 * Summary: Handles collection lifecycle management with intelligent caching and validation.
 * Now uses CollectionService for consolidated validation and metadata operations
 * to follow Single Responsibility Principle and reduce complexity.
 * 
 * Used by: ChromaDB service layer for all collection operations
 * Dependencies: ChromaClient, IDirectoryService, CollectionService
 */
export class CollectionManager implements ICollectionManager {
  private client: InstanceType<typeof ChromaClient>;
  private directoryService: IDirectoryService;
  private collections: Set<string> = new Set();
  private collectionCache: Map<string, Collection> = new Map();
  private cacheHits = 0;
  private cacheRequests = 0;
  private persistentPath: string | null;
  private instanceId: string = Math.random().toString(36).substr(2, 9); // Debug ID
  private pathManager: ObsidianPathManager | null = null;
  private vaultOps: VaultOperations | null = null;
  private logger: StructuredLogger | null = null;
  private collectionService?: CollectionService;

  constructor(
    client: InstanceType<typeof ChromaClient>,
    directoryService: IDirectoryService,
    persistentPath: string | null = null,
    collectionService?: CollectionService
  ) {
    this.client = client;
    this.directoryService = directoryService;
    this.persistentPath = persistentPath;
    
    // CollectionService will be injected later when available
    this.collectionService = collectionService;
    
    // ObsidianPathManager and VaultOperations will be injected via setters when available
  }

  /**
   * Set ObsidianPathManager for consistent path handling
   * Called during service initialization
   */
  setPathManager(pathManager: ObsidianPathManager): void {
    this.pathManager = pathManager;
    // CollectionService handles its own path management
    // CollectionService handles its own path management
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
    // VaultOperationsDirectoryServiceAdapter was consolidated into PersistenceManager
    // The directoryService passed in constructor already has the required functionality
    if (this.vaultOps && this.pathManager && this.logger) {
      this.logger.debug('Using existing PersistenceManager with Obsidian plugin support', undefined, 'CollectionManager');
    }
  }

  /**
   * Get collection path using metadata manager
   */
  private getCollectionPath(collectionName: string): string {
    // Return default path - CollectionService manages paths internally
    return `collections/${collectionName}`;
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
      if (this.collectionService && await this.collectionService.validateCollection(collectionName).then(r => r.valid)) {
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
          // Validation handled by CollectionService
          this.collections.add(collectionName);
        } else {
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
        // Recovery handled by CollectionService - ensure standard collections
        if (this.collectionService) {
          await this.collectionService.ensureStandardCollections();
        }
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
      if (this.collectionService && await this.collectionService.collectionExists(collectionName)) {
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
        // Load into cache
        const collection = await this.client.getCollection(collectionName);
        // Register collection in local cache
        this.collections.add(collectionName);
        this.collectionCache.set(collectionName, collection);
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
    // Force refresh to ensure we have the latest collections from filesystem
    await this.refreshCollections();
    
    const result = Array.from(this.collections);
    return result;
  }

  /**
   * Create a new collection
   */
  async createCollection(collectionName: string, metadata?: Record<string, any>, contextAware = false): Promise<void> {
    if (this.collections.has(collectionName)) {
      return; // Collection already exists
    }
    
    try {
      const collectionMetadata = metadata || {};
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
    if (this.collectionService) {
      return await this.collectionService.validateCollection(collectionName).then(r => r.valid);
    }
    return false;
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
          const collectionMetadata = { name: collectionName, created: Date.now() };
          collection = await this.client.createCollection(collectionName, collectionMetadata, contextAware);
        } else {
          // Collection exists but is corrupted, try to recreate
          try {
            await this.client.deleteCollection(collectionName);
          } catch (deleteError) {
            // Continue even if delete fails
          }
          
          const recoveryMetadata = { name: collectionName, recovery: 'validation_failed', timestamp: Date.now() };
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
    // Handle both string collections (from PersistentChromaClient) and object collections
    if (typeof collection === 'string') {
      return collection;
    }
    return collection.name || 'unknown_collection';
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
    // Batch validation - validate each collection individually
    const results: Record<string, boolean> = {};
    if (this.collectionService) {
      for (const name of collectionNames) {
        try {
          const validation = await this.collectionService.validateCollection(name);
          results[name] = validation.valid;
        } catch {
          results[name] = false;
        }
      }
    }
    return results;
  }

  /**
   * Register a loaded collection with the manager
   * Used when collections are loaded from disk with actual data
   */
  registerCollection(collectionName: string, collection: Collection): void {
    // Register collection in local cache
    this.collections.add(collectionName);
    this.collectionCache.set(collectionName, collection);
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

  /**
   * Ensure a collection exists, creating it if necessary
   * Alias for getOrCreateCollection to satisfy interface
   */
  async ensureCollection(name: string, metadata?: Record<string, any>): Promise<Collection> {
    return await this.getOrCreateCollection(name);
  }

  /**
   * Get metadata for a collection
   */
  async getCollectionMetadata(name: string): Promise<Record<string, any>> {
    try {
      const collection = await this.getOrCreateCollection(name);
      return collection.metadata || {};
    } catch (error) {
      throw new Error(`Failed to get metadata for collection ${name}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Check if a collection exists
   * Alias for hasCollection to satisfy interface
   */
  async collectionExists(name: string): Promise<boolean> {
    return await this.hasCollection(name);
  }


}