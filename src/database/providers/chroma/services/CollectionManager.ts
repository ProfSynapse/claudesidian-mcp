import { ICollectionManager } from './interfaces/ICollectionManager';
import { Collection, ChromaClient } from '../PersistentChromaClient';
import { IDirectoryService } from './interfaces/IDirectoryService';
import { getErrorMessage } from '../../../../utils/errorUtils';
import { ObsidianPathManager } from '../../../../core/ObsidianPathManager';
import { VaultOperations } from '../../../../core/VaultOperations';
import { StructuredLogger } from '../../../../core/StructuredLogger';

/**
 * Vault Operations Directory Service Adapter
 * Adapts VaultOperations to IDirectoryService interface for backward compatibility
 */
class VaultOperationsDirectoryServiceAdapter implements IDirectoryService {
  constructor(
    private vaultOps: VaultOperations,
    private pathManager: ObsidianPathManager,
    private logger: StructuredLogger
  ) {}

  async ensureDirectoryExists(path: string): Promise<void> {
    await this.vaultOps.ensureDirectory(path);
  }

  async calculateDirectorySize(directoryPath: string): Promise<number> {
    const sizeBytes = await this.vaultOps.calculateDirectorySize(directoryPath);
    return sizeBytes / (1024 * 1024); // Convert to MB
  }

  async validateDirectoryPermissions(path: string): Promise<boolean> {
    try {
      const exists = await this.vaultOps.folderExists(path);
      if (exists) {
        // Test by trying to create a temp file
        const testPath = this.pathManager.joinPath(path, '.test');
        const writeSuccess = await this.vaultOps.writeFile(testPath, 'test');
        if (writeSuccess) {
          await this.vaultOps.deleteFile(testPath);
        }
        return writeSuccess;
      }
      return false;
    } catch (error) {
      this.logger.warn('Permission validation failed', error, 'VaultOpsAdapter');
      return false;
    }
  }

  async directoryExists(path: string): Promise<boolean> {
    return await this.vaultOps.folderExists(path);
  }

  async readDirectory(path: string): Promise<string[]> {
    const listing = await this.vaultOps.listDirectory(path);
    return [...listing.files, ...listing.folders];
  }

  async getStats(path: string): Promise<any> {
    return await this.vaultOps.getStats(path);
  }

  async calculateMemoryCollectionsSize(collectionsPath: string): Promise<number> {
    const memoryCollections = ['memory_traces', 'sessions', 'snapshots'];
    let totalSize = 0;
    
    for (const collection of memoryCollections) {
      const collectionPath = this.pathManager.joinPath(collectionsPath, collection);
      if (await this.vaultOps.folderExists(collectionPath)) {
        const sizeBytes = await this.vaultOps.calculateDirectorySize(collectionPath);
        totalSize += sizeBytes;
      }
    }
    
    return totalSize / (1024 * 1024); // Convert to MB
  }

  async calculateCollectionSize(collectionsPath: string, collectionName: string): Promise<number> {
    const collectionPath = this.pathManager.joinPath(collectionsPath, collectionName);
    if (await this.vaultOps.folderExists(collectionPath)) {
      const sizeBytes = await this.vaultOps.calculateDirectorySize(collectionPath);
      return sizeBytes / (1024 * 1024); // Convert to MB
    }
    return 0;
  }

  async getCollectionSizeBreakdown(collectionsPath: string): Promise<Record<string, number>> {
    const breakdown: Record<string, number> = {};
    const listing = await this.vaultOps.listDirectory(collectionsPath);
    
    for (const folder of listing.folders) {
      const folderName = this.pathManager.getFileName(folder);
      const sizeBytes = await this.vaultOps.calculateDirectorySize(folder);
      breakdown[folderName] = sizeBytes / (1024 * 1024); // Convert to MB
    }
    
    return breakdown;
  }

  async fileExists(filePath: string): Promise<boolean> {
    return await this.vaultOps.fileExists(filePath);
  }

  async readFile(filePath: string, encoding?: string): Promise<string> {
    const content = await this.vaultOps.readFile(filePath, false);
    return content || '';
  }
}

