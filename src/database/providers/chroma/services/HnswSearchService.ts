/**
 * HnswSearchService - HNSW-accelerated vector similarity search
 * Replaces brute force O(n) search with efficient O(log n) HNSW algorithm
 */

// Import hnswlib-wasm loader function
import { loadHnswlib } from 'hnswlib-wasm';
import { DatabaseItem } from './FilterEngine';
import { FilterEngine, WhereClause } from './FilterEngine';
import { TFile, App } from 'obsidian';
import { EmbeddingService } from '../../../services/EmbeddingService';
import { IVectorStore } from '../../../interfaces/IVectorStore';

export interface ItemWithDistance {
  item: DatabaseItem;
  distance: number;
}

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  score: number;
  searchMethod: 'semantic';
  metadata: {
    filePath: string;
    similarity: number;
    fileId: string;
    timestamp: number;
  };
  content?: string;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  includeContent?: boolean;
}

interface HnswIndex {
  index: any; // HNSW index from hnswlib-wasm
  idToItem: Map<number, DatabaseItem>;
  itemIdToHnswId: Map<string, number>;
  nextId: number;
}

interface PartitionedHnswIndex {
  partitions: HnswIndex[];
  itemToPartition: Map<string, number>; // Maps item ID to partition index
  maxItemsPerPartition: number;
  dimension: number;
}

interface IndexMetadata {
  collectionName: string;
  itemCount: number;
  dimension: number;
  lastModified: number;
  contentHash: string;
  isPartitioned: boolean;
  partitionCount?: number;
}

/**
 * High-performance vector search using HNSW (Hierarchical Navigable Small World)
 * Provides O(log n) search instead of O(n) brute force
 */
export class HnswSearchService {
  private indexes: Map<string, HnswIndex> = new Map();
  private partitionedIndexes: Map<string, PartitionedHnswIndex> = new Map();
  private isInitialized = false;
  private hnswLib: any = null;
  private app?: App;
  private vectorStore?: IVectorStore;
  private embeddingService?: EmbeddingService;
  private persistentPath?: string;
  
  // Partitioning configuration
  private readonly maxItemsPerPartition = 500; // Lower threshold for partitioning
  private readonly usePartitioning = true; // Enable partitioning by default
  
  // Index persistence configuration
  private readonly enablePersistence = true;
  private readonly indexMetadataCache = new Map<string, IndexMetadata>();

  constructor(app?: App, vectorStore?: IVectorStore, embeddingService?: EmbeddingService, persistentPath?: string) {
    this.app = app;
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    this.persistentPath = persistentPath;
  }

  /**
   * Initialize HNSW library
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Load HNSW WASM library
      this.hnswLib = await loadHnswlib();
      this.isInitialized = true;
      // HNSW service initialized
    } catch (error) {
      console.error('[HnswSearchService] Failed to initialize HNSW:', error);
      throw error;
    }
  }

  /**
   * Create or update HNSW index for a collection with intelligent persistence
   */
  async indexCollection(collectionName: string, items: DatabaseItem[]): Promise<void> {
    await this.initialize();

    if (items.length === 0) {
      console.log(`[HnswSearchService] No items to index for collection: ${collectionName}`);
      return;
    }

    // Try to load existing index first
    if (await this.tryLoadPersistedIndex(collectionName, items)) {
      console.log(`[HnswSearchService] ✓ Loaded persisted index for collection: ${collectionName}`);
      return;
    }

    // Fallback to creating new index
    console.log(`[HnswSearchService] Creating new index for collection: ${collectionName}`);
    await this.createIndexFromScratch(collectionName, items);
  }

  /**
   * Create index from scratch (original logic)
   */
  private async createIndexFromScratch(collectionName: string, items: DatabaseItem[]): Promise<void> {
    // Remove any existing indexes for this collection to start fresh
    this.indexes.delete(collectionName);
    this.partitionedIndexes.delete(collectionName);

    // Determine embedding dimension from first item
    const firstEmbedding = items.find(item => item.embedding && item.embedding.length > 0)?.embedding;
    if (!firstEmbedding) {
      console.log(`[HnswSearchService] No valid embeddings found for collection: ${collectionName}`);
      return;
    }

    const dimension = firstEmbedding.length;
    
    // Decide whether to use partitioning based on collection size
    if (this.usePartitioning && items.length > this.maxItemsPerPartition) {
      console.log(`[HnswSearchService] Large collection detected (${items.length} items). Using partitioned indexing.`);
      await this.createPartitionedIndex(collectionName, items, dimension);
    } else {
      console.log(`[HnswSearchService] Creating single HNSW index for ${items.length} items.`);
      await this.createSingleIndex(collectionName, items, dimension);
    }

    // Persist the new index
    await this.persistIndex(collectionName, items);
  }

