import { ChromaClient, Collection } from './fixed-persistence-wrapper';
import { BaseVectorStore } from '../base/BaseVectorStore';
import { IStorageOptions } from '../../interfaces/IStorageOptions';
import { existsSync, mkdirSync } from 'fs';
import { Plugin } from 'obsidian';
import { getErrorMessage } from '../../../utils/errorUtils';

// Define standard include types for vector store compatibility
type StoreIncludeType = 'embeddings' | 'metadatas' | 'documents' | 'distances';

// Define a type for embedding results
// type Embeddings = number[][];

// Define a type for metadata results
// type Metadata = Record<string, any>;

/**
 * ChromaDB implementation of vector store
 * Provides persistent vector storage using ChromaDB
 */
export class ChromaVectorStore extends BaseVectorStore {
  /**
   * Calculate the size of a directory in MB
   * @param directoryPath Path to the directory
   * @returns Size in MB
   */
  private async calculateDirectorySize(directoryPath: string): Promise<number> {
    const fs = require('fs');
    const path = require('path');
    const { promisify } = require('util');
    const readdirAsync = promisify(fs.readdir);
    const statAsync = promisify(fs.stat);
    
    async function calculateSize(dirPath: string): Promise<number> {
      let totalSize = 0;
      const items = await readdirAsync(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await statAsync(itemPath);
        
        if (stats.isDirectory()) {
          totalSize += await calculateSize(itemPath);
        } else {
          totalSize += stats.size;
        }
      }
      
      return totalSize;
    }
    
    try {
      // Calculate size in bytes and convert to MB
      const sizeInBytes = await calculateSize(directoryPath);
      return sizeInBytes / (1024 * 1024);
    } catch (error) {
      console.error(`Error calculating size of directory ${directoryPath}:`, error);
      return 0;
    }
  }
  /**
   * ChromaDB client
   */
  private client: InstanceType<typeof ChromaClient> | null = null;
  
  /**
   * Collection cache for performance
   */
  private collectionCache: Map<string, Collection> = new Map();
  
  /**
   * Plugin instance for accessing paths
   */
  private plugin: Plugin;

  /**
   * Create a new ChromaDB vector store
   * @param plugin The Obsidian plugin instance
   * @param options Storage options
   */
  constructor(plugin: Plugin, options?: Partial<IStorageOptions>) {
    super(options);
    this.plugin = plugin;
    
    // Set default persistent path if not provided
    if (!this.config.persistentPath) {
      // We'll defer this initialization to the initialize() method
      // where we can properly access the FileSystemAdapter
      console.log("Persistent path will be set during initialization");
    }
  }
  
