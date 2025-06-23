/**
 * CollectionRepository - Manages in-memory collection data operations
 * Applies Single Responsibility Principle by focusing only on data management
 */

import { DatabaseItem } from './FilterEngine';
import { VectorCalculator } from './VectorCalculator';
import { FilterEngine, WhereClause } from './FilterEngine';

export interface CollectionData {
  items: Map<string, DatabaseItem>;
  metadata: Record<string, any>;
}

export interface ItemWithDistance {
  item: DatabaseItem;
  distance: number;
}

export class CollectionRepository {
  private items: Map<string, DatabaseItem>;
  private collectionMetadata: Record<string, any>;

  constructor(metadata: Record<string, any> = {}) {
    this.items = new Map();
    this.collectionMetadata = {
      ...metadata,
      createdAt: metadata.createdAt || new Date().toISOString()
    };
  }

  /**
   * Get all items as an array
   */
  getAllItems(): DatabaseItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Get collection data for persistence
   */
  getCollectionData(): CollectionData {
    return {
      items: new Map(this.items),
      metadata: { ...this.collectionMetadata }
    };
  }

  /**
   * Load collection data from persistence
   */
  loadCollectionData(data: CollectionData): void {
    this.items.clear();
    
    // Load items from Map or array format
    if (data.items instanceof Map) {
      for (const [id, item] of data.items) {
        this.items.set(id, item);
      }
    } else if (Array.isArray(data.items)) {
      // Handle array format for backward compatibility
      for (const item of data.items as DatabaseItem[]) {
        if (item && item.id) {
          this.items.set(item.id, {
            id: item.id,
            embedding: item.embedding || [],
            metadata: item.metadata || {},
            document: item.document || ''
          });
        }
      }
    }

    if (data.metadata) {
      this.collectionMetadata = { ...data.metadata };
    }
  }

  /**
   * Add items to the collection
   */
  addItems(
    ids: string[],
    embeddings: number[][],
    metadatas: Record<string, any>[],
    documents: string[]
  ): void {
    for (let i = 0; i < ids.length; i++) {
      this.items.set(ids[i], {
        id: ids[i],
        embedding: embeddings[i] || [],
        metadata: metadatas[i] || {},
        document: documents[i] || '',
      });
    }
  }

  /**
   * Get items by IDs or with filtering
   */
  getItems(
    ids?: string[],
    where?: WhereClause,
    limit?: number,
    offset?: number
  ): DatabaseItem[] {
    let items = this.getAllItems();

    // Filter by IDs if provided
    if (ids && ids.length > 0) {
      items = FilterEngine.filterByIds(items, ids);
    }

    // Filter by where clause
    items = FilterEngine.filterByWhere(items, where);

    // Apply pagination
    return FilterEngine.paginate(items, offset, limit);
  }

  /**
   * Update items in the collection
   */
  updateItems(
    ids: string[],
    embeddings?: number[][],
    metadatas?: Record<string, any>[],
    documents?: string[]
  ): void {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const item = this.items.get(id);

      if (item) {
        if (embeddings && embeddings[i]) {
          item.embedding = embeddings[i];
        }

        if (metadatas && metadatas[i]) {
          item.metadata = { ...item.metadata, ...metadatas[i] };
        }

        if (documents && documents[i]) {
          item.document = documents[i];
        }

        this.items.set(id, item);
      }
    }
  }

  /**
   * Delete items from the collection
   */
  deleteItems(ids?: string[], where?: WhereClause): void {
    if (ids) {
      for (const id of ids) {
        this.items.delete(id);
      }
    } else if (where) {
      // Delete by where filter
      const itemsToDelete = FilterEngine.filterByWhere(this.getAllItems(), where);
      for (const item of itemsToDelete) {
        this.items.delete(item.id);
      }
    }
  }

  /**
   * Query items with vector similarity
   */
  queryItems(
    queryEmbeddings: number[][],
    nResults: number = 10,
    where?: WhereClause
  ): ItemWithDistance[][] {
    const results: ItemWithDistance[][] = [];

    // Use query embeddings, or just return top results if no query provided
    const queries = queryEmbeddings.length > 0 ? queryEmbeddings : [[]];

    for (const queryEmbedding of queries) {
      // Filter items by where clause if provided
      let filteredItems = FilterEngine.filterByWhere(this.getAllItems(), where);

      // Calculate distances
      const itemsWithDistances = filteredItems.map(item => {
        let distance = 0;

        // If we have a query embedding and the item has an embedding, compute cosine distance
        if (queryEmbedding.length > 0 && item.embedding.length > 0) {
          distance = VectorCalculator.cosineDistance(queryEmbedding, item.embedding);
        } else {
          // If no embeddings to compare, use a high distance
          distance = 0.99;
        }

        return { item, distance };
      });

      // Sort by distance (lower is better)
      itemsWithDistances.sort((a, b) => a.distance - b.distance);

      // Take the top N results
      const topItems = itemsWithDistances.slice(0, Math.min(nResults, itemsWithDistances.length));

      results.push(topItems);
    }

    return results;
  }

  /**
   * Get the count of items in the collection
   */
  count(): number {
    return this.items.size;
  }

  /**
   * Get collection metadata
   */
  getMetadata(): Record<string, any> {
    return { ...this.collectionMetadata };
  }

  /**
   * Update collection metadata
   */
  updateMetadata(metadata: Record<string, any>): void {
    this.collectionMetadata = { ...this.collectionMetadata, ...metadata };
  }

  /**
   * Clear all items from the collection
   */
  clear(): void {
    this.items.clear();
  }

  /**
   * Check if an item exists by ID
   */
  hasItem(id: string): boolean {
    return this.items.has(id);
  }

  /**
   * Get a specific item by ID
   */
  getItem(id: string): DatabaseItem | undefined {
    return this.items.get(id);
  }
}