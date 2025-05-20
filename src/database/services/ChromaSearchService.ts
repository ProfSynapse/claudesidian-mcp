import { Plugin, Notice } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';
import { FileEmbeddingCollection } from '../collections/FileEmbeddingCollection';
import { MemoryTraceCollection } from '../collections/MemoryTraceCollection';
import { EmbeddingService } from './EmbeddingService';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { FileEmbedding } from '../workspace-types';
import { v4 as uuidv4 } from 'uuid';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * ChromaDB implementation of the search service
 */
export class ChromaSearchService {
  /**
   * Vector store instance
   */
  public vectorStore: IVectorStore;
  
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
   * Create a new search service
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
   * Index a file for search
   * @param filePath Path to the file
   * @param workspaceId Optional workspace ID
   * @param metadata Optional metadata
   */
  async indexFile(filePath: string, workspaceId?: string, metadata?: any, showNotice: boolean = true): Promise<string> {
    // Extract the file name from the path for a more concise notice
    const fileName = filePath.split('/').pop() || filePath;
    
    // Show notice if enabled
    let notice: Notice | null = null;
    if (showNotice) {
      notice = new Notice(`Generating embedding for ${fileName}...`, 0);
    }
    
    // Read the file content
    let content: string;
    try {
      // Remove leading slash if present to normalize path
      const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      const file = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);
      // Check if it's a folder by testing if it's a TFolder (has children property)
      if (!file || 'children' in file) { // Check for folder-like behavior
        if (notice) notice.hide();
        throw new Error(`File not found or is a folder: ${normalizedPath}`);
      }
      
      // Cast to TFile type
      content = await this.plugin.app.vault.read(file as any);
    } catch (error) {
      if (notice) notice.hide();
      throw new Error(`Failed to read file: ${getErrorMessage(error)}`);
    }
    
    // Generate embedding for the content
    const embedding = await this.embeddingService.getEmbedding(content);
    
    if (!embedding) {
      if (notice) notice.hide();
      throw new Error('Failed to generate embedding for file');
    }
    
    // Delete existing embedding if any
    // The fileEmbeddings collection will handle path normalization internally
    const existing = await this.fileEmbeddings.getEmbeddingByPath(filePath);
    if (existing) {
      await this.fileEmbeddings.delete(existing.id);
      console.log(`Deleted existing embedding for file: ${filePath}`);
    }
    
    // Create new embedding
    const fileEmbedding: FileEmbedding = {
      id: uuidv4(),
      filePath,
      timestamp: Date.now(),
      workspaceId,
      vector: embedding,
      metadata: {
        ...metadata,
        fileSize: content.length,
        indexedAt: new Date().toISOString()
      }
    };
    
    await this.fileEmbeddings.add(fileEmbedding);
    
    // Update notice with completion message if it exists
    if (notice) {
      notice.setMessage(`Completed embedding for ${fileName}`);
      setTimeout(() => notice.hide(), 2000);
    }
    
