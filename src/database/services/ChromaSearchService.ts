import { IVectorStore } from '../interfaces/IVectorStore';
import { FileEmbeddingCollection } from '../collections/FileEmbeddingCollection';
import { MemoryTraceCollection } from '../collections/MemoryTraceCollection';
import { EmbeddingService } from './EmbeddingService';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { FileEmbedding } from '../workspace-types';
import { getErrorMessage } from '../../utils/errorUtils';
import { QueryResultProcessor } from '../utils/QueryResultProcessor';
import { CollectionManager } from './CollectionManager';

/**
 * ChromaDB implementation of the search service
 */
export class ChromaSearchService {
  /**
   * Collection manager for handling collections
   */
  private collectionManager: CollectionManager;
  
  /**
   * Vector store instance (for backward compatibility)
   */
  public get vectorStore() {
    return this.collectionManager.getVectorStore();
  }
  
  /**
   * Collections for search-related data
   */
  private fileEmbeddings: FileEmbeddingCollection;
  private memoryTraces: MemoryTraceCollection;
  
  /**
   * Embedding service for generating embeddings
   */
  private embeddingService: EmbeddingService;
  
  /**
   * Create a new search service
   * @param collectionManager Collection manager instance
   * @param embeddingService Embedding service
   */
  constructor(collectionManager: CollectionManager, embeddingService: EmbeddingService) {
    this.collectionManager = collectionManager;
    this.embeddingService = embeddingService;
    
    // Get collections from manager
    this.fileEmbeddings = collectionManager.getFileEmbeddingsCollection();
    this.memoryTraces = collectionManager.getMemoryTracesCollection();
  }
  
  /**
   * Initialize the search service
   */
  async initialize(): Promise<void> {
    await this.collectionManager.initialize();
  }
  
  /**
   * Add a file embedding to the collection
   * @param fileEmbedding File embedding to add
   */
  async addFileEmbedding(fileEmbedding: FileEmbedding): Promise<string> {
    // Delete existing embedding if any
    const existing = await this.fileEmbeddings.getEmbeddingByPath(fileEmbedding.filePath);
    if (existing) {
      await this.fileEmbeddings.delete(existing.id);
      console.log(`Deleted existing embedding for file: ${fileEmbedding.filePath}`);
    }
    
    await this.fileEmbeddings.add(fileEmbedding);
    return fileEmbedding.id;
  }

  /**
   * Index a file for search (backward compatibility method)
   * @param filePath Path to the file
   * @param workspaceId Optional workspace ID
   * @param metadata Optional metadata
   * @param showNotice Optional flag to show notice (ignored)
   * @deprecated Use EmbeddingService.indexFile instead
   */
  async indexFile(filePath: string, workspaceId?: string, metadata?: any, showNotice: boolean = true): Promise<string> {
    console.warn('ChromaSearchService.indexFile is deprecated. Use EmbeddingService.indexFile instead.');
    
    // Generate embedding for the content
    const embedding = await this.embeddingService.getEmbedding(filePath);
    
    if (!embedding) {
      throw new Error('Failed to generate embedding for file');
    }
    
    // Create file embedding object
    const fileEmbedding: FileEmbedding = {
      id: crypto.randomUUID(),
      filePath,
      timestamp: Date.now(),
      workspaceId,
      vector: embedding,
      metadata: {
        ...metadata,
        indexedAt: new Date().toISOString()
      }
    };
    
    return this.addFileEmbedding(fileEmbedding);
  }
  
  /**
   * Get an embedding for a file
   * @param filePath File path
   * @param chunkIndex Optional chunk index to retrieve a specific chunk
   */
  async getFileEmbedding(filePath: string, chunkIndex?: number): Promise<FileEmbedding | undefined> {
    return this.fileEmbeddings.getEmbeddingByPath(filePath, chunkIndex);
  }
  
