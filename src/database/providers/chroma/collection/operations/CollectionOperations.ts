/**
 * CollectionOperations - Handles CRUD operations for collections
 * Follows Single Responsibility Principle by focusing only on data operations
 */

import { CollectionRepository } from '../../services/CollectionRepository';
import { VectorCalculator } from '../../services/VectorCalculator';
import { FilterEngine } from '../../services/FilterEngine';
import { ChromaAddParams, ChromaGetParams, ChromaUpdateParams, ChromaDeleteParams } from '../../PersistentChromaClient';

export interface CollectionOperationResult {
  success: boolean;
  error?: string;
}

export interface GetResult {
  ids: string[];
  embeddings?: number[][];
  metadatas?: Record<string, any>[];
  documents?: string[];
}

/**
 * Service responsible for collection data operations
 * Follows SRP by focusing only on CRUD operations
 */
export class CollectionOperations {
  private vectorCalculator: VectorCalculator;
  private filterEngine: FilterEngine;

  constructor(
    private repository: CollectionRepository,
    private embeddingFunction?: any
  ) {
    this.vectorCalculator = new VectorCalculator();
    this.filterEngine = new FilterEngine();
  }

  /**
   * Add items to the collection
   */
  async addItems(params: ChromaAddParams): Promise<CollectionOperationResult> {
    try {
      // Convert all params to arrays for consistent handling
      const ids = Array.isArray(params.ids) ? params.ids : [params.ids];
      const embeddings = params.embeddings ? (Array.isArray(params.embeddings[0]) 
        ? params.embeddings as number[][] 
        : [params.embeddings as number[]]) : [];
      
      const metadatas = params.metadatas ? (Array.isArray(params.metadatas) 
        ? params.metadatas as Record<string, any>[] 
        : [params.metadatas as Record<string, any>]) : [];
      
      const documents = params.documents ? (Array.isArray(params.documents) 
        ? params.documents as string[] 
        : [params.documents as string]) : [];

      // Add items through the repository
      this.repository.addItems(ids, embeddings, metadatas, documents);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to add items: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get items from the collection
   */
  async getItems(params: ChromaGetParams): Promise<GetResult> {
    const { ids, where, limit, offset, include = ['embeddings', 'metadatas', 'documents'] } = params;

    // Get filtered items
    const items = this.repository.getItems(ids, where, limit, offset);

    // Build result
    const result: GetResult = {
      ids: items.map((item: any) => item.id),
      embeddings: include.includes('embeddings') ? items.map((item: any) => item.embedding) : undefined,
      metadatas: include.includes('metadatas') ? items.map((item: any) => item.metadata) : undefined,
      documents: include.includes('documents') ? items.map((item: any) => item.document) : undefined
    };

    return result;
  }

  /**
   * Update items in the collection
   */
  async updateItems(params: ChromaUpdateParams): Promise<CollectionOperationResult> {
    try {
      const { ids, embeddings, metadatas, documents } = params;

      // Update items through the repository
      this.repository.updateItems(ids, embeddings, metadatas, documents);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update items: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Delete items from the collection
   */
  async deleteItems(params: ChromaDeleteParams): Promise<CollectionOperationResult> {
    try {
      const { ids, where } = params;

      // Delete items through the repository
      this.repository.deleteItems(ids, where);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete items: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Count items in the collection
   */
  async countItems(): Promise<number> {
    return this.repository.count();
  }

  /**
   * Get collection metadata
   */
  async getMetadata(): Promise<Record<string, any>> {
    return this.repository.getMetadata();
  }
}