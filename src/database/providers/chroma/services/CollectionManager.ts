import { ICollectionManager } from './interfaces/ICollectionManager';
import { Collection, ChromaClient } from '../PersistentChromaClient';
import { IDirectoryService } from './interfaces/IDirectoryService';
import { getErrorMessage } from '../../../../utils/errorUtils';

/**
 * Collection manager implementation
 * Handles collection lifecycle, intelligent caching, and validation
 * Follows SRP - only responsible for collection operations
 */
export class CollectionManager implements ICollectionManager {
  private client: InstanceType<typeof ChromaClient>;
  private directoryService: IDirectoryService;
  private collections: Set<string> = new Set();
  private collectionCache: Map<string, Collection> = new Map();
  private cacheHits = 0;
  private cacheRequests = 0;
  private persistentPath: string | null;

  constructor(
    client: InstanceType<typeof ChromaClient>,
    directoryService: IDirectoryService,
    persistentPath: string | null = null
  ) {
    this.client = client;
    this.directoryService = directoryService;
    this.persistentPath = persistentPath;
  }

  /**
   * Get or create a collection with intelligent caching and error recovery
   */
  async getOrCreateCollection(collectionName: string): Promise<Collection> {
    this.cacheRequests++;

    // Check cache first
    if (this.collectionCache.has(collectionName)) {
      const cachedCollection = this.collectionCache.get(collectionName)!;
      
      // Validate cached collection
      if (await this.validateCachedCollection(cachedCollection)) {
        this.cacheHits++;
        return cachedCollection;
      } else {
        // Remove invalid collection from cache
        this.collectionCache.delete(collectionName);
      }
    }

    // Collection not in cache or validation failed
    return await this.createOrRecoverCollection(collectionName);
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
          await this.validateAndCache(collectionName);
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
        await this.recoverCollectionsFromFilesystem();
      }
      
    } catch (error) {
      throw new Error(`Collection refresh failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Check if a collection exists
   */
  async hasCollection(collectionName: string): Promise<boolean> {
    return this.collections.has(collectionName);
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
  async createCollection(collectionName: string, metadata?: Record<string, any>): Promise<void> {
    if (this.collections.has(collectionName)) {
      return; // Collection already exists
    }
    
    try {
      await this.client.createCollection({
        name: collectionName,
        metadata: {
          'hnsw:space': 'cosine',
          ...metadata,
          createdAt: new Date().toISOString()
        }
      });
      
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
      await this.client.deleteCollection({ name: collectionName });
      
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
    try {
      const collection = await this.client.getCollection({ name: collectionName });
      
      // Try to perform a basic operation
      await collection.count();
      return true;
    } catch (error) {
      return false;
    }
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
   * Validate a cached collection
   */
  private async validateCachedCollection(collection: Collection): Promise<boolean> {
    try {
      if (typeof collection.count === 'function') {
        await collection.count();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create or recover a collection with error handling
   */
  private async createOrRecoverCollection(collectionName: string): Promise<Collection> {
    try {
      let collection: Collection;
      let isRecreated = false;
      
      // Try to get the collection from ChromaDB
      try {
        collection = await this.client.getCollection({ name: collectionName });
        
        // Validate the collection
        await collection.count();
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          // Create new collection
          collection = await this.client.createCollection({
            name: collectionName,
            metadata: { 
              'hnsw:space': 'cosine',
              createdAt: new Date().toISOString() 
            }
          });
        } else {
          // Collection exists but is corrupted, try to recreate
          try {
            await this.client.deleteCollection({ name: collectionName });
          } catch (deleteError) {
            // Continue even if delete fails
          }
          
          collection = await this.client.createCollection({
            name: collectionName,
            metadata: { 
              'hnsw:space': 'cosine',
              createdAt: new Date().toISOString(),
              recoveredAt: new Date().toISOString(),
              recoveryReason: 'validation_failed'
            }
          });
          
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
    if (typeof collection === 'string') {
      return collection;
    } else if (typeof collection === 'object' && collection !== null) {
      if (collection.name) {
        return String(collection.name);
      }
    }
    return '';
  }

  /**
   * Validate and cache a collection if not already cached
   */
  private async validateAndCache(collectionName: string): Promise<void> {
    if (this.collectionCache.has(collectionName)) {
      return;
    }
    
    try {
      const collection = await this.client.getCollection({ name: collectionName });
      
      // Validate by calling count
      await collection.count();
      
      // Cache if valid
      this.collectionCache.set(collectionName, collection);
    } catch (error) {
      // Remove from collections set if we can't access it
      this.collections.delete(collectionName);
    }
  }

  /**
   * Recover collections from filesystem that might not be loaded in memory
   */
  private async recoverCollectionsFromFilesystem(): Promise<void> {
    if (!this.persistentPath) {
      return;
    }
    
    try {
      const path = require('path');
      const collectionsDir = path.join(this.persistentPath, 'collections');
      
      if (!this.directoryService.directoryExists(collectionsDir)) {
        return;
      }
      
      const dirs = this.directoryService.readDirectory(collectionsDir);
      let recoveredCount = 0;
      
      for (const dir of dirs) {
        const collectionPath = path.join(collectionsDir, dir);
        
        // Skip non-directories, system directories, or already known collections
        if (!this.directoryService.directoryExists(collectionPath) || 
            dir.startsWith('.') || 
            this.collections.has(dir) ||
            this.shouldSkipSystemDirectory(dir)) {
          continue;
        }
        
        try {
          // Try to initialize the collection
          await this.createCollection(dir);
          recoveredCount++;
        } catch (createError) {
          // Continue with other collections
        }
      }
      
    } catch (error) {
      // Don't throw, just log the issue
      console.warn(`Failed to check collections directory: ${getErrorMessage(error)}`);
    }
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
    const results: Record<string, boolean> = {};
    
    const validationPromises = collectionNames.map(async (name) => {
      const isValid = await this.validateCollection(name);
      results[name] = isValid;
      return { name, isValid };
    });
    
    await Promise.all(validationPromises);
    return results;
  }

  /**
   * Register a loaded collection with the manager
   * Used when collections are loaded from disk with actual data
   */
  registerCollection(collectionName: string, collection: Collection): void {
    // Add to collections set
    this.collections.add(collectionName);
    
    // Add to cache
    this.collectionCache.set(collectionName, collection);
  }

  /**
   * Check if a directory should be skipped during collection discovery
   * Prevents HNSW indexes and other system directories from being treated as collections
   */
  private shouldSkipSystemDirectory(name: string): boolean {
    const systemDirectories = ['hnsw-indexes', '.git', 'node_modules', '.tmp'];
    return systemDirectories.includes(name);
  }
}