  /**
   * Get all chunks for a file
   * @param filePath File path
   */
  async getFileChunks(filePath: string): Promise<FileEmbedding[]> {
    return this.fileEmbeddings.getAllFileChunks(filePath);
  }
  
  /**
   * Delete embedding for a file
   * @param filePath File path
   */
  async deleteFileEmbedding(filePath: string): Promise<void> {
    await this.fileEmbeddings.deleteEmbeddingByPath(filePath);
  }
  
  /**
   * Get all file embeddings
   */
  async getAllFileEmbeddings(): Promise<FileEmbedding[]> {
    return this.fileEmbeddings.getAll();
  }
  
  /**
   * Search files by similarity to query
   * @param query Query text
   * @param options Search options
   */
  async searchFilesByText(query: string, options?: {
    workspaceId?: string;
    limit?: number;
    threshold?: number;
  }): Promise<Array<{
    file: FileEmbedding;
    similarity: number;
  }>> {
    // Generate embedding for the query
    const embedding = await this.embeddingService.getEmbedding(query);
    
    if (!embedding) {
      return [];
    }
    
    // Search by embedding
    return this.searchFilesByEmbedding(embedding, options);
  }
  
  /**
   * Search files by embedding
   * @param embedding Query embedding
   * @param options Search options
   */
  async searchFilesByEmbedding(embedding: number[], options?: {
    workspaceId?: string;
    limit?: number;
    threshold?: number;
  }): Promise<Array<{
    file: FileEmbedding;
    similarity: number;
  }>> {
    return this.fileEmbeddings.searchEmbeddings(embedding, options);
  }
  