/**
 * Collection manager implementation
 * Handles collection lifecycle, intelligent caching, and validation
 * Follows SRP - only responsible for collection operations
 * Uses ObsidianPathManager for consistent path handling
 * UPDATED: Now uses VaultOperations for all file I/O operations
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

  constructor(
    client: InstanceType<typeof ChromaClient>,
    directoryService: IDirectoryService,
    persistentPath: string | null = null
  ) {
    this.client = client;
    this.directoryService = directoryService;
    this.persistentPath = persistentPath;
    // ObsidianPathManager and VaultOperations will be injected via setters when available
  }

  /**
   * Set ObsidianPathManager for consistent path handling
   * Called during service initialization
   */
  setPathManager(pathManager: ObsidianPathManager): void {
    this.pathManager = pathManager;
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
   * Get collection path using ObsidianPathManager or fallback to string concatenation
   * CRITICAL FIX: Use ObsidianPathManager to prevent path duplication issues
   */
  private getCollectionPath(collectionName: string): string {
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
   * Check if a collection exists with filesystem-first detection
   * CRITICAL FIX: Use authoritative filesystem validation instead of relying on empty in-memory Set
   */
  async hasCollection(collectionName: string): Promise<boolean> {
    // Fast path: Check in-memory cache first
    if (this.collections.has(collectionName)) {
      // Validate cache entry is still valid
      if (await this.validateCacheEntry(collectionName)) {
        return true;
      } else {
        // Remove invalid cache entry
        this.collections.delete(collectionName);
        this.collectionCache.delete(collectionName);
        console.log(`[CollectionManager] Removed invalid cache entry for ${collectionName}`);
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
            console.log(`[CollectionManager] ✅ Found ${collectionName} on filesystem - loading into memory`);
            
            // Load collection into memory and cache
            await this.loadAndCacheCollection(collectionName, collectionPath, metadata);
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
        console.log(`[CollectionManager] Collection ${collectionName} not found on filesystem`);
      }
    }
    
    // Fallback: ChromaDB client check
    try {
      const collections = await this.client.listCollections();
      const exists = collections.some(c => this.extractCollectionName(c) === collectionName);
      
      if (exists) {
        console.log(`[CollectionManager] Found ${collectionName} in ChromaDB client - caching`);
        // Load into cache
        const collection = await this.client.getCollection(collectionName);
        this.registerCollection(collectionName, collection);
        return true;
      }
    } catch (error) {
      console.warn(`[CollectionManager] ChromaDB client check failed for ${collectionName}:`, error);
    }
    
    return false;
  }
  
  /**
   * Validate that a cached collection entry is still valid
   */
  private async validateCacheEntry(collectionName: string): Promise<boolean> {
    if (!this.persistentPath) {
      return true; // Can't validate without filesystem access
    }
    
    try {
      // CRITICAL FIX: Use ObsidianPathManager to prevent path duplication
      const collectionPath = this.getCollectionPath(collectionName);
      const metadataPath = this.pathManager ? 
        this.pathManager.joinPath(collectionPath, 'metadata.json') :
        `${collectionPath}/metadata.json`;
      
      if (!await this.directoryService.fileExists(metadataPath)) {
        return false; // Collection disappeared from filesystem
      }
      
      // Basic validation - could be enhanced with timestamp checks
      return true;
    } catch (error) {
      console.warn(`[CollectionManager] Cache validation failed for ${collectionName}:`, error);
      return false;
    }
  }
  
  /**
   * Load and cache a collection from filesystem
   */
  private async loadAndCacheCollection(collectionName: string, collectionPath: string, metadata: any): Promise<void> {
    try {
      // First, try to get collection from ChromaDB (might already be loaded)
      let collection: Collection;
      try {
        collection = await this.client.getCollection(collectionName);
        console.log(`[CollectionManager] Collection ${collectionName} already exists in ChromaDB client`);
      } catch (getError) {
        // Collection not in client, need to create it in client and potentially load data
        collection = await this.client.createCollection(collectionName, metadata);
        console.log(`[CollectionManager] Created collection ${collectionName} in ChromaDB client`);
        
        // Check if we need to load data
        const currentCount = await collection.count();
        const expectedCount = metadata.itemCount || 0;
        
        if (currentCount === 0 && expectedCount > 0) {
          // CRITICAL FIX: Use ObsidianPathManager to prevent path duplication
          const itemsPath = this.pathManager ? 
            this.pathManager.joinPath(collectionPath, 'items.json') :
            `${collectionPath}/items.json`;
          
          if (await this.directoryService.fileExists(itemsPath)) {
            await this.loadCollectionData(collection, itemsPath);
            console.log(`[CollectionManager] ✅ Loaded ${expectedCount} items into ${collectionName} from filesystem`);
          }
        }
      }
      
      // Register collection with manager
      this.registerCollection(collectionName, collection);
      
    } catch (error) {
      console.error(`[CollectionManager] Failed to load and cache collection ${collectionName}:`, error);
      throw error;
    }
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
      await this.client.createCollection(collectionName, {
        'hnsw:space': 'cosine',
        ...metadata,
        createdAt: new Date().toISOString()
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
    try {
      const collection = await this.client.getCollection(collectionName);
      
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
        collection = await this.client.getCollection(collectionName);
        
        // Validate the collection
        await collection.count();
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          // Create new collection
          collection = await this.client.createCollection(collectionName, {
            'hnsw:space': 'cosine',
            createdAt: new Date().toISOString()
          });
        } else {
          // Collection exists but is corrupted, try to recreate
          try {
            await this.client.deleteCollection(collectionName);
          } catch (deleteError) {
            // Continue even if delete fails
          }
          
          collection = await this.client.createCollection(collectionName, {
            'hnsw:space': 'cosine',
            createdAt: new Date().toISOString(),
            recoveredAt: new Date().toISOString(),
            recoveryReason: 'validation_failed'
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
      const collection = await this.client.getCollection(collectionName);
      
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
   * CRITICAL FIX: Load existing collections instead of creating new ones
   * CRITICAL FIX: Use ObsidianPathManager to prevent path duplication
   */
  private async recoverCollectionsFromFilesystem(): Promise<void> {
    if (!this.persistentPath) {
      return;
    }
    
    try {
      // CRITICAL FIX: Use ObsidianPathManager for collections directory path
      const collectionsDir = this.pathManager ?
        this.pathManager.joinPath(this.pathManager.getChromaDbPath(), 'collections') :
        `${this.persistentPath}/collections`;
      
      if (!await this.directoryService.directoryExists(collectionsDir)) {
        console.log('[CollectionManager] Collections directory does not exist, skipping recovery');
        return;
      }
      
      const dirs = await this.directoryService.readDirectory(collectionsDir);
      let recoveredCount = 0;
      let loadedCount = 0;
      
      console.log(`[CollectionManager] Scanning ${dirs.length} directories for existing collections`);
      
      for (const dir of dirs) {
        // CRITICAL FIX: Use ObsidianPathManager to prevent path duplication
        const collectionPath = this.pathManager ?
          this.pathManager.joinPath(collectionsDir, dir) :
          `${collectionsDir}/${dir}`;
        
        // Skip system directories or already known collections
        if (dir.startsWith('.') || 
            this.collections.has(dir) ||
            this.shouldSkipSystemDirectory(dir)) {
          continue;
        }
        
        // Check if it's actually a directory
        if (!await this.directoryService.directoryExists(collectionPath)) {
          continue;
        }
        
        // CRITICAL: Check if this is a valid collection directory with data
        // CRITICAL FIX: Use ObsidianPathManager to prevent path duplication
        const metadataPath = this.pathManager ?
          this.pathManager.joinPath(collectionPath, 'metadata.json') :
          `${collectionPath}/metadata.json`;
        const itemsPath = this.pathManager ?
          this.pathManager.joinPath(collectionPath, 'items.json') :
          `${collectionPath}/items.json`;
        
        if (!await this.directoryService.fileExists(metadataPath)) {
          console.log(`[CollectionManager] Skipping ${dir} - no metadata.json found`);
          continue;
        }
        
        try {
          // Load and validate metadata
          const metadataContent = await this.directoryService.readFile(metadataPath, 'utf8');
          const metadata = JSON.parse(metadataContent);
          
          if (!metadata.collectionName || metadata.collectionName !== dir) {
            console.warn(`[CollectionManager] Invalid metadata for ${dir}: name mismatch`);
            continue;
          }
          
          const itemsExists = await this.directoryService.fileExists(itemsPath);
          const itemCount = metadata.itemCount || 0;
          
          console.log(`[CollectionManager] Found valid collection: ${dir} (${itemCount} items, data file: ${itemsExists})`);
          
          // CRITICAL FIX: Load existing collection instead of creating new one
          try {
            // First, try to get collection from ChromaDB (might already be loaded)
            let collection: Collection;
            try {
              collection = await this.client.getCollection(dir);
              console.log(`[CollectionManager] Collection ${dir} already exists in ChromaDB client`);
            } catch (getError) {
              // Collection not in client, need to create it in client and load data
              collection = await this.client.createCollection(dir, metadata);
              console.log(`[CollectionManager] Created collection ${dir} in ChromaDB client`);
              
              // Load data if items exist and collection is empty
              const currentCount = await collection.count();
              if (currentCount === 0 && itemsExists && itemCount > 0) {
                await this.loadCollectionData(collection, itemsPath);
                loadedCount++;
                console.log(`[CollectionManager] ✅ Loaded ${itemCount} items into ${dir} from filesystem`);
              }
            }
            
            // Register collection with manager
            this.collections.add(dir);
            this.collectionCache.set(dir, collection);
            recoveredCount++;
            
          } catch (loadError) {
            console.error(`[CollectionManager] Failed to load collection ${dir}:`, loadError);
            // Continue with other collections
          }
          
        } catch (parseError) {
          console.warn(`[CollectionManager] Failed to parse metadata for ${dir}:`, parseError);
          continue;
        }
      }
      
      if (recoveredCount > 0) {
        console.log(`[CollectionManager] ✅ Successfully recovered ${recoveredCount} collections from filesystem (${loadedCount} with data loaded)`);
      } else {
        console.log('[CollectionManager] No collections found to recover from filesystem');
      }
      
    } catch (error) {
      // Don't throw, just log the issue
      console.warn(`[CollectionManager] Failed to recover collections from filesystem: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * Load collection data from filesystem items.json file
   */
  private async loadCollectionData(collection: Collection, itemsPath: string): Promise<void> {
    try {
      const itemsContent = await this.directoryService.readFile(itemsPath, 'utf8');
      const items = JSON.parse(itemsContent);
      
      if (!Array.isArray(items) || items.length === 0) {
        console.log('[CollectionManager] No items to load from filesystem');
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
      
      console.log(`[CollectionManager] Loaded ${items.length} items from filesystem`);
      
    } catch (error) {
      throw new Error(`Failed to load collection data: ${getErrorMessage(error)}`);
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

  /**
   * Clean up obsolete HNSW collections only
   * NOTE: snapshots, workspaces, sessions, memory_traces are ACTIVE collections used by memoryManager
   */
  async cleanupObsoleteCollections(): Promise<{ cleaned: string[], errors: string[] }> {
    const obsoleteCollections = ['hnsw-indexes']; // Only HNSW is obsolete
    const cleaned: string[] = [];
    const errors: string[] = [];

    for (const collectionName of obsoleteCollections) {
      try {
        if (await this.hasCollection(collectionName)) {
          await this.deleteCollection(collectionName);
          cleaned.push(collectionName);
          console.log(`[CollectionManager] ✅ Cleaned up obsolete collection: ${collectionName}`);
        }
      } catch (error) {
        const errorMsg = `Failed to clean up ${collectionName}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.warn(`[CollectionManager] ⚠️ ${errorMsg}`);
      }
    }

    return { cleaned, errors };
  }
}