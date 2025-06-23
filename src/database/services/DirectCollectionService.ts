import { Plugin } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';

/**
 * Service for direct ChromaDB collection query operations
 * Extracted from ChromaSearchService following Single Responsibility Principle
 */
export class DirectCollectionService {
  /**
   * Vector store instance
   */
  private vectorStore: IVectorStore;
  
  /**
   * Plugin instance
   */
  private plugin: Plugin;
  
  /**
   * Create a new direct collection service
   * @param plugin Plugin instance
   * @param vectorStore Vector store instance
   */
  constructor(plugin: Plugin, vectorStore: IVectorStore) {
    this.plugin = plugin;
    this.vectorStore = vectorStore;
  }
  
  /**
   * Directly query a collection
   * @param collectionName Name of the collection to query
   * @param queryParams Query parameters for ChromaDB
   * @returns Query results
   */
  async queryCollection(
    collectionName: string,
    queryParams: any
  ): Promise<any> {
    return this.vectorStore.query(collectionName, queryParams);
  }
  
  /**
   * Build a where clause for ChromaDB queries
   * @param workspaceId Optional workspace ID to filter by
   * @param workspacePath Optional workspace path to filter by
   * @returns ChromaDB where clause or undefined
   */
  buildWhereClause(workspaceId?: string, workspacePath?: string[]): Record<string, any> | undefined {
    const where: Record<string, any> = {};
    
    if (workspaceId) {
      where['metadata.workspaceId'] = workspaceId;
    }
    
    if (workspacePath && workspacePath.length > 0) {
      where['metadata.path'] = { $in: workspacePath };
    }
    
    return Object.keys(where).length > 0 ? where : undefined;
  }
  
  /**
   * Query a collection with embedding vector
   * @param collectionName Collection name
   * @param embedding Query embedding
   * @param options Query options
   */
  async queryCollectionWithEmbedding(
    collectionName: string,
    embedding: number[],
    options?: {
      limit?: number;
      threshold?: number;
      filters?: any;
      workspaceId?: string;
      workspacePath?: string[];
    }
  ): Promise<any> {
    const queryParams = {
      queryEmbeddings: [embedding],
      nResults: options?.limit || 10,
      where: options?.filters || this.buildWhereClause(options?.workspaceId, options?.workspacePath),
      include: ['metadatas', 'documents', 'distances'] as Array<'embeddings' | 'metadatas' | 'documents' | 'distances'>
    };
    
    return this.queryCollection(collectionName, queryParams);
  }
  
  /**
   * Query a collection with text
   * @param collectionName Collection name
   * @param queryText Query text
   * @param options Query options
   */
  async queryCollectionWithText(
    collectionName: string,
    queryText: string,
    options?: {
      limit?: number;
      threshold?: number;
      filters?: any;
      workspaceId?: string;
      workspacePath?: string[];
    }
  ): Promise<any> {
    const queryParams = {
      queryTexts: [queryText],
      nResults: options?.limit || 10,
      where: options?.filters || this.buildWhereClause(options?.workspaceId, options?.workspacePath),
      include: ['metadatas', 'documents', 'distances'] as Array<'embeddings' | 'metadatas' | 'documents' | 'distances'>
    };
    
    return this.queryCollection(collectionName, queryParams);
  }
  
  /**
   * Get collection metadata
   * @param collectionName Collection name
   */
  async getCollectionMetadata(collectionName: string): Promise<any> {
    // This would need to be implemented based on the vector store interface
    // For now, we'll return basic info
    return {
      name: collectionName,
      // Additional metadata could be retrieved from vector store
    };
  }
  
  /**
   * Check if collection exists
   * @param collectionName Collection name
   */
  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      // Try to query the collection with minimal parameters
      await this.queryCollection(collectionName, {
        queryTexts: ['test'],
        nResults: 1
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}