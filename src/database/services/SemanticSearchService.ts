import { Plugin } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';
import { FileEmbeddingCollection } from '../collections/FileEmbeddingCollection';
import { MemoryTraceCollection } from '../collections/MemoryTraceCollection';
import { EmbeddingService } from './EmbeddingService';
import { DirectCollectionService } from './DirectCollectionService';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Service for high-level semantic search orchestration
 * Extracted from ChromaSearchService following Single Responsibility Principle
 */
export class SemanticSearchService {
  /**
   * Vector store instance
   */
  private vectorStore: IVectorStore;
  
  /**
   * Collections for search-related data
   */
  private fileEmbeddings: FileEmbeddingCollection;
  private memoryTraces: MemoryTraceCollection;
  
  /**
   * Plugin instance
   */
  private plugin: Plugin;
  
  /**
   * Embedding service for generating embeddings
   */
  private embeddingService: EmbeddingService;
  
  /**
   * Direct collection service for low-level operations
   */
  private directCollectionService: DirectCollectionService;
  
  /**
   * Create a new semantic search service
   * @param plugin Plugin instance
   * @param vectorStore Vector store instance
   * @param embeddingService Embedding service
   */
  constructor(plugin: Plugin, vectorStore: IVectorStore, embeddingService: EmbeddingService) {
    this.plugin = plugin;
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    
    // Create collections
    this.fileEmbeddings = VectorStoreFactory.createFileEmbeddingCollection(vectorStore);
    this.memoryTraces = VectorStoreFactory.createMemoryTraceCollection(vectorStore);
    
    // Create direct collection service
    this.directCollectionService = new DirectCollectionService(plugin, vectorStore);
  }
  
  /**
   * Initialize the search service
   */
  async initialize(): Promise<void> {
    await Promise.all([
      this.fileEmbeddings.initialize(),
      this.memoryTraces.initialize()
    ]);
  }
  
  /**
   * Search files by similarity to query text
   * @param query Query text
   * @param options Search options
   */
  async searchFilesByText(query: string, options?: {
    workspaceId?: string;
    limit?: number;
    threshold?: number;
  }): Promise<Array<{
    file: any;
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
    file: any;
    similarity: number;
  }>> {
    return this.fileEmbeddings.searchEmbeddings(embedding, options);
  }
  
