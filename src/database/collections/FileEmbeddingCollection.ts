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
    const metadata = {
      filePath: embedding.filePath,
      timestamp: embedding.timestamp,
      workspaceId: embedding.workspaceId || '',
      additionalMetadata: embedding.metadata ? JSON.stringify(embedding.metadata) : '{}',
      
      // Metadata field for searching
      isFileEmbedding: true,
    };
    
    return {
      id: embedding.id,
      embedding: embedding.vector,
      metadata
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
   * @returns File embedding if found
   */
  async getEmbeddingByPath(filePath: string): Promise<FileEmbedding | undefined> {
    const embeddings = await this.getAll({
      where: { filePath }
    });
    
    return embeddings.length > 0 ? embeddings[0] : undefined;
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
    const embedding = await this.getEmbeddingByPath(filePath);
    
    if (embedding) {
      await this.delete(embedding.id);
    }
  }
}