  /**
   * Create partitioned HNSW indexes for very large collections
   */
  private async createPartitionedIndex(collectionName: string, items: DatabaseItem[], dimension: number): Promise<void> {
    try {
      const partitions: HnswIndex[] = [];
      const itemToPartition = new Map<string, number>();
      let skippedCount = 0;

      // Calculate number of partitions needed
      const numPartitions = Math.ceil(items.length / this.maxItemsPerPartition);
      console.log(`[HnswSearchService] Creating ${numPartitions} partitions for ${items.length} items`);

      // Create partitions
      for (let partitionIndex = 0; partitionIndex < numPartitions; partitionIndex++) {
        const startIdx = partitionIndex * this.maxItemsPerPartition;
        const endIdx = Math.min(startIdx + this.maxItemsPerPartition, items.length);
        const partitionItems = items.slice(startIdx, endIdx);

        console.log(`[HnswSearchService] Creating partition ${partitionIndex + 1}/${numPartitions} with ${partitionItems.length} items`);

        // Create HNSW index for this partition
        const index = new this.hnswLib.HierarchicalNSW('cosine', dimension, '');
        
        // Use a safe capacity for each partition
        const maxElements = Math.max(partitionItems.length + 5000, 60000);
        index.initIndex(dimension, 16, 200, maxElements);
        
        const idToItem = new Map<number, DatabaseItem>();
        const itemIdToHnswId = new Map<string, number>();
        let nextId = 0;

        // Add items to this partition
        for (let i = 0; i < partitionItems.length; i++) {
          const item = partitionItems[i];
          
          if (!this.isValidItem(item, dimension)) {
            skippedCount++;
            continue;
          }
          
          const hnswId = nextId++;
          
          try {
            index.addPoint(item.embedding!, hnswId, false);
            idToItem.set(hnswId, item);
            itemIdToHnswId.set(item.id, hnswId);
            itemToPartition.set(item.id, partitionIndex);
            
          } catch (error) {
            console.error(`[HnswSearchService] Failed to add item to partition ${partitionIndex}:`, error);
            skippedCount++;
          }
        }

        partitions.push({
          index,
          idToItem,
          itemIdToHnswId,
          nextId
        });
      }

      // Store the partitioned index
      this.partitionedIndexes.set(collectionName, {
        partitions,
        itemToPartition,
        maxItemsPerPartition: this.maxItemsPerPartition,
        dimension
      });

      console.log(`[HnswSearchService] Successfully created ${numPartitions} partitions. Skipped ${skippedCount} invalid items.`);
      
    } catch (error) {
      console.error(`[HnswSearchService] Failed to create partitioned index for collection ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Create single HNSW index for smaller collections
   */
  private async createSingleIndex(collectionName: string, items: DatabaseItem[], dimension: number): Promise<void> {
    try {
      // Create new HNSW index using loaded library
      const index = new this.hnswLib.HierarchicalNSW('cosine', dimension, '');
      
      // Use safe capacity with generous buffer
      const maxElements = Math.max(items.length * 3, 60000);
      index.initIndex(dimension, 16, 200, maxElements);
      
      const idToItem = new Map<number, DatabaseItem>();
      const itemIdToHnswId = new Map<string, number>();
      let nextId = 0;
      let skippedCount = 0;

      // Add all items to the index
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (!this.isValidItem(item, dimension)) {
          skippedCount++;
          continue;
        }
        
        const hnswId = nextId++;
        
        try {
          index.addPoint(item.embedding!, hnswId, false);
          idToItem.set(hnswId, item);
          itemIdToHnswId.set(item.id, hnswId);
          
        } catch (error) {
          const errorMessage = String(error);
          const errorStack = (error as any)?.stack || '';
          
          // Check for capacity-related errors
          const isCapacityError = 
            errorMessage.includes('maximum number of elements') ||
            errorMessage.includes('max_elements') ||
            errorStack.includes('maximum number of el') ||
            (errorMessage.includes('std::runtime_error') && i > 500); // Likely capacity if many items added
          
          if (isCapacityError) {
            console.warn(`[HnswSearchService] Capacity limit reached at item ${i}. Switching to partitioned indexing.`);
            console.warn(`[HnswSearchService] Error details: ${errorMessage}`);
            
            // Fall back to partitioned indexing
            await this.createPartitionedIndex(collectionName, items, dimension);
            return;
          }
          
          console.error(`[HnswSearchService] Failed to add item ${i}:`, error);
          skippedCount++;
        }
      }

      // Store the single index
      this.indexes.set(collectionName, {
        index,
        idToItem,
        itemIdToHnswId,
        nextId
      });

      console.log(`[HnswSearchService] Successfully created single index with ${items.length - skippedCount} items. Skipped ${skippedCount} invalid items.`);
      
    } catch (error) {
      console.error(`[HnswSearchService] Failed to create single index for collection ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Validate item for indexing
   */
  private isValidItem(item: DatabaseItem, expectedDimension: number): boolean {
    if (!item.embedding) return false;
    if (item.embedding.length !== expectedDimension) return false;
    
    return item.embedding.every(val => 
      typeof val === 'number' && 
      !isNaN(val) && 
      isFinite(val)
    );
  }

  /**
   * Add single item to existing index
   */
  async addItemToIndex(collectionName: string, item: DatabaseItem): Promise<void> {
    const indexData = this.indexes.get(collectionName);
    if (!indexData || !item.embedding) {
      // If no index exists or item has no embedding, skip
      return;
    }

    try {
      const hnswId = indexData.nextId++;
      
      // Add to HNSW index
      indexData.index.addPoint(item.embedding, hnswId, false);
      
      // Store mappings
      indexData.idToItem.set(hnswId, item);
      indexData.itemIdToHnswId.set(item.id, hnswId);
      
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('maximum number of elements') || errorMessage.includes('max_elements')) {
        console.warn(`[HnswSearchService] HNSW index capacity limit reached when adding item ${item.id}. Index may need rebuilding with larger capacity.`);
      } else {
        console.error(`[HnswSearchService] Failed to add item ${item.id} to index:`, error);
      }
    }
  }

  /**
   * Remove item from index
   */
  async removeItemFromIndex(collectionName: string, itemId: string): Promise<void> {
    const indexData = this.indexes.get(collectionName);
    if (!indexData) return;

    const hnswId = indexData.itemIdToHnswId.get(itemId);
    if (hnswId !== undefined) {
      // Note: HNSW doesn't support removal, so we just remove from our mappings
      // The actual HNSW index entry will remain but become unreachable
      indexData.idToItem.delete(hnswId);
      indexData.itemIdToHnswId.delete(itemId);
    }
  }

  /**
   * Perform fast HNSW search (supports both single and partitioned indexes)
   */
  async searchSimilar(
    collectionName: string,
    queryEmbedding: number[],
    nResults = 10,
    where?: WhereClause
  ): Promise<ItemWithDistance[]> {
    if (queryEmbedding.length === 0) {
      return [];
    }

    // Validate query embedding
    const isValidQueryEmbedding = queryEmbedding.every(val => 
      typeof val === 'number' && 
      !isNaN(val) && 
      isFinite(val)
    );
    
    if (!isValidQueryEmbedding) {
      console.error('[HnswSearchService] Invalid query embedding - contains NaN or infinite values');
      return [];
    }

    // Check if we have a partitioned index
    const partitionedIndex = this.partitionedIndexes.get(collectionName);
    if (partitionedIndex) {
      return await this.searchPartitioned(partitionedIndex, queryEmbedding, nResults, where);
    }

    // Fall back to single index search
    const indexData = this.indexes.get(collectionName);
    if (!indexData) {
      return [];
    }

    return await this.searchSingle(indexData, queryEmbedding, nResults, where);
  }

  /**
   * Search within a single HNSW index
   */
  private async searchSingle(
    indexData: HnswIndex,
    queryEmbedding: number[],
    nResults: number,
    where?: WhereClause
  ): Promise<ItemWithDistance[]> {
    try {
      // Set search parameter (higher = better recall, slower search)
      indexData.index.setEfSearch(Math.max(nResults * 2, 50));
      
      // Perform HNSW search
      const searchResults = indexData.index.searchKnn(queryEmbedding, nResults * 3, null);
      
      // Convert HNSW results to our format
      const results: ItemWithDistance[] = [];
      
      for (let i = 0; i < searchResults.neighbors.length; i++) {
        const hnswId = searchResults.neighbors[i];
        const distance = searchResults.distances[i];
        const item = indexData.idToItem.get(hnswId);
        
        if (item) {
          // Apply where clause filtering if provided
          if (!where || this.matchesWhere(item, where)) {
            results.push({ item, distance });
          }
        }
      }

      // Return top N results after filtering
      return results.slice(0, nResults);
      
    } catch (error) {
      console.error(`[HnswSearchService] Single index search failed:`, error);
      return [];
    }
  }

  /**
   * Search across all partitions and merge results
   */
  private async searchPartitioned(
    partitionedIndex: PartitionedHnswIndex,
    queryEmbedding: number[],
    nResults: number,
    where?: WhereClause
  ): Promise<ItemWithDistance[]> {
    try {
      const allResults: ItemWithDistance[] = [];
      
      // Search each partition
      for (let i = 0; i < partitionedIndex.partitions.length; i++) {
        const partition = partitionedIndex.partitions[i];
        
        // Search this partition for more results than needed per partition
        const partitionResults = await this.searchSingle(
          partition, 
          queryEmbedding, 
          Math.max(nResults * 2, 100), // Get more results per partition
          where
        );
        
        allResults.push(...partitionResults);
      }
      
      // Sort all results by distance (lower is better)
      allResults.sort((a, b) => a.distance - b.distance);
      
      // Return top N results
      return allResults.slice(0, nResults);
      
    } catch (error) {
      console.error(`[HnswSearchService] Partitioned search failed:`, error);
      return [];
    }
  }

  /**
   * Check if collection has an index (single or partitioned)
   */
  hasIndex(collectionName: string): boolean {
    return this.indexes.has(collectionName) || this.partitionedIndexes.has(collectionName);
  }

  /**
   * Get index statistics (supports both single and partitioned)
   */
  getIndexStats(collectionName: string): { itemCount: number; dimension: number; partitions?: number } | null {
    // Check for partitioned index first
    const partitionedIndex = this.partitionedIndexes.get(collectionName);
    if (partitionedIndex) {
      let totalItems = 0;
      for (const partition of partitionedIndex.partitions) {
        totalItems += partition.idToItem.size;
      }
      
      return {
        itemCount: totalItems,
        dimension: partitionedIndex.dimension,
        partitions: partitionedIndex.partitions.length
      };
    }

    // Check for single index
    const indexData = this.indexes.get(collectionName);
    if (!indexData) return null;

    return {
      itemCount: indexData.idToItem.size,
      dimension: indexData.index.getNumDimensions()
    };
  }

  /**
   * Remove index for collection (single or partitioned)
   */
  removeIndex(collectionName: string): void {
    this.indexes.delete(collectionName);
    this.partitionedIndexes.delete(collectionName);
  }

  /**
   * Clear all indexes (single and partitioned)
   */
  clearAllIndexes(): void {
    this.indexes.clear();
    this.partitionedIndexes.clear();
  }

  /**
   * Get memory usage statistics (includes partitioned indexes)
   */
  getMemoryStats(): { totalIndexes: number; totalItems: number; totalPartitions: number } {
    let totalItems = 0;
    let totalPartitions = 0;
    
    // Count single indexes
    for (const indexData of this.indexes.values()) {
      totalItems += indexData.idToItem.size;
    }

    // Count partitioned indexes
    for (const partitionedIndex of this.partitionedIndexes.values()) {
      totalPartitions += partitionedIndex.partitions.length;
      for (const partition of partitionedIndex.partitions) {
        totalItems += partition.idToItem.size;
      }
    }

    return {
      totalIndexes: this.indexes.size + this.partitionedIndexes.size,
      totalItems,
      totalPartitions
    };
  }

  // ===== ENHANCED SEARCH METHODS FOR UNIFIED SEARCH =====

  /**
   * Search content with metadata filtering using HNSW
   * Primary method for unified search integration
   * Overloaded to support both old and new call signatures
   */
  async searchWithMetadataFilter(
    query: string,
    limitOrFiles?: number | TFile[],
    metadataOrOptions?: any | SearchOptions
  ): Promise<SearchResult[]> {
    // Handle overloaded parameters
    let limit = 10;
    let threshold = 0.5; // Default threshold, will be overwritten by options
    let includeContent = false;
    let filteredFiles: TFile[] | undefined;
    let metadata: any = {};

    // Determine which signature is being used
    if (typeof limitOrFiles === 'number') {
      // Old signature: searchWithMetadataFilter(query, limit, metadata)
      limit = limitOrFiles;
      metadata = metadataOrOptions || {};
    } else if (Array.isArray(limitOrFiles)) {
      // New signature: searchWithMetadataFilter(query, filteredFiles, options)
      filteredFiles = limitOrFiles;
      const options = (metadataOrOptions as SearchOptions) || {};
      limit = options.limit || 10;
      threshold = options.threshold || 0.7;
      includeContent = options.includeContent || false;
    } else if (limitOrFiles === undefined && metadataOrOptions) {
      // Only options provided: searchWithMetadataFilter(query, undefined, options)
      const options = (metadataOrOptions as SearchOptions) || {};
      limit = options.limit || 10;
      threshold = options.threshold || 0.7;
      includeContent = options.includeContent || false;
    }

    // Use file_embeddings collection for content search
    const collectionName = 'file_embeddings';
    
    if (!this.hasIndex(collectionName)) {
      console.warn(`[HnswSearchService] No index found for collection: ${collectionName}`);
      return [];
    }

    try {
      // Check if embedding service is available
      if (!this.embeddingService) {
        console.warn('[HnswSearchService] No embedding service available for semantic search');
        return [];
      }

      // Generate embedding for query
      console.log(`[HnswSearchService] Generating embedding for query: "${query}"`);
      console.log(`[HnswSearchService] Embedding service available:`, !!this.embeddingService);
      
      const queryEmbedding = await this.embeddingService.getEmbedding(query);
      
      if (!queryEmbedding || queryEmbedding.length === 0) {
        console.error('[HnswSearchService] Failed to generate query embedding');
        return [];
      }
      
      console.log(`[HnswSearchService] Generated query embedding:`, {
        dimension: queryEmbedding.length,
        firstValues: queryEmbedding.slice(0, 3),
        provider: (this.embeddingService as any)?.embeddingGenerator?.embeddingProvider?.constructor?.name || 'unknown'
      });

      // If we have filtered files, create a where clause to match only those files
      let where: WhereClause | undefined;
      if (filteredFiles && filteredFiles.length > 0) {
        const allowedPaths = filteredFiles.map(f => f.path);
        where = {
          filePath: { $in: allowedPaths }
        };
      }

      // Perform HNSW search with the query embedding
      const results = await this.searchSimilar(collectionName, queryEmbedding, limit, where);
      
      // Debug: Log raw results before filtering
      console.log(`[HnswSearchService] Raw HNSW results: ${results.length}, threshold: ${threshold}`);
      console.log(`[HnswSearchService] Query embedding dimension: ${queryEmbedding.length}, first few values: [${queryEmbedding.slice(0, 5).join(', ')}]`);
      if (results.length > 0) {
        results.slice(0, 3).forEach((result, idx) => {
          const similarity = 1 - result.distance;
          console.log(`  ${idx + 1}. Similarity: ${similarity.toFixed(3)}, File: ${result.item.metadata?.filePath || 'unknown'}, Content: ${result.item.document?.substring(0, 80)}...`);
          
          // Check if this result contains our search term
          const containsSearchTerm = result.item.document?.toLowerCase().includes(query.toLowerCase());
          if (containsSearchTerm) {
            console.log(`    *** EXACT MATCH FOUND! This chunk contains "${query}" ***`);
          }
        });
      }
      
      // Format results for return
      const formattedResults = this.formatSearchResults(results, threshold, includeContent);
      
      console.log(`[HnswSearchService] Found ${formattedResults.length} results after filtering`);
      return formattedResults;
      
    } catch (error) {
      console.error('[HnswSearchService] Search failed:', error);
      return [];
    }
  }

  /**
   * Index file content for unified search
   * @param file File to index
   * @param content Content to index
   * @returns Promise resolving when indexing is complete
   */
  async indexFileContent(file: TFile, content: string): Promise<void> {
    const collectionName = 'file_embeddings';
    
    // Create database item
    const item: DatabaseItem = {
      id: file.path,
      document: content,
      metadata: {
        filePath: file.path,
        fileName: file.basename,
        lastModified: file.stat.mtime,
        fileSize: file.stat.size
      },
      embedding: [] // TODO: Generate embedding
    };

    // TODO: Generate embedding and add to index
    console.log(`[HnswSearchService] Would index file: ${file.path}`);
  }

  /**
   * Remove file from unified search index
   * @param filePath Path of file to remove
   * @returns Promise resolving when removal is complete
   */
  async removeFileFromIndex(filePath: string): Promise<void> {
    const collectionName = 'file_embeddings';
    await this.removeItemFromIndex(collectionName, filePath);
    console.log(`[HnswSearchService] Removed file from index: ${filePath}`);
  }

  /**
   * Convert HNSW results to SearchResult format
   * @param results Results from HNSW search
   * @param threshold Similarity threshold to apply
   * @param includeContent Whether to include full content
   * @returns Formatted search results
   */
  private formatSearchResults(
    results: ItemWithDistance[],
    threshold = 0.7,
    includeContent = false
  ): SearchResult[] {
    const mappedResults = results
      .map(({ item, distance }) => {
        const similarity = 1 - distance; // Convert distance to similarity
        
        if (similarity < threshold) {
          return null; // Filter out low similarity results
        }

        const result: SearchResult = {
          id: item.id,
          title: item.metadata?.fileName || item.id,
          snippet: this.createSnippet(item.document || ''),
          score: similarity,
          searchMethod: 'semantic' as const,
          metadata: {
            filePath: item.metadata?.filePath || item.id,
            similarity,
            fileId: item.id,
            timestamp: Date.now()
          }
        };
        
        if (includeContent && item.document) {
          result.content = item.document;
        }
        
        return result;
      })
      .filter((result): result is SearchResult => result !== null);

    return mappedResults.sort((a, b) => b.score - a.score); // Sort by similarity descending
  }

  /**
   * Create snippet from content
   * @param content Full content
   * @param maxLength Maximum snippet length
   * @returns Snippet text
   */
  private createSnippet(content: string, maxLength = 300): string {
    if (!content || content.length === 0) {
      return '';
    }
    
    if (content.length <= maxLength) {
      return content.trim();
    }
    
    // Try to break at sentence boundary if possible
    const truncated = content.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );
    
    if (lastSentenceEnd > maxLength * 0.6) {
      return truncated.substring(0, lastSentenceEnd + 1).trim();
    }
    
    // Break at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace).trim() + '...';
    }
    
    return truncated.trim() + '...';
  }

