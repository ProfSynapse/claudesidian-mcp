import { BaseChromaCollection } from '../providers/chroma/ChromaCollections';
import { IVectorStore } from '../interfaces/IVectorStore';
import { FileEmbedding } from '../workspace-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Collection manager for file embeddings
 */
export class FileEmbeddingCollection extends BaseChromaCollection<FileEmbedding> {
  /**
   * Create a new file embedding collection
   * @param vectorStore Vector store instance
   */
  constructor(vectorStore: IVectorStore) {
    super(vectorStore, 'file_embeddings');
  }
  
  /**
   * Normalize a file path for consistent storage and lookup
   * @param filePath File path to normalize
   * @returns Normalized path without leading slash
   */
  private normalizePath(filePath: string): string {
    return filePath.startsWith('/') ? filePath.slice(1) : filePath;
  }
  
  /**
   * Extract ID from a file embedding
   * @param embedding File embedding object
   * @returns Embedding ID
   */
  protected extractId(embedding: FileEmbedding): string {
    return embedding.id;
  }
  
  /**
   * Convert a file embedding to storage format
   * @param embedding File embedding object
   * @returns Storage object
   */
  protected itemToStorage(embedding: FileEmbedding): {
    id: string;
    embedding: number[];
    metadata: Record<string, any>;
    document?: string;
  } {
    // Extract important metadata fields for filtering and searching
    // Normalize the file path for consistent storage
    const normalizedPath = this.normalizePath(embedding.filePath);
    
    const metadata = {
      filePath: normalizedPath,
      timestamp: embedding.timestamp,
      workspaceId: embedding.workspaceId || '',
      additionalMetadata: embedding.metadata ? JSON.stringify(embedding.metadata) : '{}',
      
      // Chunk metadata for split files
      chunkIndex: embedding.chunkIndex ?? 0,
      totalChunks: embedding.totalChunks ?? 1,
      
      // Metadata field for searching
      isFileEmbedding: true,
    };
    
    // Create document object
    const document = embedding.content || undefined;
    
    return {
      id: embedding.id,
      embedding: embedding.vector,
      metadata,
      document
    };
  }
  
  /**
   * Convert from storage format to file embedding
   * @param storage Storage object
   * @returns File embedding object
   */
  protected storageToItem(storage: {
    id: string;
    embedding?: number[];
    metadata?: Record<string, any>;
    document?: string;
  }): FileEmbedding {
    // If no metadata or embedding is provided, we'll create a minimal embedding
    if (!storage.metadata || !storage.embedding) {
      return {
        id: storage.id,
        filePath: '',
        timestamp: Date.now(),
        vector: storage.embedding || []
      };
    }
    
    // Reconstruct the file embedding from metadata
    return {
      id: storage.id,
      filePath: storage.metadata.filePath,
      timestamp: storage.metadata.timestamp,
      workspaceId: storage.metadata.workspaceId || undefined,
      vector: storage.embedding,
      // Add chunk metadata if available
      chunkIndex: storage.metadata.chunkIndex !== undefined ? storage.metadata.chunkIndex : 0,
      totalChunks: storage.metadata.totalChunks !== undefined ? storage.metadata.totalChunks : 1,
      // Add content if available
      content: storage.document,
      metadata: storage.metadata.additionalMetadata ? 
        JSON.parse(storage.metadata.additionalMetadata) : undefined
    };
  }
  
  /**
   * Create a new file embedding
   * @param embedding File embedding data without ID
   * @returns Created file embedding with generated ID
   */
  async createEmbedding(embedding: Omit<FileEmbedding, 'id'>): Promise<FileEmbedding> {
    const id = uuidv4();
    const newEmbedding: FileEmbedding = {
      ...embedding,
      id,
      timestamp: embedding.timestamp || Date.now()
    };
    
    await this.add(newEmbedding);
    return newEmbedding;
  }
  
  /**
   * Get embedding by file path
   * @param filePath File path
   * @param chunkIndex Optional chunk index to retrieve specific chunk
   * @returns File embedding if found
   */
  async getEmbeddingByPath(filePath: string, chunkIndex?: number): Promise<FileEmbedding | undefined> {
    // Normalize the path for lookup to ensure consistent matching
    const normalizedPath = this.normalizePath(filePath);
    
    // Build where clause - either get specific chunk or first chunk
    const where: Record<string, any> = { filePath: normalizedPath };
    if (chunkIndex !== undefined) {
      where.chunkIndex = chunkIndex;
    }
    
    const embeddings = await this.getAll({ where });
    
    return embeddings.length > 0 ? embeddings[0] : undefined;
  }
  
  /**
   * Get all chunks for a file
   * @param filePath File path
   * @returns Array of file embedding chunks
   */
  async getAllFileChunks(filePath: string): Promise<FileEmbedding[]> {
    // Normalize the path for lookup
    const normalizedPath = this.normalizePath(filePath);
    
    // Get all chunks for this file, sorted by chunk index
    const embeddings = await this.getAll({
      where: { filePath: normalizedPath }
    });
    
    return embeddings.sort((a, b) => 
      (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0)
    );
  }
  
  /**
   * Get embeddings for a workspace
   * @param workspaceId Workspace ID
   * @returns File embeddings for the workspace
   */
  async getEmbeddingsByWorkspace(workspaceId: string): Promise<FileEmbedding[]> {
    const embeddings = await this.getAll({
      where: { workspaceId }
    });
    
    return embeddings;
  }
  
  /**
   * Search embeddings by similarity
   * @param embedding Query embedding
   * @param options Search options
   * @returns Similar file embeddings
   */
  async searchEmbeddings(embedding: number[], options?: {
    workspaceId?: string;
    limit?: number;
    threshold?: number;
  }): Promise<Array<{
    file: FileEmbedding;
    similarity: number;
  }>> {
    // Build where clause for filtering
    const where: Record<string, any> = {};
    
    if (options?.workspaceId) {
      where.workspaceId = options.workspaceId;
    }
    
    // Query by similarity
    const results = await this.query(embedding, {
      limit: options?.limit || 10,
      threshold: options?.threshold || 0.7,
      where: Object.keys(where).length > 0 ? where : undefined
    });
    
    // Map to the expected return format
    return results.map(result => ({
      file: result.item,
      similarity: result.similarity
    }));
  }
  
  /**
   * Delete embedding by file path
   * @param filePath File path
   */
  async deleteEmbeddingByPath(filePath: string): Promise<void> {
    // Normalize the path for consistent lookup
    const normalizedPath = this.normalizePath(filePath);
    const embedding = await this.getEmbeddingByPath(normalizedPath);
    
    if (embedding) {
      await this.delete(embedding.id);
    }
  }
  
  /**
   * Delete all embeddings for multiple file paths
   * @param filePaths Array of file paths to delete
   * @returns Number of embeddings deleted
   */
  async deleteEmbeddingsByPaths(filePaths: string[]): Promise<number> {
    if (!filePaths || filePaths.length === 0) {
      return 0;
    }
    
    // Normalize all paths for consistent lookup
    const normalizedPaths = filePaths.map(path => this.normalizePath(path));
    
    // Find all embeddings that match the paths
    const allEmbeddings = await this.getAll();
    const embeddingsToDelete = allEmbeddings.filter(embedding => 
      normalizedPaths.includes(this.normalizePath(embedding.filePath))
    );
    
    if (embeddingsToDelete.length === 0) {
      return 0;
    }
    
    // Delete all matched embeddings
    const ids = embeddingsToDelete.map(e => e.id);
    await this.deleteBatch(ids);
    
    return embeddingsToDelete.length;
  }
}