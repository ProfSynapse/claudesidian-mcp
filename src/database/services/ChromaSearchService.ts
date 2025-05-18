import { Plugin } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';
import { FileEmbeddingCollection } from '../collections/FileEmbeddingCollection';
import { MemoryTraceCollection } from '../collections/MemoryTraceCollection';
import { EmbeddingService } from './EmbeddingService';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { FileEmbedding } from '../workspace-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * ChromaDB implementation of the search service
 */
export class ChromaSearchService {
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
  async indexFile(filePath: string, workspaceId?: string, metadata?: any): Promise<string> {
    // Read the file content
    let content: string;
    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      // Check if it's a folder by testing if it's a TFolder (has children property)
      if (!file || 'children' in file) { // Check for folder-like behavior
        throw new Error(`File not found or is a folder: ${filePath}`);
      }
      
      // Cast to TFile type
      content = await this.plugin.app.vault.read(file as any);
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
    
    // Generate embedding for the content
    const embedding = await this.embeddingService.getEmbedding(content);
    
    if (!embedding) {
      throw new Error('Failed to generate embedding for file');
    }
    
    // Delete existing embedding if any
    const existing = await this.fileEmbeddings.getEmbeddingByPath(filePath);
    if (existing) {
      await this.fileEmbeddings.delete(existing.id);
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
    try {
      // Check if embeddings are enabled
      if (!this.embeddingService.areEmbeddingsEnabled()) {
        return {
          success: false,
          error: 'Embeddings functionality is currently disabled'
        };
      }
      
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.getEmbedding(query);
      if (!queryEmbedding) {
        throw new Error('Failed to generate embedding for query');
      }
      
      // Search for similar traces
      const searchResults = await this.memoryTraces.searchTraces(queryEmbedding, {
        workspaceId: options?.workspaceId,
        workspacePath: options?.workspacePath,
        sessionId: options?.sessionId,
        limit: options?.limit,
        threshold: options?.threshold
      });
      
      // Format the results
      const matches = searchResults.map(result => {
        // Access metadata safely
        const metadata = result.trace.metadata || {};
        
        // Extract tool metadata fields
        const toolMetadata = (metadata && typeof metadata === 'object' && 'tool' in metadata) 
          ? { ...metadata }
          : {};
          
        // Extract metadata with proper type checks
        const toolMetadataObj = (typeof toolMetadata === 'object' && toolMetadata !== null) ? toolMetadata : {};
        const relatedFiles = result.trace.metadata?.relatedFiles || [];
        const defaultFilePath = Array.isArray(relatedFiles) && relatedFiles.length > 0 ? relatedFiles[0] : '';
          
        // Create consistent result structure
        return {
          similarity: result.similarity,
          content: result.trace.content,
          filePath: (toolMetadataObj as any).filePath || defaultFilePath || '',
          lineStart: (toolMetadataObj as any).lineStart || 0,
          lineEnd: (toolMetadataObj as any).lineEnd || 0,
          metadata: result.trace.metadata
        };
      });
      
      // Apply graph boosting if requested
      if (options?.useGraphBoost && matches.length > 0) {
        try {
          // Import graph operations
          const { GraphOperations } = await import('../utils/graph/GraphOperations');
          const graphOps = new GraphOperations();
          
          // Apply boost
          // This is a placeholder - actual implementation would depend on GraphOperations class
          // We're simulating the boost here
          console.log('Graph boost requested but not fully implemented');
        } catch (boostError) {
          console.error('Error applying graph boost:', boostError);
        }
      }
      
      return {
        success: true,
        matches
      };
    } catch (error) {
      console.error('Error in semantic search:', error);
      return {
        success: false,
        error: `Error performing semantic search: ${error.message}`
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
        error: `Error performing combined search: ${error.message}`
      };
    }
  }
}