  /**
   * Perform semantic search across memory traces
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
    console.log('[SemanticSearchService] semanticSearch called with query:', query);
    try {
      // If skipEmbeddingGeneration flag is set or embeddings are disabled,
      // use direct text search without trying to generate embeddings
      if (options?.skipEmbeddingGeneration || !this.embeddingService.areEmbeddingsEnabled()) {
        return this.searchWithDirectText(query, options);
      }
      
      // For normal flow with embeddings enabled and no skip flag
      const embeddingsEnabled = this.embeddingService.areEmbeddingsEnabled();
      console.log('[semanticSearch] Embeddings enabled:', embeddingsEnabled);
      
      if (!embeddingsEnabled) {
        return {
          success: false,
          error: 'Embeddings functionality is currently disabled'
        };
      }
      
      // Generate embedding for the query
      console.log('[semanticSearch] Generating embedding for query:', query);
      const embedding = await this.embeddingService.getEmbedding(query);
      console.log('[semanticSearch] Generated embedding length:', embedding?.length);
      
      if (!embedding) {
        return {
          success: false,
          error: 'Failed to generate embedding for query'
        };
      }
      
      // Use the embedding for search
      console.log('[semanticSearch] About to call semanticSearchWithEmbedding with options:', options);
      const result = await this.semanticSearchWithEmbedding(embedding, options);
      console.log('[semanticSearch] Result from semanticSearchWithEmbedding:', result);
      
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
      
      // Return error result without matches
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
    console.log('[SemanticSearchService] semanticSearchWithEmbedding called');
    console.log('[SemanticSearchService] Embedding provided:', !!embedding);
    console.log('[SemanticSearchService] Collection name:', options?.collectionName);
    try {
      // If a specific collection is provided, use it directly
      if (options?.collectionName) {
        return this.searchSpecificCollection(embedding, options.collectionName, options);
      }
      
      // Otherwise, default to file embeddings collection for semantic search
      // Unless we're in a workspace context, then use memory traces
      const collectionToUse = options?.workspaceId ? this.memoryTraces.collectionName : this.fileEmbeddings.collectionName;
      console.log('[semanticSearchWithEmbedding] No specific collection provided, using:', collectionToUse);
      
      return this.searchDefaultCollection(embedding, collectionToUse, options);
    } catch (error) {
      console.error('Error in semantic search with embedding:', error);
      return {
        success: false,
        error: `Error performing semantic search with embedding: ${getErrorMessage(error)}`
      };
    }
  }
  
  /**
   * Search with direct text (no embedding generation)
   */
  private async searchWithDirectText(query: string, options?: any): Promise<{
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
      // Check if the searchDirectWithText method is available
      if (typeof this.memoryTraces.searchDirectWithText === 'function') {
        // If specific collection is provided, use the vector store's query method directly
        if (options?.collectionName) {
          const results = await this.directCollectionService.queryCollectionWithText(
            options.collectionName,
            query,
            options
          );
          
          return this.processDirectSearchResults(results, options?.threshold);
        }
        
        // Otherwise, use memory traces collection's direct text search
        const results = await this.memoryTraces.searchDirectWithText(query, {
          workspaceId: options?.workspaceId,
          workspacePath: options?.workspacePath,
          sessionId: options?.sessionId,
          limit: options?.limit,
          threshold: options?.threshold
        });
        
        // Process and return the results
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
      } else {
        // Direct text search is not available, fall back to a manual approach
        console.warn('searchDirectWithText method not available on MemoryTraceCollection - using fallback');
        
        // Use specified collection or default to memory traces
        const collectionName = options?.collectionName || this.memoryTraces.collectionName;
        const results = await this.directCollectionService.queryCollectionWithText(
          collectionName,
          query,
          options
        );
        
        return this.processDirectSearchResults(results, options?.threshold);
      }
    } catch (error) {
      console.error('Error in direct text search:', error);
      return {
        success: false,
        error: `Direct text search failed: ${getErrorMessage(error)}`
      };
    }
  }
  
  /**
   * Search a specific collection with embedding
   */
  private async searchSpecificCollection(
    embedding: number[],
    collectionName: string,
    options?: any
  ): Promise<{
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
    console.log('[SemanticSearchService] Querying specific collection:', collectionName);
    
    // Quick check if file_embeddings has any data
    if (collectionName === 'file_embeddings') {
      try {
        const testQuery = await this.directCollectionService.queryCollectionWithText('file_embeddings', 'test', { limit: 1 });
        console.log('[SemanticSearchService] file_embeddings has data:', (testQuery.ids?.[0]?.length || 0) > 0);
      } catch (e) {
        console.log('[SemanticSearchService] Error checking file_embeddings:', e);
      }
    }
    
    const results = await this.directCollectionService.queryCollectionWithEmbedding(
      collectionName,
      embedding,
      options
    );
    
    console.log('[semanticSearchWithEmbedding] Query results:', results);
    
    if (!results.ids[0]?.length) {
      return {
        success: true,
        matches: []
      };
    }
    
    // Process query results
    const matches: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart?: number;
      lineEnd?: number;
      metadata?: Record<string, any>;
    }> = [];
    
    for (let i = 0; i < results.ids[0].length; i++) {
      const distance = results.distances?.[0]?.[i] || 0;
      const metadata = results.metadatas?.[0]?.[i] || {};
      const document = results.documents?.[0]?.[i] || '';
      
      // Convert cosine distance to similarity: similarity = 1 - distance
      const similarity = Math.max(0, Math.min(1, 1 - distance));
      
      // Debug logging
      console.log(`[semanticSearchWithEmbedding] ChromaDB distance: ${distance}, converted similarity: ${similarity}, threshold: ${options?.threshold || 'none'}`);
      
      // Skip if below threshold
      if (options?.threshold !== undefined && similarity < options.threshold) {
        console.log(`[semanticSearchWithEmbedding] Skipping result with similarity ${similarity} below threshold ${options.threshold}`);
        continue;
      }
      
      const match = {
        similarity,
        content: document,
        filePath: metadata.path || metadata.workspacePath || '',
        lineStart: metadata.lineStart,
        lineEnd: metadata.lineEnd,
        metadata
      };
      matches.push(match);
    }
    
    return {
      success: true,
      matches
    };
  }
  
  /**
   * Search default collection with embedding
   */
  private async searchDefaultCollection(
    embedding: number[],
    collectionName: string,
    options?: any
  ): Promise<{
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
    const where: Record<string, any> = {};
    
    // Only add workspaceId filter if explicitly provided and not searching file_embeddings
    // File embeddings don't use workspace isolation effectively
    if (options?.workspaceId && collectionName !== this.fileEmbeddings.collectionName) {
      where['metadata.workspaceId'] = options.workspaceId;
    }
    
    if (options?.workspacePath) {
      const pathString = options.workspacePath.join('/');
      where['metadata.workspacePath'] = { $like: `${pathString}%` };
    }
    
    if (options?.sessionId) {
      where['metadata.sessionId'] = options.sessionId;
    }
    
    // Query the selected collection
    const results = await this.directCollectionService.queryCollectionWithEmbedding(
      collectionName,
      embedding,
      {
        ...options,
        filters: Object.keys(where).length > 0 ? where : undefined
      }
    );
    
    if (!results.ids[0]?.length) {
      return {
        success: true,
        matches: []
      };
    }
    
    // Process and return the results
    const matches: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart?: number;
      lineEnd?: number;
      metadata?: Record<string, any>;
    }> = [];
    
    for (let i = 0; i < results.ids[0].length; i++) {
      const distance = results.distances?.[0]?.[i] || 0;
      const metadata = results.metadatas?.[0]?.[i] || {};
      const document = results.documents?.[0]?.[i] || '';
      
      // Convert cosine distance to similarity: similarity = 1 - distance
      const similarity = Math.max(0, Math.min(1, 1 - distance));
      
      // Debug logging
      console.log(`[semanticSearchWithEmbedding 2] ChromaDB distance: ${distance}, converted similarity: ${similarity}, threshold: ${options?.threshold || 'none'}`);
      
      // Skip if below threshold
      if (options?.threshold !== undefined && similarity < options.threshold) {
        console.log(`[semanticSearchWithEmbedding 2] Skipping result with similarity ${similarity} below threshold ${options.threshold}`);
        continue;
      }
      
      // Handle different metadata structures based on collection type
      let filePath = '';
      if (collectionName === this.fileEmbeddings.collectionName) {
        // For file embeddings, the path is stored directly
        filePath = metadata.path || metadata.filePath || '';
      } else {
        // For memory traces, use workspacePath
        filePath = metadata.workspacePath || '';
      }
      
      const match = {
        similarity,
        content: document,
        filePath,
        lineStart: metadata.lineStart,
        lineEnd: metadata.lineEnd,
        metadata
      };
      matches.push(match);
    }
    
    return {
      success: true,
      matches
    };
  }
  
  /**
   * Process direct search results
   */
  private processDirectSearchResults(results: any, threshold?: number): {
    success: boolean;
    matches?: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart: number;
      lineEnd: number;
      metadata?: Record<string, any>;
    }>;
    error?: string;
  } {
    if (!results.ids[0]?.length) {
      return {
        success: true,
        matches: []
      };
    }
    
    // Process query results
    const matches: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart: number;
      lineEnd: number;
      metadata?: Record<string, any>;
    }> = [];
    
    for (let i = 0; i < results.ids[0].length; i++) {
      const distance = results.distances?.[0]?.[i] || 0;
      const metadata = results.metadatas?.[0]?.[i] || {};
      const document = results.documents?.[0]?.[i] || '';
      
      // Convert cosine distance to similarity: similarity = 1 - distance
      const similarity = Math.max(0, Math.min(1, 1 - distance));
      
      // Debug logging
      console.log(`[semanticSearch direct] ChromaDB distance: ${distance}, converted similarity: ${similarity}, threshold: ${threshold || 'none'}`);
      
      // Skip if below threshold
      if (threshold !== undefined && similarity < threshold) {
        console.log(`[semanticSearch direct] Skipping result with similarity ${similarity} below threshold ${threshold}`);
        continue;
      }
      
      matches.push({
        similarity,
        content: document,
        filePath: metadata.path || metadata.workspacePath || '',
        lineStart: metadata.lineStart || 0,
        lineEnd: metadata.lineEnd || 0,
        metadata
      });
    }
    
    return {
      success: true,
      matches
    };
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
    threshold?: number
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
      // Use semantic threshold from settings if not provided
      if (threshold === undefined) {
        threshold = (this.plugin as any).settingsManager?.getSettings()?.memory?.semanticThreshold ?? 0.5;
      }
      
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