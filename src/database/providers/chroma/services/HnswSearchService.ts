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

/**
 * High-performance vector search using HNSW (Hierarchical Navigable Small World)
 * Provides O(log n) search instead of O(n) brute force
 */
export class HnswSearchService {
  private indexes: Map<string, HnswIndex> = new Map();
  private isInitialized: boolean = false;
  private hnswLib: any = null;
  private app?: App;
  private vectorStore?: IVectorStore;
  private embeddingService?: EmbeddingService;

  constructor(app?: App, vectorStore?: IVectorStore, embeddingService?: EmbeddingService) {
    this.app = app;
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
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
      console.log('[HnswSearchService] HNSW service initialized');
    } catch (error) {
      console.error('[HnswSearchService] Failed to initialize HNSW:', error);
      throw error;
    }
  }

  /**
   * Create or update HNSW index for a collection
   */
  async indexCollection(collectionName: string, items: DatabaseItem[]): Promise<void> {
    await this.initialize();

    if (items.length === 0) {
      console.log(`[HnswSearchService] No items to index for collection: ${collectionName}`);
      return;
    }

    // Determine embedding dimension from first item
    const firstEmbedding = items.find(item => item.embedding && item.embedding.length > 0)?.embedding;
    if (!firstEmbedding) {
      console.log(`[HnswSearchService] No valid embeddings found for collection: ${collectionName}`);
      return;
    }

    const dimension = firstEmbedding.length;
    console.log(`[HnswSearchService] Creating HNSW index for ${collectionName} with ${items.length} items, dimension: ${dimension}`);

    try {
      // Create new HNSW index using loaded library
      const index = new this.hnswLib.HierarchicalNSW('cosine', dimension, '');
      
      // Initialize with appropriate parameters for performance
      // dimensions, M, efConstruction, maxElements
      index.initIndex(dimension, 16, 200, items.length);
      
      const idToItem = new Map<number, DatabaseItem>();
      const itemIdToHnswId = new Map<string, number>();
      let nextId = 0;
      let skippedCount = 0;

      // Add all items to the index with detailed validation
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (!item.embedding) {
          console.warn(`[HnswSearchService] Item ${i} (${item.id}) - no embedding`);
          skippedCount++;
          continue;
        }
        
        if (item.embedding.length !== dimension) {
          console.warn(`[HnswSearchService] Item ${i} (${item.id}) - dimension mismatch: expected ${dimension}, got ${item.embedding.length}`);
          skippedCount++;
          continue;
        }
        
        // Detailed embedding validation
        const invalidValues = [];
        const validationResults = {
          hasNaN: false,
          hasInfinity: false,
          hasNonNumber: false,
          valueRange: { min: Infinity, max: -Infinity }
        };
        
        for (let j = 0; j < item.embedding.length; j++) {
          const val = item.embedding[j];
          
          if (typeof val !== 'number') {
            validationResults.hasNonNumber = true;
            invalidValues.push(`[${j}]: ${typeof val} (${val})`);
          } else if (isNaN(val)) {
            validationResults.hasNaN = true;
            invalidValues.push(`[${j}]: NaN`);
          } else if (!isFinite(val)) {
            validationResults.hasInfinity = true;
            invalidValues.push(`[${j}]: ${val > 0 ? 'Infinity' : '-Infinity'}`);
          } else {
            validationResults.valueRange.min = Math.min(validationResults.valueRange.min, val);
            validationResults.valueRange.max = Math.max(validationResults.valueRange.max, val);
          }
        }
        
        const isValidEmbedding = !validationResults.hasNaN && !validationResults.hasInfinity && !validationResults.hasNonNumber;
        
        if (!isValidEmbedding) {
          console.error(`[HnswSearchService] *** CORRUPTED EMBEDDING FOUND ***`);
          console.error(`  Item Index: ${i}`);
          console.error(`  Item ID: ${item.id}`);
          console.error(`  File Path: ${item.metadata?.filePath || 'unknown'}`);
          console.error(`  Embedding Length: ${item.embedding.length}`);
          console.error(`  Validation Results:`, validationResults);
          console.error(`  Invalid Values (first 10):`, invalidValues.slice(0, 10));
          console.error(`  Document Preview: ${item.document?.substring(0, 100)}...`);
          skippedCount++;
          continue;
        }
        
        const hnswId = nextId++;
        
        try {
          // Add to HNSW index
          index.addPoint(item.embedding, hnswId, false);
          
          // Store mappings
          idToItem.set(hnswId, item);
          itemIdToHnswId.set(item.id, hnswId);
          
          // Log successful addition for first few items
          if (i < 3) {
            console.log(`[HnswSearchService] Successfully added item ${i} (${item.id}), range: [${validationResults.valueRange.min.toFixed(4)}, ${validationResults.valueRange.max.toFixed(4)}]`);
          }
          
        } catch (error) {
          console.error(`[HnswSearchService] *** HNSW ADD POINT FAILED ***`);
          console.error(`  Item Index: ${i}`);
          console.error(`  Item ID: ${item.id}`);
          console.error(`  HNSW ID: ${hnswId}`);
          console.error(`  Error:`, error);
          console.error(`  Embedding Length: ${item.embedding.length}`);
          console.error(`  Embedding Range: [${validationResults.valueRange.min}, ${validationResults.valueRange.max}]`);
          console.error(`  First 10 values: [${item.embedding.slice(0, 10).join(', ')}]`);
          console.error(`  Last 10 values: [${item.embedding.slice(-10).join(', ')}]`);
          skippedCount++;
        }
      }

      // Log summary of skipped items
      if (skippedCount > 0) {
        console.warn(`[HnswSearchService] Skipped ${skippedCount} items with invalid embeddings (expected dimension: ${dimension})`);
      }

      // Store the complete index
      this.indexes.set(collectionName, {
        index,
        idToItem,
        itemIdToHnswId,
        nextId
      });

      console.log(`[HnswSearchService] Successfully indexed ${idToItem.size} items for collection: ${collectionName}`);
    } catch (error) {
      console.error(`[HnswSearchService] Failed to create index for collection ${collectionName}:`, error);
      throw error;
    }
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
      console.error(`[HnswSearchService] Failed to add item ${item.id} to index:`, error);
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
   * Perform fast HNSW search
   */
  async searchSimilar(
    collectionName: string,
    queryEmbedding: number[],
    nResults: number = 10,
    where?: WhereClause
  ): Promise<ItemWithDistance[]> {
    const indexData = this.indexes.get(collectionName);
    if (!indexData || queryEmbedding.length === 0) {
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

    try {
      // Set search parameter (higher = better recall, slower search)
      indexData.index.setEfSearch(Math.max(nResults * 2, 50));
      
      // Perform HNSW search - this is O(log n) instead of O(n)!
      // searchKnn expects: (queryEmbedding, k, filter) where filter can be null
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
      console.error(`[HnswSearchService] Search failed for collection ${collectionName}:`, error);
      return [];
    }
  }

  /**
   * Check if collection has an index
   */
  hasIndex(collectionName: string): boolean {
    return this.indexes.has(collectionName);
  }

  /**
   * Get index statistics
   */
  getIndexStats(collectionName: string): { itemCount: number; dimension: number } | null {
    const indexData = this.indexes.get(collectionName);
    if (!indexData) return null;

    return {
      itemCount: indexData.idToItem.size,
      dimension: indexData.index.getNumDimensions()
    };
  }

  /**
   * Remove index for collection
   */
  removeIndex(collectionName: string): void {
    this.indexes.delete(collectionName);
  }

  /**
   * Clear all indexes
   */
  clearAllIndexes(): void {
    this.indexes.clear();
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): { totalIndexes: number; totalItems: number } {
    let totalItems = 0;
    
    for (const indexData of this.indexes.values()) {
      totalItems += indexData.idToItem.size;
    }

    return {
      totalIndexes: this.indexes.size,
      totalItems
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
    threshold: number = 0.7,
    includeContent: boolean = false
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
  private createSnippet(content: string, maxLength: number = 300): string {
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
}