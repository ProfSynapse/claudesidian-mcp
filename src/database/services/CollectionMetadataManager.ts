import { Collection, ChromaClient } from '../providers/chroma/PersistentChromaClient';
import { IDirectoryService } from '../providers/chroma/services/interfaces/IDirectoryService';
import { ObsidianPathManager } from '../../core/ObsidianPathManager';
import { StructuredLogger } from '../../core/StructuredLogger';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Location: src/database/services/CollectionMetadataManager.ts
 * 
 * Summary: Manages collection metadata operations including loading, saving, validation,
 * and recovery from filesystem. Handles metadata persistence and integrity checks.
 * Extracted from CollectionManager to follow Single Responsibility Principle.
 * 
 * Used by: CollectionManager for all metadata-related operations
 * Dependencies: ChromaClient, IDirectoryService, ObsidianPathManager, StructuredLogger
 */
export class CollectionMetadataManager {
  private logger: StructuredLogger;

  constructor(
    private client: InstanceType<typeof ChromaClient>,
    private directoryService: IDirectoryService,
    private pathManager: ObsidianPathManager | null = null,
    private persistentPath: string | null = null,
    logger?: StructuredLogger
  ) {
    // Use provided logger or create a simple console logger
    this.logger = logger || {
      debug: (msg: string, ctx?: any, source?: string) => console.debug(`[${source || 'CollectionMetadataManager'}] ${msg}`, ctx),
      info: (msg: string, ctx?: any, source?: string) => console.info(`[${source || 'CollectionMetadataManager'}] ${msg}`, ctx),
      warn: (msg: string, error?: Error, source?: string) => console.warn(`[${source || 'CollectionMetadataManager'}] ${msg}`, error),
      error: (msg: string, error?: Error, source?: string) => console.error(`[${source || 'CollectionMetadataManager'}] ${msg}`, error)
    } as StructuredLogger;
  }

  /**
   * Set path manager for consistent path handling
   */
  setPathManager(pathManager: ObsidianPathManager): void {
    this.pathManager = pathManager;
  }

  /**
   * Set persistent path for filesystem operations
   */
  setPersistentPath(persistentPath: string): void {
    this.persistentPath = persistentPath;
  }

  /**
   * Load and cache a collection from filesystem with metadata validation
   */
  async loadAndCacheCollection(
    collectionName: string, 
    collectionPath: string, 
    metadata: any,
    collectionCache: Map<string, Collection>,
    collections: Set<string>
  ): Promise<void> {
    try {
      // First, try to get collection from ChromaDB (might already be loaded)
      let collection: Collection;
      try {
        collection = await this.client.getCollection(collectionName);
      } catch (getError) {
        // Collection not in client, need to create it in client and potentially load data
        collection = await this.client.createCollection(collectionName, metadata);
        
        // Check if we need to load data
        const currentCount = await collection.count();
        const expectedCount = metadata.itemCount || 0;
        
        if (currentCount === 0 && expectedCount > 0) {
          const itemsPath = this.pathManager ? 
            this.pathManager.joinPath(collectionPath, 'items.json') :
            `${collectionPath}/items.json`;
          
          if (await this.directoryService.fileExists(itemsPath)) {
            await this.loadCollectionData(collection, itemsPath);
          }
        }
      }
      
      // Register collection with manager
      collections.add(collectionName);
      collectionCache.set(collectionName, collection);
      
    } catch (error) {
      this.logger.error(`Failed to load and cache collection ${collectionName}`, error as Error, 'CollectionMetadataManager');
      throw error;
    }
  }