  /**
   * Ensure a directory exists, creating it if it doesn't
   * @param path Directory path to ensure exists
   */
  protected ensureDirectoryExists(path: string): void {
    try {
      if (!existsSync(path)) {
        console.log(`Creating directory: ${path}`);
        mkdirSync(path, { recursive: true });
        console.log(`Successfully created directory: ${path}`);
      } else {
        console.log(`Directory already exists: ${path}`);
      }
    } catch (error) {
      console.error(`Failed to create directory ${path}:`, error);
      throw new Error(`Directory creation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Initialize the ChromaDB client
   */
  async initialize(): Promise<void> {
    try {
      const path = require('path');
      
      // Set default persistent path if not provided
      if (!this.config.persistentPath) {
        // Get the vault's base path using FileSystemAdapter
        let basePath;
        if (this.plugin.app.vault.adapter instanceof require('obsidian').FileSystemAdapter) {
            // Use type assertion to access getBasePath
            basePath = (this.plugin.app.vault.adapter as any).getBasePath();
        } else {
            throw new Error('FileSystemAdapter not available');
        }
        
        // Construct the correct plugin directory within the vault
        const pluginDir = path.join(basePath, '.obsidian', 'plugins', this.plugin.manifest.id);
        this.config.persistentPath = path.join(pluginDir, 'data', 'chroma-db');
        console.log(`Using ChromaDB path: ${this.config.persistentPath}`);
      }
      
      // Ensure the data parent directories exist first
      const dataDir = path.dirname(this.config.persistentPath);
      this.ensureDirectoryExists(dataDir);
      
      // Then ensure the chroma-db directory exists
      if (!this.config.inMemory && this.config.persistentPath) {
        this.ensureDirectoryExists(this.config.persistentPath);
        console.log(`Ensured ChromaDB directory exists at: ${this.config.persistentPath}`);
      }
      
      // Create ChromaDB client
      if (this.config.inMemory) {
        // In-memory client
        console.log('Using in-memory ChromaDB client (not persistent)');
        this.client = new ChromaClient();
      } else if (this.config.server?.host) {
        // Remote server client
        const protocol = this.config.server.protocol || 'http';
        const port = this.config.server.port || 8000;
        const host = this.config.server.host;
        
        console.log(`Connecting to remote ChromaDB server at: ${protocol}://${host}:${port}`);
        this.client = new ChromaClient({
          path: `${protocol}://${host}:${port}`
        });
      } else {
        // Local persistent client
        console.log(`Using StrictPersistence ChromaDB at: ${this.config.persistentPath}`);
        
        // Create new strict persistence client
        this.client = new ChromaClient({
          path: this.config.persistentPath
        });
        
        // Log path info to confirm it's being used correctly
        console.log(`ChromaDB storage path set to: ${this.config.persistentPath}`);
        
        // Create the directory structure if needed (redundant but safer)
        const fs = require('fs');
        if (!fs.existsSync(this.config.persistentPath)) {
          console.log(`Creating ChromaDB storage directory: ${this.config.persistentPath}`);
          fs.mkdirSync(this.config.persistentPath, { recursive: true });
        }
        
        const collectionsDir = `${this.config.persistentPath}/collections`;
        if (!fs.existsSync(collectionsDir)) {
          console.log(`Creating ChromaDB collections directory: ${collectionsDir}`);
          fs.mkdirSync(collectionsDir, { recursive: true });
        }
      }
      
      // Load existing collections
      await this.refreshCollections();
      
      this.initialized = true;
      console.log(`ChromaDB vector store initialized with path: ${this.config.persistentPath || 'in-memory'}`);
      console.log(`Found ${this.collections.size} collections in ChromaDB`);
    } catch (error) {
      console.error('Failed to initialize ChromaDB:', error);
      throw new Error(`ChromaDB initialization failed: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * Refresh the list of collections with enhanced cache synchronization
   */
  private async refreshCollections(): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collections = await this.client.listCollections();
      
      // Track collections for better logging and debugging
      const existingNames = new Set(this.collections);
      const foundNames = new Set<string>();
      const newNames = new Set<string>();
      const missingNames = new Set<string>();
      
      // Clear the collections set, but keep track of what was there
      this.collections.clear();
      
      // First, process collections reported by ChromaDB
      for (const collection of collections) {
        // Handle both string and object cases
        let collectionName = '';
        
        if (typeof collection === 'string') {
          collectionName = collection;
        } else if (typeof collection === 'object' && collection !== null) {
          // Direct access to avoid property existence check
          const collObj = collection as any;
          if (collObj.name) {
            collectionName = String(collObj.name);
          }
        }
        
        if (collectionName) {
          // Add to our tracking sets
          this.collections.add(collectionName);
          foundNames.add(collectionName);
          
          // Check if this is a new collection
          if (!existingNames.has(collectionName)) {
            newNames.add(collectionName);
          }
          
          // Validate and update the cache for this collection
          try {
            // Skip collections that are already in the cache
            // But try to get it once to validate it's accessible
            if (!this.collectionCache.has(collectionName)) {
              const collection = await this.client.getCollection({ name: collectionName });
              
              // If we get here, the collection is valid - add to cache
              this.collectionCache.set(collectionName, collection);
            }
          } catch (cacheError) {
            console.warn(`Collection ${collectionName} is reported by ChromaDB but failed validation:`, cacheError);
            // Remove from our collections set if we can't access it
            this.collections.delete(collectionName);
            // Also remove from cache if it's there (might be corrupted)
            this.collectionCache.delete(collectionName);
          }
        }
      }
      
      // Find collections that disappeared
      for (const existingName of Array.from(existingNames)) {
        if (!foundNames.has(existingName)) {
          missingNames.add(existingName);
          // Remove from cache since it's gone
          this.collectionCache.delete(existingName);
        }
      }
      
      // In persistent mode, check file system for collections that might not be loaded
      if (!this.config.inMemory && this.config.persistentPath) {
        try {
          const fs = require('fs');
          const collectionsDir = `${this.config.persistentPath}/collections`;
          
          if (fs.existsSync(collectionsDir)) {
            const dirs = fs.readdirSync(collectionsDir);
            let recoveredCount = 0;
            
            for (const dir of dirs) {
              // Skip non-directories, hidden files, or already known collections
              const collectionPath = `${collectionsDir}/${dir}`;
              if (!fs.statSync(collectionPath).isDirectory() || dir.startsWith('.') || this.collections.has(dir)) {
                continue;
              }
              
              // Found a collection on disk that's not loaded in memory
              console.log(`Found collection directory: ${dir}, attempting to initialize...`);
              
              try {
                // Try to initialize the collection
                await this.createCollection(dir);
                recoveredCount++;
              } catch (createError) {
                console.error(`Failed to recover collection ${dir} from disk:`, createError);
              }
            }
            
            if (recoveredCount > 0) {
              console.log(`Recovered ${recoveredCount} collections from disk storage`);
            }
          }
        } catch (fsError) {
          console.warn(`Failed to check collections directory: ${fsError}`);
        }
      }
      
      // Log detailed status for debugging
      const status = [
        `Loaded ${this.collections.size} collections from ChromaDB`,
        newNames.size > 0 ? `${newNames.size} new collections: ${Array.from(newNames).join(', ')}` : null,
        missingNames.size > 0 ? `${missingNames.size} removed collections: ${Array.from(missingNames).join(', ')}` : null,
        `Cache contains ${this.collectionCache.size} collections`
      ].filter(Boolean).join('. ');
      
      console.log(status);
    } catch (error) {
      console.error('Failed to refresh collections:', error);
      throw new Error(`Collection refresh failed: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * Get a collection instance, creating it if needed, with enhanced error handling and recovery
   * @param collectionName Collection name
   * @returns Collection instance
   */
  private async getOrCreateCollection(collectionName: string): Promise<Collection> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    // Check cache first
    if (this.collectionCache.has(collectionName)) {
      const cachedCollection = this.collectionCache.get(collectionName)!;
      
      // Validate the cached collection by trying a simple operation
      try {
        // Call a safe method to verify the collection is still valid
        if (typeof cachedCollection.count === 'function') {
          await cachedCollection.count();
          // Collection is valid, return it
          return cachedCollection;
        }
      } catch (validationError) {
        console.warn(`Cached collection ${collectionName} failed validation, will recreate:`, validationError);
        // Remove invalid collection from cache
        this.collectionCache.delete(collectionName);
        // Fall through to recreate the collection
      }
    }
    
    // Collection not in cache or validation failed, try to get or create it
    try {
      let collection: Collection;
      let isRecreated = false;
      
      // Try to get the collection directly from ChromaDB first
      try {
        collection = await this.client.getCollection({ name: collectionName });
        
        // Verify the collection by calling count() or metadata()
        try {
          if (typeof collection.count === 'function') {
            await collection.count();
          } else if (typeof collection.metadata === 'function') {
            await collection.metadata();
          }
          // Successfully validated
        } catch (validationError) {
          console.warn(`Collection ${collectionName} exists but is corrupted, attempting to recreate:`, validationError);
          
          // Delete the corrupted collection first
          try {
            await this.client.deleteCollection({ name: collectionName });
            console.log(`Successfully deleted corrupted collection: ${collectionName}`);
          } catch (deleteError) {
            console.error(`Failed to delete corrupted collection ${collectionName}:`, deleteError);
            // We still try to recreate even if delete fails
          }
          
          // Recreate the collection
          collection = await this.client.createCollection({
            name: collectionName,
            metadata: { 
              createdAt: new Date().toISOString(),
              recoveredAt: new Date().toISOString(),
              recoveryReason: 'validation_failed'
            }
          });
          
          isRecreated = true;
        }
      } catch (error) {
        // Only attempt to create if the collection truly doesn't exist in ChromaDB
        if (error instanceof Error && error.message.includes('not found')) {
          // Create new collection
          collection = await this.client.createCollection({
            name: collectionName,
            metadata: { createdAt: new Date().toISOString() }
          });
          
          console.log(`Created new collection: ${collectionName}`);
        } else {
          // Unexpected error
          throw error;
        }
      }
      
      // Update our tracking since the collection exists
      this.collections.add(collectionName);
      
      // Cache the collection
      this.collectionCache.set(collectionName, collection);
      
      // Log if collection was recreated
      if (isRecreated) {
        console.log(`Successfully recreated and cached collection: ${collectionName}`);
      }
      
      return collection;
    } catch (error) {
      console.error(`Failed to get/create collection '${collectionName}':`, error);
      throw new Error(`Collection operation failed: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * Close the ChromaDB client
   */
  async close(): Promise<void> {
    try {
      // First, explicitly save all collections to ensure nothing is lost
      if (this.client && !this.config.inMemory) {
        console.log("Explicitly saving all collections before shutdown...");
        
        try {
          // Check if client has the saveAllCollections method
          if (typeof (this.client as any).saveAllCollections === 'function') {
            const saveResult = await (this.client as any).saveAllCollections();
            console.log(`Save result: ${saveResult.success ? 'Success' : 'Failed'}`);
            console.log(`Saved ${saveResult.savedCollections.length} collections: ${saveResult.savedCollections.join(', ')}`);
            
            if (saveResult.errors.length > 0) {
              console.error("Errors during save:", saveResult.errors);
            }
          } else {
            console.log("Client does not support explicit save - will rely on auto-save");
          }
        } catch (saveError) {
          console.error("Error during explicit save:", saveError);
          // Continue with shutdown despite save errors
        }
      }
      
      // Then clean up resources
      this.collectionCache.clear();
      this.collections.clear();
      this.client = null;
      this.initialized = false;
      console.log("ChromaDB client closed and resources released");
    } catch (error) {
      console.error("Error during ChromaDB shutdown:", error);
      // Reset state even if there was an error
      this.collectionCache.clear();
      this.collections.clear();
      this.client = null;
      this.initialized = false;
    }
  }
  
  /**
   * Create a new collection
   * @param collectionName Collection name
   * @param metadata Optional collection metadata
   */
  async createCollection(collectionName: string, metadata?: Record<string, any>): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    // Skip if collection already exists
    if (this.collections.has(collectionName)) {
      return;
    }
    
    try {
      await this.client.createCollection({
        name: collectionName,
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString()
        }
      });
      
      this.collections.add(collectionName);
    } catch (error) {
      // If the collection already exists, just add it to our known collections and return
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(`Collection '${collectionName}' already exists, adding to known collections`);
        this.collections.add(collectionName);
        return;
      }
      
      // Otherwise, log and re-throw the error
      console.error(`Failed to create collection '${collectionName}':`, error);
      throw new Error(`Collection creation failed: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * Check if a collection exists
   * @param collectionName Collection name
   * @returns Whether the collection exists
   */
  async hasCollection(collectionName: string): Promise<boolean> {
    return this.collections.has(collectionName);
  }
  
  /**
   * List all collections
   * @returns Array of collection names
   */
  async listCollections(): Promise<string[]> {
    return Array.from(this.collections);
  }
  
  /**
   * Delete a collection
   * @param collectionName Collection name
   */
  async deleteCollection(collectionName: string): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    if (!this.collections.has(collectionName)) {
      return; // Collection doesn't exist, nothing to delete
    }
    
    try {
      await this.client.deleteCollection({ name: collectionName });
      
      this.collections.delete(collectionName);
      this.collectionCache.delete(collectionName);
    } catch (error) {
      console.error(`Failed to delete collection '${collectionName}':`, error);
      throw new Error(`Collection deletion failed: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * Add items to a collection
   * @param collectionName Collection name
   * @param items Items to add
   */
  async addItems(collectionName: string, items: {
    ids: string[];
    embeddings: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // ChromaDB requires equal length arrays for all fields
      if (items.metadatas && items.metadatas.length !== items.ids.length) {
        throw new Error('Metadatas array length must match IDs array length');
      }
      
      if (items.documents && items.documents.length !== items.ids.length) {
        throw new Error('Documents array length must match IDs array length');
      }
      
      // Add items to the collection
      await collection.add({
        ids: items.ids,
        embeddings: items.embeddings,
        metadatas: items.metadatas,
        documents: items.documents
      });
    } catch (error) {
      console.error(`Failed to add items to collection '${collectionName}':`, error);
      throw new Error(`Item addition failed: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * Get items by ID from a collection
   * @param collectionName Collection name
   * @param ids IDs of the items to retrieve
   * @param include What to include in the response
   */
  async getItems(collectionName: string, ids: string[], include?: StoreIncludeType[]): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // Get items from the collection
      const results = await collection.get({
        ids,
        include: include || ['embeddings', 'metadatas', 'documents']
      } as any);
      
      // Handle null and undefined values in the results
      // Cast the results to the correct types
      return {
        ids: results.ids,
        embeddings: Array.isArray(results.embeddings) 
          ? results.embeddings.map((e: any) => e === null ? [] : e) as number[][] 
          : undefined,
        metadatas: Array.isArray(results.metadatas) 
          ? results.metadatas.map((m: any) => m === null ? {} : m) as Record<string, any>[] 
          : undefined,
        documents: Array.isArray(results.documents) 
          ? results.documents.map((d: any) => d === null ? '' : d) as string[] 
          : undefined
      };
    } catch (error) {
      console.error(`Failed to get items from collection '${collectionName}':`, error);
      throw new Error(`Item retrieval failed: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * Update items in a collection
   * @param collectionName Collection name
   * @param items Items to update
   */
  async updateItems(collectionName: string, items: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // ChromaDB update requires at least one of embeddings, metadatas, or documents
      if (!items.embeddings && !items.metadatas && !items.documents) {
        throw new Error('At least one of embeddings, metadatas, or documents must be provided');
      }
      
      // Update items in the collection
      await collection.update({
        ids: items.ids,
        embeddings: items.embeddings,
        metadatas: items.metadatas,
        documents: items.documents
      });
    } catch (error) {
      console.error(`Failed to update items in collection '${collectionName}':`, error);
      throw new Error(`Item update failed: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * Delete items from a collection
   * @param collectionName Collection name
   * @param ids IDs of the items to delete
   */
  async deleteItems(collectionName: string, ids: string[]): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // Delete items from the collection
      await collection.delete({
        ids
      });
    } catch (error) {
      console.error(`Failed to delete items from collection '${collectionName}':`, error);
      throw new Error(`Item deletion failed: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * Query a collection by embeddings or text
   * @param collectionName Collection name
   * @param query Query parameters
   */
  async query(collectionName: string, query: {
    queryEmbeddings?: number[][];
    queryTexts?: string[];
    nResults?: number;
    where?: Record<string, any>;
    include?: StoreIncludeType[];
  }): Promise<{
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  }> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // Query the collection
      const results = await collection.query({
        queryEmbeddings: query.queryEmbeddings,
        queryTexts: query.queryTexts,
        nResults: query.nResults || 10,
        where: query.where,
        include: query.include || ['embeddings', 'metadatas', 'documents', 'distances']
      } as any);
      
      // Handle null and undefined values in the results
      // Cast the results to the correct types
      const resultIds = results.ids || [];
      const resultEmbeddings = results.embeddings || [];
      const resultMetadatas = results.metadatas || [];
      const resultDocuments = results.documents || [];
      const resultDistances = results.distances || [];

      return {
        ids: resultIds,
        embeddings: resultEmbeddings.length > 0 
          ? resultEmbeddings.map((batch: any) => 
              Array.isArray(batch) 
                ? batch.map((e: any) => e === null ? [] : Array.isArray(e) ? e : []) 
                : []
            ) 
          : undefined,
        metadatas: resultMetadatas.length > 0 
          ? resultMetadatas.map((batch: any) => 
              Array.isArray(batch) 
                ? batch.map((m: any) => m === null ? {} : (typeof m === 'object' ? m : {})) 
                : []
            ) 
          : undefined,
        documents: resultDocuments.length > 0 
          ? resultDocuments.map((batch: any) => 
              Array.isArray(batch) 
                ? batch.map((d: any) => d === null ? '' : (typeof d === 'string' ? d : '')) 
                : []
            ) 
          : undefined,
        distances: resultDistances.length > 0 ? resultDistances : undefined
      };
    } catch (error) {
      console.error(`Failed to query collection '${collectionName}':`, error);
      throw new Error(`Collection query failed: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * Get count of items in a collection
   * @param collectionName Collection name
   */
  async count(collectionName: string): Promise<number> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // Get count of items in the collection
      const count = await collection.count();
      
      return count;
    } catch (error) {
      console.error(`Failed to get count for collection '${collectionName}':`, error);
      throw new Error(`Collection count failed: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * Get diagnostics about the ChromaDB store
   * Useful for debugging and troubleshooting
   */
  async getDiagnostics(): Promise<Record<string, any>> {
    if (!this.client) {
      return {
        status: 'error',
        initialized: false,
        error: 'ChromaDB client not initialized'
      };
    }
    
    try {
      // Track if data directory exists
      let dataDirectoryExists = false;
      let collectionsDirectoryExists = false;
      let filePermissionsOk = true;
      let fsError = null;
      let dbSizeMB = 0;
      
      try {
        const fs = require('fs');
        const path = require('path');
        
        // Check data directory
        if (this.config.persistentPath) {
          dataDirectoryExists = fs.existsSync(this.config.persistentPath);
          
          // Check collections directory if data directory exists
          if (dataDirectoryExists) {
            const collectionsDir = `${this.config.persistentPath}/collections`;
            collectionsDirectoryExists = fs.existsSync(collectionsDir);
            
            // Calculate database size
            try {
              dbSizeMB = await this.calculateDirectorySize(this.config.persistentPath);
              console.log(`Calculated database size: ${dbSizeMB.toFixed(2)} MB`);
            } catch (sizeError) {
              console.warn('Failed to calculate database size:', sizeError);
            }
            
            // Try to write a test file to check permissions
            try {
              const testFilePath = `${this.config.persistentPath}/.test_write`;
              fs.writeFileSync(testFilePath, 'test');
              fs.unlinkSync(testFilePath);
            } catch (err) {
              filePermissionsOk = false;
              fsError = err;
            }
          }
        }
      } catch (err) {
        fsError = err;
      }
      
      // Get list of collections
      const collections = await this.listCollections();
      const collectionDetails: Array<{name: string; itemCount?: number; error?: string}> = [];
      
      // Get details for each collection
      for (const collectionName of collections) {
        try {
          const collection = await this.getOrCreateCollection(collectionName);
          const count = await collection.count();
          
          collectionDetails.push({
            name: collectionName,
            itemCount: count
          });
        } catch (error) {
          collectionDetails.push({
            name: collectionName,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      return {
        status: 'ok',
        initialized: this.initialized,
        storageMode: this.config.inMemory ? 'in-memory' : 'persistent',
        persistentPath: this.config.persistentPath || 'none',
        dataDirectoryExists,
        collectionsDirectoryExists,
        filePermissionsOk,
        fsError: fsError ? String(fsError) : null,
        totalCollections: this.collections.size,
        collections: collectionDetails,
        dbSizeMB: dbSizeMB
      };
    } catch (error) {
      return {
        status: 'error',
        initialized: this.initialized,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Repair and reload collections from disk
   * This can be used to recover from situations where in-memory state is lost
   * @returns Result of the repair operation
   */
  async repairCollections(): Promise<{
    success: boolean;
    repairedCollections: string[];
    errors: string[];
  }> {
    if (!this.client) {
      return {
        success: false,
        repairedCollections: [],
        errors: ['ChromaDB client not initialized']
      };
    }
    
    try {
      // Check if client has the repair function
      if (typeof (this.client as any).repairAndReloadCollections === 'function') {
        console.log("Calling repairAndReloadCollections method on StrictPersistenceChromaClient...");
        const result = await (this.client as any).repairAndReloadCollections();
        
        // Refresh the collections list after repair
        await this.refreshCollections();
        
        return {
          success: result.errors.length === 0,
          repairedCollections: result.repairedCollections,
          errors: result.errors
        };
      } else {
        return {
          success: false,
          repairedCollections: [],
          errors: ['ChromaDB client does not support repair operations (not a persistent client)']
        };
      }
    } catch (error) {
      return {
        success: false,
        repairedCollections: [],
        errors: [`Failed to repair collections: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }
}