    return fileEmbedding.id;
  }
  
  /**
   * Get an embedding for a file
   * @param filePath File path
   */
  async getFileEmbedding(filePath: string): Promise<FileEmbedding | undefined> {
    return this.fileEmbeddings.getEmbeddingByPath(filePath);
  }
  
  /**
   * Delete embedding for a file
   * @param filePath File path
   */
  /**
   * Batch index multiple files with progress reporting (deprecated)
   * @param filePaths Array of file paths to index
   * @param progressCallback Optional callback for progress updates
   * @returns Promise resolving to an array of created embedding IDs
   * @deprecated Use EmbeddingService.batchIndexFiles instead
   */
  async batchIndexFiles(filePaths: string[], progressCallback?: (current: number, total: number) => void): Promise<string[]> {
    console.warn('ChromaSearchService.batchIndexFiles is deprecated. Use EmbeddingService.batchIndexFiles instead.');
    
    // Get embedding service from plugin
    const plugin = this.plugin.app.plugins.plugins['claudesidian-mcp'];
    if (!plugin) {
      throw new Error('Plugin not found');
    }
    
    // Try to get embeddingService from plugin.services first
    const embeddingService = plugin.services?.embeddingService || plugin.embeddingService;
    if (!embeddingService || typeof embeddingService.batchIndexFiles !== 'function') {
      throw new Error('Embedding service not available');
    }
    
    // Forward to embedding service
    return embeddingService.batchIndexFiles(filePaths, progressCallback);
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
      lineStart: number; // We provide default values when undefined
      lineEnd: number;   // We provide default values when undefined
      metadata?: any;
    }>;
    error?: string;
  }> {
    try {
      // If skipEmbeddingGeneration flag is set or embeddings are disabled,
      // use direct text search without trying to generate embeddings
      if (options?.skipEmbeddingGeneration || !this.embeddingService.areEmbeddingsEnabled()) {
        // Use ChromaDB's direct text search functionality
        try {
          // Check if the searchDirectWithText method is available
          if (typeof this.memoryTraces.searchDirectWithText === 'function') {
            // If specific collection is provided, use the vector store's query method directly
            if (options?.collectionName) {
              const queryParams = {
                queryTexts: [query],
                nResults: options?.limit || 10,
                where: options?.filters ? options.filters : this.buildWhereClause(options?.workspaceId, options?.workspacePath),
                include: ['metadatas', 'documents', 'distances'] as Array<'embeddings' | 'metadatas' | 'documents' | 'distances'>
              };
              
              const results = await this.vectorStore.query(options.collectionName, queryParams);
              
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
                
                // Convert distance to similarity
                const similarity = 1 - distance;
                
                // Skip if below threshold
                if (options?.threshold !== undefined && similarity < options.threshold) {
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
            
            // Use ChromaDB's query method with queryTexts parameter
            const queryParams = {
              queryTexts: [query],
              nResults: options?.limit || 10,
              where: options?.filters ? options.filters : this.buildWhereClause(options?.workspaceId, options?.workspacePath),
              include: ['metadatas', 'documents', 'distances'] as Array<'embeddings' | 'metadatas' | 'documents' | 'distances'>
            };
            
            // Use specified collection or default to memory traces
            const collectionName = options?.collectionName || this.memoryTraces.collectionName;
            const results = await this.vectorStore.query(collectionName, queryParams);
            
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
              
              // Convert distance to similarity
              const similarity = 1 - distance;
              
              // Skip if below threshold
              if (options?.threshold !== undefined && similarity < options.threshold) {
                continue;
              }
              
              const match: {
                similarity: number;
                content: string;
                filePath: string;
                lineStart: number;
                lineEnd: number;
                metadata?: Record<string, any>;
              } = {
                similarity,
                content: document,
                filePath: metadata.path || metadata.workspacePath || '',
                lineStart: metadata.lineStart || 0,
                lineEnd: metadata.lineEnd || 0,
                metadata
              };
              matches.push(match);
            }
            
            return {
              success: true,
              matches
            };
          }
        } catch (error) {
          console.error('Error in direct text search:', error);
          return {
            success: false,
            error: `Direct text search failed: ${getErrorMessage(error)}`
          };
        }
      }
      
      // For normal flow with embeddings enabled and no skip flag
      // This path should never be taken when skipEmbeddingGeneration is true
      if (!this.embeddingService.areEmbeddingsEnabled()) {
        return {
          success: false,
          error: 'Embeddings functionality is currently disabled'
        };
      }
      
      // We explicitly don't want to generate embeddings for search operations
      return {
        success: false,
        error: 'Embedding generation for search queries is not supported'
      };
      
      /* All unreachable code removed */
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
    try {
      // If a specific collection is provided, use it directly
      if (options?.collectionName) {
        const queryParams = {
          queryEmbeddings: [embedding],
          nResults: options?.limit || 10,
          where: options?.filters ? options.filters : this.buildWhereClause(options?.workspaceId, options?.workspacePath),
          include: ['metadatas', 'documents', 'distances'] as Array<'embeddings' | 'metadatas' | 'documents' | 'distances'> as Array<'embeddings' | 'metadatas' | 'documents' | 'distances'>
        };
        
        const results = await this.vectorStore.query(options.collectionName, queryParams);
        
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
          
          // Convert distance to similarity
          const similarity = 1 - distance;
          
          // Skip if below threshold
          if (options?.threshold !== undefined && similarity < options.threshold) {
            continue;
          }
          
          const match: {
            similarity: number;
            content: string;
            filePath: string;
            lineStart?: number;
            lineEnd?: number;
            metadata?: Record<string, any>;
          } = {
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
      
      // Otherwise, use the memory traces collection by default
      const where: Record<string, any> = {};
      
      if (options?.workspaceId) {
        where['metadata.workspaceId'] = options.workspaceId;
      }
      
      if (options?.workspacePath) {
        const pathString = options.workspacePath.join('/');
        where['metadata.workspacePath'] = { $like: `${pathString}%` };
      }
      
      if (options?.sessionId) {
        where['metadata.sessionId'] = options.sessionId;
      }
      
      // Query the memory traces collection
      const results = await this.vectorStore.query(this.memoryTraces.collectionName, {
        queryEmbeddings: [embedding],
        nResults: options?.limit || 10,
        where: Object.keys(where).length > 0 ? where : undefined,
        include: ['metadatas', 'documents', 'distances'] as Array<'embeddings' | 'metadatas' | 'documents' | 'distances'>
      });
      
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
        
        // Convert distance to similarity
        const similarity = 1 - distance;
        
        // Skip if below threshold
        if (options?.threshold !== undefined && similarity < options.threshold) {
          continue;
        }
        
        const match: {
          similarity: number;
          content: string;
          filePath: string;
          lineStart?: number;
          lineEnd?: number;
          metadata?: Record<string, any>;
        } = {
          similarity,
          content: document,
          filePath: metadata.workspacePath || '',
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
    } catch (error) {
      console.error('Error in semantic search with embedding:', error);
      return {
        success: false,
        error: `Error performing semantic search with embedding: ${getErrorMessage(error)}`
      };
    }
  }
  
  /**
   * Combined search with filters
   * @param query Query text
   * @param filters Optional filters
   * @param limit Maximum results
   * @param threshold Similarity threshold
   */
  /**
   * Build a where clause for ChromaDB queries
   * @param workspaceId Optional workspace ID to filter by
   * @param workspacePath Optional workspace path to filter by
   * @returns ChromaDB where clause or undefined
   */
  private buildWhereClause(workspaceId?: string, workspacePath?: string[]): Record<string, any> | undefined {
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