  /**
   * Load collection data from filesystem items.json file
   */
  async loadCollectionData(collection: Collection, itemsPath: string): Promise<void> {
    try {
      const itemsContent = await this.directoryService.readFile(itemsPath, 'utf8');
      const items = JSON.parse(itemsContent);
      
      if (!Array.isArray(items) || items.length === 0) {
        return;
      }
      
      // Batch loading for performance
      const batchSize = 100;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        const ids = batch.map((item: any, index: number) => item.id || `item_${i + index}`);
        const embeddings = batch.map((item: any) => item.embedding);
        const metadatas = batch.map((item: any) => item.metadata || {});
        const documents = batch.map((item: any) => item.document || '');
        
        await collection.add({
          ids,
          embeddings,
          metadatas,
          documents
        });
      }
      
      this.logger.info(`Loaded ${items.length} items for collection`, undefined, 'CollectionMetadataManager');
      
    } catch (error) {
      throw new Error(`Failed to load collection data: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Recover collections from filesystem that might not be loaded in memory
   */
  async recoverCollectionsFromFilesystem(
    collections: Set<string>,
    collectionCache: Map<string, Collection>
  ): Promise<{ recoveredCount: number; loadedCount: number }> {
    if (!this.persistentPath) {
      return { recoveredCount: 0, loadedCount: 0 };
    }
    
    try {
      // Get collections directory path
      const collectionsDir = this.pathManager ?
        this.pathManager.joinPath(this.pathManager.getChromaDbPath(), 'collections') :
        `${this.persistentPath}/collections`;
      
      if (!await this.directoryService.directoryExists(collectionsDir)) {
        return { recoveredCount: 0, loadedCount: 0 };
      }
      
      const dirs = await this.directoryService.readDirectory(collectionsDir);
      let recoveredCount = 0;
      let loadedCount = 0;
      
      for (const dir of dirs) {
        const collectionPath = this.pathManager ?
          this.pathManager.joinPath(collectionsDir, dir) :
          `${collectionsDir}/${dir}`;
        
        // Skip system directories or already known collections
        if (dir.startsWith('.') || 
            collections.has(dir) ||
            this.shouldSkipSystemDirectory(dir)) {
          continue;
        }
        
        // Check if it's actually a directory
        if (!await this.directoryService.directoryExists(collectionPath)) {
          continue;
        }
        
        // Check if this is a valid collection directory with data
        const metadataPath = this.pathManager ?
          this.pathManager.joinPath(collectionPath, 'metadata.json') :
          `${collectionPath}/metadata.json`;
        const itemsPath = this.pathManager ?
          this.pathManager.joinPath(collectionPath, 'items.json') :
          `${collectionPath}/items.json`;
        
        if (!await this.directoryService.fileExists(metadataPath)) {
          continue;
        }
        
        try {
          // Load and validate metadata
          const metadataContent = await this.directoryService.readFile(metadataPath, 'utf8');
          const metadata = JSON.parse(metadataContent);
          
          if (!metadata.collectionName || metadata.collectionName !== dir) {
            this.logger.warn(`Invalid metadata for ${dir}: name mismatch`, undefined, 'CollectionMetadataManager');
            continue;
          }
          
          const itemsExists = await this.directoryService.fileExists(itemsPath);
          const itemCount = metadata.itemCount || 0;
          
          // Load existing collection instead of creating new one
          try {
            // First, try to get collection from ChromaDB (might already be loaded)
            let collection: Collection;
            try {
              collection = await this.client.getCollection(dir);
            } catch (getError) {
              // Collection not in client, need to create it in client and load data
              collection = await this.client.createCollection(dir, metadata);
              
              // Load data if items exist and collection is empty
              const currentCount = await collection.count();
              if (currentCount === 0 && itemsExists && itemCount > 0) {
                await this.loadCollectionData(collection, itemsPath);
                loadedCount++;
              }
            }
            
            // Register collection with manager
            collections.add(dir);
            collectionCache.set(dir, collection);
            recoveredCount++;
            
          } catch (loadError) {
            this.logger.error(`Failed to load collection ${dir}`, loadError as Error, 'CollectionMetadataManager');
            // Continue with other collections
          }
          
        } catch (parseError) {
          this.logger.warn(`Failed to parse metadata for ${dir}`, parseError, 'CollectionMetadataManager');
          continue;
        }
      }
      
      if (recoveredCount > 0) {
        this.logger.info(`Recovered ${recoveredCount} collections from filesystem (${loadedCount} with data)`, undefined, 'CollectionMetadataManager');
      }
      
      return { recoveredCount, loadedCount };
      
    } catch (error) {
      this.logger.warn(`Failed to recover collections from filesystem: ${getErrorMessage(error)}`, undefined, 'CollectionMetadataManager');
      return { recoveredCount: 0, loadedCount: 0 };
    }
  }

  /**
   * Extract collection name from various collection object formats
   */
  extractCollectionName(collection: any): string {
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
  async validateAndCache(
    collectionName: string,
    collectionCache: Map<string, Collection>,
    collections: Set<string>
  ): Promise<void> {
    if (collectionCache.has(collectionName)) {
      return;
    }
    
    try {
      const collection = await this.client.getCollection(collectionName);
      
      // Validate by calling count
      await collection.count();
      
      // Cache if valid
      collectionCache.set(collectionName, collection);
    } catch (error) {
      // Remove from collections set if we can't access it
      collections.delete(collectionName);
      this.logger.warn(`Failed to validate and cache collection ${collectionName}`, error as Error, 'CollectionMetadataManager');
    }
  }

  /**
   * Get collection path using path manager or fallback
   */
  getCollectionPath(collectionName: string): string {
    if (this.pathManager) {
      return this.pathManager.getCollectionPath(collectionName);
    }
    
    // Fallback to string concatenation if ObsidianPathManager not available
    if (this.persistentPath) {
      return `${this.persistentPath}/collections/${collectionName}`;
    }
    
    // Ultimate fallback - use correct path structure to match PersistentChromaClient
    return `data/chroma-db/collections/${collectionName}`;
  }

  /**
   * Check if a directory should be skipped during collection discovery
   */
  private shouldSkipSystemDirectory(name: string): boolean {
    const systemDirectories = ['.git', 'node_modules', '.tmp'];
    return systemDirectories.includes(name);
  }

  /**
   * Register a loaded collection with the manager
   */
  registerCollection(
    collectionName: string, 
    collection: Collection,
    collections: Set<string>,
    collectionCache: Map<string, Collection>
  ): void {
    // Add to collections set
    collections.add(collectionName);
    
    // Add to cache
    collectionCache.set(collectionName, collection);
  }

  /**
   * Create collection metadata object
   */
  createCollectionMetadata(collectionName: string, additionalMetadata?: Record<string, any>): Record<string, any> {
    return {
      distance: 'cosine',
      collectionName,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      ...additionalMetadata
    };
  }

  /**
   * Create recovery metadata for recreated collections
   */
  createRecoveryMetadata(collectionName: string, recoveryReason: string): Record<string, any> {
    return {
      distance: 'cosine',
      collectionName,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      recoveredAt: new Date().toISOString(),
      recoveryReason
    };
  }
}