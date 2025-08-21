/**
 * PersistentChromaClient - Filesystem-based ChromaDB client for Obsidian
 * 
 * A filesystem-based ChromaDB implementation that doesn't require external dependencies.
 * Works within Obsidian's Electron environment with proper file-based persistence.
 */

import { Plugin, normalizePath } from 'obsidian';

// Types for ChromaDB compatibility
export interface Collection {
  name: string;
  metadata?: Record<string, any>;
  add(params: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void>;
  
  get(params?: {
    ids?: string[];
    where?: Record<string, any>;
    limit?: number;
    offset?: number;
    include?: string[];
    contextAware?: boolean;
  }): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }>;
  
  query(params: {
    queryEmbeddings?: number[][];
    queryTexts?: string[];
    nResults?: number;
    where?: Record<string, any>;
    include?: string[];
  }): Promise<{
    ids: string[][];
    distances?: number[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
  }>;
  
  update(params: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void>;
  
  upsert(params: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void>;
  
  delete(params?: {
    ids?: string[];
    where?: Record<string, any>;
  }): Promise<void>;
  
  count(contextAware?: boolean): Promise<number>;
  
}

export interface ChromaClientOptions {
  path?: string;
  plugin?: Plugin;
}

export interface CollectionMetadata {
  name: string;
  metadata?: Record<string, any>;
}

export interface ChromaEmbeddingFunction {
  generate(texts: string[]): Promise<number[][]>;
}

/**
 * Filesystem-based Collection implementation for Obsidian
 */
export class FilesystemCollection implements Collection {
  name: string;
  metadata?: Record<string, any>;
  private dataPath: string;
  private plugin: Plugin;
  
  // Global initialization flag to override context-aware mode after startup
  private static _initializationComplete: boolean = false;

  constructor(name: string, dataPath: string, plugin: Plugin, metadata?: Record<string, any>) {
    this.name = name;
    this.metadata = metadata;
    this.dataPath = dataPath;
    this.plugin = plugin;
  }

  private getCollectionPath(): string {
    // Use simple string concatenation to avoid path duplication in Electron environment
    return `${this.dataPath}/collections/${this.name}`;
  }

  private getItemsFilePath(): string {
    // Use simple string concatenation to avoid path duplication in Electron environment
    return `${this.getCollectionPath()}/items.json`;
  }

  private async ensureCollectionDirectory(): Promise<void> {
    const collectionPath = this.getCollectionPath();
    // Use normalizePath for Obsidian's filesystem operations
    const normalizedPath = normalizePath(collectionPath);
    if (!await this.plugin.app.vault.adapter.exists(normalizedPath)) {
      await this.plugin.app.vault.adapter.mkdir(normalizedPath);
    }
  }

  
  /**
   * Mark initialization as complete globally - allows all collections to load normally
   */
  static setInitializationComplete(): void {
    FilesystemCollection._initializationComplete = true;
    console.debug(`[ChromaClient] Global initialization complete - context-aware restrictions lifted`);
  }
  
  /**
   * Reset initialization state (for testing)
   */
  static resetInitializationState(): void {
    FilesystemCollection._initializationComplete = false;
  }

  private async loadItems(contextAware = false): Promise<any[]> {
    
    const itemsFile = this.getItemsFilePath();
    const normalizedItemsFile = normalizePath(itemsFile);
    if (!await this.plugin.app.vault.adapter.exists(normalizedItemsFile)) {
      return [];
    }
    
    try {
      const content = await this.plugin.app.vault.adapter.read(normalizedItemsFile);
      const parsed = JSON.parse(content);
      
      // Standard Format A: Wrapped object with items array
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
        return parsed.items;
      }
      
      // Backward compatibility: Direct array format (Format B)
      if (Array.isArray(parsed)) {
        return parsed;
      }
      
      // Unexpected format
      console.warn(`[ChromaClient] Items file for collection ${this.name} has unexpected format:`, typeof parsed);
      return [];
    } catch (error) {
      console.error(`[ChromaClient] Error loading items for collection ${this.name}:`, error);
      return [];
    }
  }

  private async saveItems(items: any[]): Promise<void> {
    await this.ensureCollectionDirectory();
    const itemsFile = this.getItemsFilePath();
    const normalizedItemsFile = normalizePath(itemsFile);
    
    // Save in Format A: Wrapped object with metadata
    const wrappedData = {
      items: items,
      metadata: {
        distance: 'cosine',
        createdAt: new Date().toISOString(),
        collectionName: this.name,
        itemCount: items.length,
        savedAt: new Date().toISOString(),
        version: '1.0.0'
      }
    };
    
    await this.plugin.app.vault.adapter.write(normalizedItemsFile, JSON.stringify(wrappedData, null, 2));
  }

  async add(params: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    const items = await this.loadItems();
    
    for (let i = 0; i < params.ids.length; i++) {
      const item = {
        id: params.ids[i],
        embedding: params.embeddings?.[i],
        metadata: params.metadatas?.[i] || {},
        document: params.documents?.[i]
      };
      
      // Remove existing item with same ID
      const existingIndex = items.findIndex(existing => existing.id === item.id);
      if (existingIndex >= 0) {
        items[existingIndex] = item;
      } else {
        items.push(item);
      }
    }
    
    await this.saveItems(items);
  }

  async get(params?: {
    ids?: string[];
    where?: Record<string, any>;
    limit?: number;
    offset?: number;
    include?: string[];
    contextAware?: boolean;
  }): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }> {
    const items = await this.loadItems(false);
    
    // CRITICAL FIX: Ensure items is always an array to prevent "filtered.slice is not a function" errors
    if (!Array.isArray(items)) {
      console.warn(`[PersistentChromaClient] loadItems() returned non-array for collection ${this.name}:`, typeof items);
      return {
        ids: [],
        embeddings: [],
        metadatas: [],
        documents: []
      };
    }

    let filtered = items;

    // Filter by IDs if specified
    if (params?.ids && Array.isArray(params.ids)) {
      filtered = filtered.filter(item => item && item.id && params.ids!.includes(item.id));
    }

    // CRITICAL FIX: Apply where clause filtering - this was missing and causing cross-workspace data leakage
    if (params?.where) {
      // Import FilterEngine dynamically to avoid circular dependencies
      const { FilterEngine } = await import('./services/FilterEngine');
      
      // Filter using the where clause - this ensures workspace isolation
      filtered = FilterEngine.filterByWhere(filtered, params.where);
    }

    // Apply offset and limit with proper validation
    const offset = Math.max(0, params?.offset || 0);
    const limit = params?.limit;
    
    if (limit && limit > 0) {
      filtered = filtered.slice(offset, offset + limit);
    } else if (offset > 0) {
      filtered = filtered.slice(offset);
    }

    const result: any = {
      ids: filtered.map(item => item && item.id ? item.id : '').filter(id => id)
    };

    const include = params?.include || ['metadatas', 'documents'];
    if (include.includes('embeddings')) {
      result.embeddings = filtered
        .map(item => item && item.embedding ? item.embedding : null)
        .filter(e => e !== null && Array.isArray(e));
    }
    if (include.includes('metadatas')) {
      result.metadatas = filtered.map(item => item && item.metadata ? item.metadata : {});
    }
    if (include.includes('documents')) {
      result.documents = filtered
        .map(item => item && item.document ? item.document : null)
        .filter(d => d !== null && d !== undefined);
    }

    return result;
  }

  async query(params: {
    queryEmbeddings?: number[][];
    queryTexts?: string[];
    nResults?: number;
    where?: Record<string, any>;
    include?: string[];
  }): Promise<{
    ids: string[][];
    distances?: number[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
  }> {
    const items = await this.loadItems();
    
    // CRITICAL FIX: Ensure items is always an array to prevent "filtered.slice is not a function" errors
    if (!Array.isArray(items)) {
      console.warn(`[PersistentChromaClient] loadItems() returned non-array for collection ${this.name} during query:`, typeof items);
      return {
        ids: [[]],
        distances: [[]],
        embeddings: [[]],
        metadatas: [[]],
        documents: [[]]
      };
    }

    const nResults = Math.max(1, params.nResults || 10);
    const include = params.include || ['metadatas', 'documents', 'distances'];

    // Simple similarity search (cosine similarity)
    const results: any[] = [];
    
    if (params.queryEmbeddings && Array.isArray(params.queryEmbeddings) && params.queryEmbeddings.length > 0) {
      const queryEmbedding = params.queryEmbeddings[0];
      
      if (Array.isArray(queryEmbedding)) {
        for (const item of items) {
          if (item && item.embedding && Array.isArray(item.embedding)) {
            try {
              const similarity = this.cosineSimilarity(queryEmbedding, item.embedding);
              results.push({
                ...item,
                distance: 1 - similarity // Convert similarity to distance
              });
            } catch (error) {
              console.warn(`[PersistentChromaClient] Error calculating similarity for item ${item.id}:`, error);
            }
          }
        }
        
        // Sort by distance (ascending - closer is better)
        results.sort((a, b) => (a.distance || 0) - (b.distance || 0));
      }
    } else {
      // If no embeddings provided, return items as-is with zero distance
      results.push(...items.filter(item => item && item.id).map(item => ({ ...item, distance: 0 })));
    }

    // Limit results with proper validation
    const limitedResults = results.slice(0, nResults);

    const response: any = {
      ids: [limitedResults.map(r => r && r.id ? r.id : '').filter(id => id)]
    };

    if (include.includes('distances')) {
      response.distances = [limitedResults.map(r => r && typeof r.distance === 'number' ? r.distance : 0)];
    }
    if (include.includes('embeddings')) {
      response.embeddings = [limitedResults
        .map(r => r && r.embedding && Array.isArray(r.embedding) ? r.embedding : null)
        .filter(e => e !== null)];
    }
    if (include.includes('metadatas')) {
      response.metadatas = [limitedResults.map(r => r && r.metadata ? r.metadata : {})];
    }
    if (include.includes('documents')) {
      response.documents = [limitedResults
        .map(r => r && r.document ? r.document : null)
        .filter(d => d !== null && d !== undefined)];
    }

    return response;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async update(params: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    const items = await this.loadItems();
    
    for (let i = 0; i < params.ids.length; i++) {
      const existingIndex = items.findIndex(item => item.id === params.ids[i]);
      if (existingIndex >= 0) {
        if (params.embeddings?.[i]) items[existingIndex].embedding = params.embeddings[i];
        if (params.metadatas?.[i]) items[existingIndex].metadata = params.metadatas[i];
        if (params.documents?.[i]) items[existingIndex].document = params.documents[i];
      }
    }
    
    await this.saveItems(items);
  }

  async upsert(params: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    await this.add(params); // Add already handles upsert logic
  }

  async delete(params?: {
    ids?: string[];
    where?: Record<string, any>;
  }): Promise<void> {
    const items = await this.loadItems();
    let filtered = items;

    if (params?.ids) {
      filtered = filtered.filter(item => !params.ids!.includes(item.id));
    }

    await this.saveItems(filtered);
  }

  async count(contextAware = false): Promise<number> {
    const items = await this.loadItems(false);
    return items.length;
  }
}

/**
 * Filesystem-based ChromaDB client for Obsidian Electron environment
 */
export class ChromaClient {
  private options: ChromaClientOptions;
  private plugin: Plugin;
  private dataPath: string;

  constructor(options: ChromaClientOptions = {}) {
    this.options = options;
    this.plugin = options.plugin!;
    
    // Use the provided path or default to plugin's data directory
    if (options.path) {
      this.dataPath = options.path;
    } else {
      // Use relative path from plugin directory - Obsidian handles the absolute path resolution
      this.dataPath = 'data/chroma-db';
    }
  }

  /**
   * Initialize the client
   */
  async initialize(): Promise<void> {
    // Ensure data directory exists
    const normalizedDataPath = normalizePath(this.dataPath);
    if (!await this.plugin.app.vault.adapter.exists(normalizedDataPath)) {
      await this.plugin.app.vault.adapter.mkdir(normalizedDataPath);
    }
    
    // Use simple string concatenation to avoid path duplication in Electron environment
    const collectionsPath = `${this.dataPath}/collections`;
    const normalizedCollectionsPath = normalizePath(collectionsPath);
    if (!await this.plugin.app.vault.adapter.exists(normalizedCollectionsPath)) {
      await this.plugin.app.vault.adapter.mkdir(normalizedCollectionsPath);
    }
  }

  /**
   * Get or create a collection
   */
  async getOrCreateCollection(name: string, metadata?: Record<string, any>, contextAware = false): Promise<Collection> {
    // Use simple string concatenation to avoid path duplication in Electron environment
    const collectionPath = `${this.dataPath}/collections/${name}`;
    const normalizedCollectionPath = normalizePath(collectionPath);
    
    if (!await this.plugin.app.vault.adapter.exists(normalizedCollectionPath)) {
      await this.plugin.app.vault.adapter.mkdir(normalizedCollectionPath);
      
      // Save collection metadata
      const metadataFile = `${collectionPath}/collection.json`;
      const normalizedMetadataFile = normalizePath(metadataFile);
      await this.plugin.app.vault.adapter.write(normalizedMetadataFile, JSON.stringify({
        name,
        metadata: metadata || {}
      }, null, 2));
    }
    
    const collection = new FilesystemCollection(name, this.dataPath, this.plugin, metadata);
    
    return collection;
  }

  /**
   * Get an existing collection
   */
  async getCollection(name: string, contextAware = false): Promise<Collection> {
    // Use simple string concatenation to avoid path duplication in Electron environment
    const collectionPath = `${this.dataPath}/collections/${name}`;
    const normalizedCollectionPath = normalizePath(collectionPath);
    
    if (!await this.plugin.app.vault.adapter.exists(normalizedCollectionPath)) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    // Load metadata if exists
    let metadata: Record<string, any> = {};
    const metadataFile = `${collectionPath}/collection.json`;
    const normalizedMetadataFile = normalizePath(metadataFile);
    if (await this.plugin.app.vault.adapter.exists(normalizedMetadataFile)) {
      try {
        const content = await this.plugin.app.vault.adapter.read(normalizedMetadataFile);
        const collectionData = JSON.parse(content);
        metadata = collectionData.metadata || {};
      } catch (error) {
        console.error(`[ChromaClient] Error loading metadata for collection ${name}:`, error);
      }
    }
    
    const collection = new FilesystemCollection(name, this.dataPath, this.plugin, metadata);
    
    return collection;
  }

  /**
   * Create a new collection
   */
  async createCollection(name: string, metadata?: Record<string, any>, contextAware = false): Promise<Collection> {
    // Use simple string concatenation to avoid path duplication in Electron environment
    const collectionPath = `${this.dataPath}/collections/${name}`;
    const normalizedCollectionPath = normalizePath(collectionPath);
    
    if (await this.plugin.app.vault.adapter.exists(normalizedCollectionPath)) {
      throw new Error(`Collection '${name}' already exists`);
    }
    
    return await this.getOrCreateCollection(name, metadata, contextAware);
  }

  /**
   * Delete a collection
   */
  async deleteCollection(name: string): Promise<void> {
    // Use simple string concatenation to avoid path duplication in Electron environment
    const collectionPath = `${this.dataPath}/collections/${name}`;
    const normalizedCollectionPath = normalizePath(collectionPath);
    
    if (await this.plugin.app.vault.adapter.exists(normalizedCollectionPath)) {
      // Remove directory and all contents
      await this.plugin.app.vault.adapter.rmdir(normalizedCollectionPath, true);
    }
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<string[]> {
    // Use simple string concatenation to avoid path duplication in Electron environment
    const collectionsPath = `${this.dataPath}/collections`;
    const normalizedCollectionsPath = normalizePath(collectionsPath);
    
    
    if (!await this.plugin.app.vault.adapter.exists(normalizedCollectionsPath)) {
      return [];
    }
    
    try {
      const entries = await this.plugin.app.vault.adapter.list(normalizedCollectionsPath);
      
      // Extract folder names without using path.basename to avoid path issues
      const collectionNames = entries.folders.map(folder => {
        const parts = folder.split('/');
        const name = parts[parts.length - 1];
        return name;
      });
      
      return collectionNames;
    } catch (error) {
      console.error('[ChromaClient] Error listing collections:', error);
      return [];
    }
  }

  /**
   * Reset the entire database
   */
  async reset(): Promise<void> {
    const normalizedDataPath = normalizePath(this.dataPath);
    if (await this.plugin.app.vault.adapter.exists(normalizedDataPath)) {
      await this.plugin.app.vault.adapter.rmdir(normalizedDataPath, true);
    }
    await this.initialize();
  }

  /**
   * Check if client is responsive
   */
  async heartbeat(): Promise<number> {
    return Date.now();
  }
}

// Export ChromaClient as default export for backward compatibility
export default ChromaClient;