  /**
   * Helper method to apply where clause filtering
   */
  private matchesWhere(item: DatabaseItem, where: WhereClause): boolean {
    return FilterEngine.matchesWhereClause(item, where);
  }

  // ===== INDEX PERSISTENCE METHODS =====

  /**
   * Migrate metadata files from old location to new location
   */
  private async migrateMetadataFiles(): Promise<void> {
    if (!this.persistentPath) return;

    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const oldPath = path.join(this.persistentPath, 'collections', 'hnsw-indexes');
      const newPath = path.join(this.persistentPath, 'hnsw-indexes');
      
      console.log(`[HnswSearchService] Checking for metadata files to migrate from ${oldPath} to ${newPath}`);
      
      // Check if old path exists
      const oldExists = await fs.access(oldPath).then(() => true).catch(() => false);
      if (!oldExists) {
        console.log(`[HnswSearchService] No old metadata directory found, skipping migration`);
        return;
      }
      
      // Ensure new directory exists
      await fs.mkdir(newPath, { recursive: true });
      
      // Move metadata files from old location to new location
      const files = await fs.readdir(oldPath);
      let migratedCount = 0;
      
      for (const file of files) {
        if (file.endsWith('-metadata.json')) {
          const oldFilePath = path.join(oldPath, file);
          const newFilePath = path.join(newPath, file);
          
          // Check if file doesn't already exist in new location
          const newExists = await fs.access(newFilePath).then(() => true).catch(() => false);
          if (!newExists) {
            await fs.copyFile(oldFilePath, newFilePath);
            migratedCount++;
            console.log(`[HnswSearchService] Migrated metadata file: ${file}`);
          }
        }
      }
      
      if (migratedCount > 0) {
        console.log(`[HnswSearchService] Successfully migrated ${migratedCount} metadata files`);
      }
      
    } catch (error) {
      console.warn(`[HnswSearchService] Error during metadata migration:`, error);
    }
  }

  /**
   * Try to load persisted index and validate against current data
   */
  private async tryLoadPersistedIndex(collectionName: string, currentItems: DatabaseItem[]): Promise<boolean> {
    if (!this.enablePersistence || !this.persistentPath) {
      return false;
    }

    try {
      // First attempt migration if needed
      await this.migrateMetadataFiles();
      
      const metadata = await this.loadIndexMetadata(collectionName);
      if (!metadata) {
        console.log(`[HnswSearchService] No persisted metadata found for collection: ${collectionName}`);
        return false;
      }

      // Validate metadata against current items
      if (!this.validateIndexMetadata(metadata, currentItems)) {
        console.log(`[HnswSearchService] Persisted index is outdated for collection: ${collectionName}`);
        await this.cleanupPersistedIndex(collectionName); // Clean up outdated index
        return false;
      }

      // Try to load the actual index data
      const indexLoaded = await this.loadIndexData(collectionName, metadata);
      if (!indexLoaded) {
        console.log(`[HnswSearchService] Failed to load persisted index data for collection: ${collectionName}`);
        await this.cleanupPersistedIndex(collectionName);
        return false;
      }

      // Add any new items that weren't in the persisted index
      await this.addNewItemsToIndex(collectionName, currentItems, metadata);

      console.log(`[HnswSearchService] Successfully loaded persisted index for collection: ${collectionName}`);
      return true;

    } catch (error) {
      console.warn(`[HnswSearchService] Error loading persisted index for ${collectionName}:`, error);
      return false;
    }
  }

  /**
   * Validate if persisted metadata matches current data
   */
  private validateIndexMetadata(metadata: IndexMetadata, currentItems: DatabaseItem[]): boolean {
    // Check basic item count (allow for minor differences due to incremental updates)
    const itemCountDiff = Math.abs(metadata.itemCount - currentItems.length);
    if (itemCountDiff > Math.max(10, metadata.itemCount * 0.1)) { // Allow 10% difference or 10 items
      console.log(`[HnswSearchService] Item count mismatch: expected ~${metadata.itemCount}, got ${currentItems.length}`);
      return false;
    }

    // Check dimension consistency
    const firstEmbedding = currentItems.find(item => item.embedding && item.embedding.length > 0)?.embedding;
    if (firstEmbedding && firstEmbedding.length !== metadata.dimension) {
      console.log(`[HnswSearchService] Dimension mismatch: expected ${metadata.dimension}, got ${firstEmbedding.length}`);
      return false;
    }

    // Check if content hash indicates significant changes
    const currentContentHash = this.calculateContentHash(currentItems);
    const hashSimilarity = this.calculateHashSimilarity(metadata.contentHash, currentContentHash);
    if (hashSimilarity < 0.8) { // Allow 20% content changes
      console.log(`[HnswSearchService] Content hash indicates significant changes (similarity: ${hashSimilarity.toFixed(2)})`);
      return false;
    }

    return true;
  }

  /**
   * Load index metadata from disk using Node.js filesystem
   */
  private async loadIndexMetadata(collectionName: string): Promise<IndexMetadata | null> {
    if (!this.persistentPath) {
      return null;
    }

    try {
      const fs = require('fs').promises;
      const path = require('path');
      const metadataPath = path.join(this.persistentPath, 'hnsw-indexes', `${collectionName}-metadata.json`);
      
      console.log(`[HnswSearchService] Looking for metadata at: ${metadataPath}`);
      
      // Check if file exists first
      const exists = await fs.access(metadataPath).then(() => true).catch(() => false);
      if (!exists) {
        console.log(`[HnswSearchService] No metadata file found at: ${metadataPath}`);
        return null;
      }
      
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      console.log(`[HnswSearchService] Successfully loaded metadata for ${collectionName}`);
      return JSON.parse(metadataContent) as IndexMetadata;
    } catch (error) {
      console.warn(`[HnswSearchService] Failed to load metadata for ${collectionName}:`, error);
      return null; // File doesn't exist or can't be read
    }
  }

  /**
   * Load index data from disk or create minimal index for quick startup
   */
  private async loadIndexData(collectionName: string, metadata: IndexMetadata): Promise<boolean> {
    // Since hnswlib-wasm doesn't currently support serialization, we'll use a hybrid approach:
    // 1. Create an empty index structure to reserve memory and prepare for incremental additions
    // 2. This avoids the full rebuild while still getting the performance benefit
    
    try {
      console.log(`[HnswSearchService] Creating optimized startup index for collection: ${collectionName}`);
      
      // Create an empty index with the correct dimensions and capacity
      if (metadata.isPartitioned) {
        // Create empty partitioned structure
        const partitions: HnswIndex[] = [];
        const itemToPartition = new Map<string, number>();
        
        const partitionCount = metadata.partitionCount || Math.ceil(metadata.itemCount / this.maxItemsPerPartition);
        
        for (let i = 0; i < partitionCount; i++) {
          const index = new this.hnswLib.HierarchicalNSW('cosine', metadata.dimension, '');
          const capacity = Math.max(this.maxItemsPerPartition + 1000, 60000);
          index.initIndex(metadata.dimension, 16, 200, capacity);
          
          partitions.push({
            index,
            idToItem: new Map(),
            itemIdToHnswId: new Map(),
            nextId: 0
          });
        }
        
        this.partitionedIndexes.set(collectionName, {
          partitions,
          itemToPartition,
          maxItemsPerPartition: this.maxItemsPerPartition,
          dimension: metadata.dimension
        });
      } else {
        // Create single empty index
        const index = new this.hnswLib.HierarchicalNSW('cosine', metadata.dimension, '');
        const capacity = Math.max(metadata.itemCount + 1000, 60000);
        index.initIndex(metadata.dimension, 16, 200, capacity);
        
        this.indexes.set(collectionName, {
          index,
          idToItem: new Map(),
          itemIdToHnswId: new Map(),
          nextId: 0
        });
      }
      
      console.log(`[HnswSearchService] Created empty optimized index structure for collection: ${collectionName}`);
      return true;
      
    } catch (error) {
      console.error(`[HnswSearchService] Failed to create optimized index structure:`, error);
      return false;
    }
  }

  /**
   * Add new items that weren't in the persisted index
   */
  private async addNewItemsToIndex(collectionName: string, currentItems: DatabaseItem[], metadata: IndexMetadata): Promise<void> {
    // Check if we have any new items beyond the persisted count
    const newItemsCount = currentItems.length - metadata.itemCount;
    if (newItemsCount <= 0) {
      console.log(`[HnswSearchService] No new items to add for collection: ${collectionName}`);
      return;
    }

    console.log(`[HnswSearchService] Adding ${newItemsCount} new items to existing index for collection: ${collectionName}`);
    
    // Sort items by ID for consistent ordering
    const sortedCurrentItems = currentItems.sort((a, b) => a.id.localeCompare(b.id));
    
    // Take only the new items (items beyond the persisted count)
    const newItems = sortedCurrentItems.slice(metadata.itemCount);
    
    // Add each new item to the existing index
    for (const item of newItems) {
      if (item.embedding && item.embedding.length > 0) {
        try {
          await this.addItemToIndex(collectionName, item);
        } catch (error) {
          console.warn(`[HnswSearchService] Failed to add new item ${item.id} to index:`, error);
        }
      }
    }
    
    console.log(`[HnswSearchService] Successfully added ${newItems.length} new items to index for collection: ${collectionName}`);
  }

  /**
   * Persist index metadata and data to disk using Node.js filesystem
   */
  private async persistIndex(collectionName: string, items: DatabaseItem[]): Promise<void> {
    if (!this.enablePersistence || !this.persistentPath) {
      return;
    }

    try {
      const fs = require('fs').promises;
      const path = require('path');
      const indexesDir = path.join(this.persistentPath, 'hnsw-indexes');
      
      console.log(`[HnswSearchService] Persisting metadata to: ${indexesDir}`);
      
      // Ensure directory exists using Node.js fs
      const dirExists = await fs.access(indexesDir).then(() => true).catch(() => false);
      if (!dirExists) {
        await fs.mkdir(indexesDir, { recursive: true });
        console.log(`[HnswSearchService] Created directory: ${indexesDir}`);
      }

      // Create metadata
      const metadata: IndexMetadata = {
        collectionName,
        itemCount: items.length,
        dimension: items.find(item => item.embedding && item.embedding.length > 0)?.embedding?.length || 0,
        lastModified: Date.now(),
        contentHash: this.calculateContentHash(items),
        isPartitioned: this.partitionedIndexes.has(collectionName),
        partitionCount: this.partitionedIndexes.get(collectionName)?.partitions.length
      };

      // Save metadata using Node.js fs
      const metadataPath = path.join(indexesDir, `${collectionName}-metadata.json`);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      // Cache metadata
      this.indexMetadataCache.set(collectionName, metadata);

      console.log(`[HnswSearchService] Successfully persisted metadata for collection: ${collectionName} at ${metadataPath}`);

    } catch (error) {
      console.warn(`[HnswSearchService] Failed to persist index for ${collectionName}:`, error);
    }
  }

  /**
   * Calculate content hash for change detection
   */
  private calculateContentHash(items: DatabaseItem[]): string {
    const crypto = require('crypto');
    
    // Sort items by ID for consistent hashing
    const sortedItems = items
      .map(item => ({ id: item.id, docLength: item.document?.length || 0 }))
      .sort((a, b) => a.id.localeCompare(b.id));
    
    const hashInput = JSON.stringify(sortedItems);
    return crypto.createHash('md5').update(hashInput).digest('hex');
  }

  /**
   * Calculate similarity between two hashes (simple implementation)
   */
  private calculateHashSimilarity(hash1: string, hash2: string): number {
    if (hash1 === hash2) return 1.0;
    
    // Simple character-based similarity
    let matches = 0;
    const length = Math.min(hash1.length, hash2.length);
    
    for (let i = 0; i < length; i++) {
      if (hash1[i] === hash2[i]) matches++;
    }
    
    return matches / Math.max(hash1.length, hash2.length);
  }

  /**
   * Clean up outdated persisted index files
   */
  private async cleanupPersistedIndex(collectionName: string): Promise<void> {
    if (!this.persistentPath) return;

    try {
      const fs = require('fs').promises;
      const path = require('path');
      const indexesDir = path.join(this.persistentPath, 'hnsw-indexes');
      
      const metadataPath = path.join(indexesDir, `${collectionName}-metadata.json`);
      const indexPath = path.join(indexesDir, `${collectionName}-index.dat`);
      
      await Promise.allSettled([
        fs.unlink(metadataPath),
        fs.unlink(indexPath)
      ]);
      
      this.indexMetadataCache.delete(collectionName);
      console.log(`[HnswSearchService] Cleaned up outdated index files for collection: ${collectionName}`);
      
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Force rebuild of index (public method for manual refresh)
   */
  async forceRebuildIndex(collectionName: string, items: DatabaseItem[]): Promise<void> {
    console.log(`[HnswSearchService] Force rebuilding index for collection: ${collectionName}`);
    await this.cleanupPersistedIndex(collectionName);
    await this.createIndexFromScratch(collectionName, items);
  }
}