  /**
   * Perform semantic search across collections
   * @param query Query text
   * @param options Search options
   */
  async semanticSearch(query: string, options?: {
    workspaceId?: string;
    workspacePath?: string[];
    limit?: number;
    threshold?: number;
    sessionId?: string;
    useGraphBoost?: boolean;
    graphBoostFactor?: number;
    skipEmbeddingGeneration?: boolean;
    collectionName?: string;
    filters?: any;
  }): Promise<{
    success: boolean;
    matches?: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart: number;
      lineEnd: number;
      metadata?: any;
    }>;
    error?: string;
  }> {
    console.log('[ChromaSearchService] semanticSearch called with query:', query);
    try {
      // Handle direct text search when embeddings are disabled or skipped
      if (options?.skipEmbeddingGeneration || !this.embeddingService.areEmbeddingsEnabled()) {
        return this.performDirectTextSearch(query, options);
      }
      
      // Generate embedding for normal flow
      const embedding = await this.embeddingService.getEmbedding(query);
      if (!embedding) {
        return {
          success: false,
          error: 'Failed to generate embedding for query'
        };
      }
      
      // Use embedding-based search
      const result = await this.semanticSearchWithEmbedding(embedding, options);
      
      // Ensure all matches have required lineStart and lineEnd values
      if (result.success && result.matches) {
        return {
          success: true,
          matches: result.matches.map(match => ({
            similarity: match.similarity,
            content: match.content,
            filePath: match.filePath,
            lineStart: match.lineStart ?? 0,
            lineEnd: match.lineEnd ?? 0,
            metadata: match.metadata
          }))
        };
      }
      
      return {
        success: false,
        error: result.error || 'Search failed'
      };
    } catch (error) {
      console.error('Error in semantic search:', error);
      return {
        success: false,
        error: `Error performing semantic search: ${getErrorMessage(error)}`
      };
    }
  }

  /**
   * Perform direct text search without embeddings
   * @param query Query text
   * @param options Search options
   */
  private async performDirectTextSearch(query: string, options?: any): Promise<{
    success: boolean;
    matches?: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart: number;
      lineEnd: number;
      metadata?: any;
    }>;
    error?: string;
  }> {
    try {
      // Check if direct text search is available on memory traces
      if (typeof this.memoryTraces.searchDirectWithText === 'function') {
        if (options?.collectionName) {
          // Use vector store query directly for specific collection
          const queryParams = {
            queryTexts: [query],
            nResults: options?.limit || 10,
            where: options?.filters || QueryResultProcessor.buildWhereClause(
              options?.workspaceId, 
              options?.workspacePath, 
              options?.sessionId
            ),
            include: ['metadatas', 'documents', 'distances'] as Array<'embeddings' | 'metadatas' | 'documents' | 'distances'>
          };
          
          const results = await this.collectionManager.getVectorStore().query(options.collectionName, queryParams);
          const matches = QueryResultProcessor.processQueryResults(results, {
            threshold: options?.threshold,
            collectionType: options.collectionName === 'file_embeddings' ? 'file_embeddings' : 'memory_traces'
          });
          
          return {
            success: true,
            matches: matches.map(match => ({
              ...match,
              lineStart: match.lineStart ?? 0,
              lineEnd: match.lineEnd ?? 0
            }))
          };
        }
        
        // Use memory traces direct search
        const results = await this.memoryTraces.searchDirectWithText(query, {
          workspaceId: options?.workspaceId,
          workspacePath: options?.workspacePath,
          sessionId: options?.sessionId,
          limit: options?.limit,
          threshold: options?.threshold
        });
        
        return {
          success: true,
          matches: results.map(match => ({
            similarity: match.similarity,
            content: match.content || '',
            filePath: match.filePath || '',
            lineStart: match.lineStart || 0,
            lineEnd: match.lineEnd || 0,
            metadata: match.metadata || {}
          }))
        };
      }
      
      // Fallback to vector store query
      const collectionName = options?.collectionName || this.memoryTraces.collectionName;
      const queryParams = {
        queryTexts: [query],
        nResults: options?.limit || 10,
        where: options?.filters || QueryResultProcessor.buildWhereClause(
          options?.workspaceId, 
          options?.workspacePath, 
          options?.sessionId
        ),
        include: ['metadatas', 'documents', 'distances'] as Array<'embeddings' | 'metadatas' | 'documents' | 'distances'>
      };
      
      const results = await this.collectionManager.getVectorStore().query(collectionName, queryParams);
      const matches = QueryResultProcessor.processQueryResults(results, {
        threshold: options?.threshold,
        collectionType: collectionName === 'file_embeddings' ? 'file_embeddings' : 'memory_traces'
      });
      
      return {
        success: true,
        matches: matches.map(match => ({
          ...match,
          lineStart: match.lineStart ?? 0,
          lineEnd: match.lineEnd ?? 0
        }))
      };
    } catch (error) {
      console.error('Error in direct text search:', error);
      return {
        success: false,
        error: `Direct text search failed: ${getErrorMessage(error)}`
      };
    }
  }
  
  /**
   * Perform semantic search using a pre-computed embedding vector
   * @param embedding Pre-computed embedding vector
   * @param options Search options
   */
  async semanticSearchWithEmbedding(embedding: number[], options?: {
    workspaceId?: string;
    workspacePath?: string[];
    limit?: number;
    threshold?: number;
    sessionId?: string;
    useGraphBoost?: boolean;
    graphBoostFactor?: number;
    collectionName?: string;
    filters?: any;
  }): Promise<{
    success: boolean;
    matches?: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart?: number;
      lineEnd?: number;
      metadata?: any;
    }>;
    error?: string;
  }> {
    console.log('[ChromaSearchService] semanticSearchWithEmbedding called');
    try {
      // Determine collection to use
      const collectionName = options?.collectionName || 
        (options?.workspaceId ? this.memoryTraces.collectionName : this.fileEmbeddings.collectionName);
      
      // Build where clause
      const shouldFilterByWorkspace = collectionName !== 'file_embeddings' || options?.filters;
      const where = options?.filters || 
        (shouldFilterByWorkspace ? QueryResultProcessor.buildWhereClause(
          options?.workspaceId, 
          options?.workspacePath, 
          options?.sessionId
        ) : undefined);
      
      // Query parameters
      const queryParams = {
        queryEmbeddings: [embedding],
        nResults: options?.limit || 10,
        where,
        include: ['metadatas', 'documents', 'distances'] as Array<'embeddings' | 'metadatas' | 'documents' | 'distances'>
      };
      
      console.log('[ChromaSearchService] Querying collection:', collectionName);
      
      // Execute query
      const results = await this.collectionManager.getVectorStore().query(collectionName, queryParams);
      
      // Process results using QueryResultProcessor
      const matches = QueryResultProcessor.processQueryResults(results, {
        threshold: options?.threshold,
        collectionType: collectionName === 'file_embeddings' ? 'file_embeddings' : 'memory_traces'
      });
      
      return {
        success: true,
        matches
      };
    } catch (error) {
      console.error('Error in semantic search with embedding:', error);
      return {
        success: false,
        error: `Error performing semantic search with embedding: ${getErrorMessage(error)}`
      };
    }
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
    return this.collectionManager.getVectorStore().query(collectionName, queryParams);
  }

  /**
   * Combined search with filters
   * @param query Query text
   * @param filters Optional filters
   * @param limit Maximum results
   * @param threshold Similarity threshold
   */
  async combinedSearch(
    query: string, 
    filters: {
      tags?: string[];
      paths?: string[];
      properties?: Record<string, any>;
      dateRange?: {
        start?: string;
        end?: string;
      };
      graphOptions?: {
        useGraphBoost?: boolean;
        boostFactor?: number;
        maxDistance?: number;
        seedNotes?: string[];
      };
    } = {},
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<{
    success: boolean;
    matches?: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart: number;
      lineEnd: number;
      metadata?: any;
    }>;
    error?: string;
  }> {
    try {
      // Perform semantic search first
      const semanticResults = await this.semanticSearch(query, {
        limit: limit * 2,
        threshold,
        useGraphBoost: filters.graphOptions?.useGraphBoost,
        graphBoostFactor: filters.graphOptions?.boostFactor
      });
      
      if (!semanticResults.success || !semanticResults.matches) {
        return semanticResults;
      }
      
      // Apply filters
      let filtered = semanticResults.matches;
      
      // Filter by tags
      if (filters.tags && filters.tags.length > 0) {
        filtered = filtered.filter(m => {
          const fileTags = m.metadata?.tags || [];
          return filters.tags!.some(tag => fileTags.includes(tag));
        });
      }
      
      // Filter by paths
      if (filters.paths && filters.paths.length > 0) {
        filtered = filtered.filter(m => {
          return filters.paths!.some(path => m.filePath.startsWith(path));
        });
      }
      
      // Filter by properties
      if (filters.properties && Object.keys(filters.properties).length > 0) {
        filtered = filtered.filter(m => {
          const frontmatter = m.metadata?.frontmatter || {};
          return Object.entries(filters.properties!).every(([key, value]) => {
            if (Array.isArray(value)) {
              return value.includes(frontmatter[key]);
            }
            return frontmatter[key] === value;
          });
        });
      }
      
      // Filter by date range
      if (filters.dateRange) {
        const { start, end } = filters.dateRange;
        if (start || end) {
          const startDate = start ? new Date(start).getTime() : 0;
          const endDate = end ? new Date(end).getTime() : Date.now();
          
          filtered = filtered.filter(m => {
            const created = m.metadata?.frontmatter?.created;
            if (!created) return true; // Skip if no date
            
            // Handle different date formats
            const fileDate = created && (typeof created === 'string' || typeof created === 'number' || created instanceof Date)
                ? new Date(created as string | number | Date).getTime() 
                : 0;
            return fileDate >= startDate && fileDate <= endDate;
          });
        }
      }
      
      // Limit results
      filtered = filtered.slice(0, limit);
      
      return {
        success: true,
        matches: filtered
      };
    } catch (error) {
      return {
        success: false,
        error: `Error performing combined search: ${getErrorMessage(error)}`
      };
    }
  }
}