import { Plugin } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';
import { FileEmbeddingCollection } from '../collections/FileEmbeddingCollection';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { FileEmbedding } from '../workspace-types';

/**
 * Service for direct file embedding access operations
 * Extracted from ChromaSearchService following Single Responsibility Principle
 */
export class FileEmbeddingAccessService {
  /**
   * Vector store instance
   */
  private vectorStore: IVectorStore;
  
  /**
   * File embeddings collection
   */
  private fileEmbeddings: FileEmbeddingCollection;
  
  /**
   * Plugin instance
   */
  private plugin: Plugin;
  
  /**
   * Create a new file embedding access service
   * @param plugin Plugin instance
   * @param vectorStore Vector store instance
   */
  constructor(plugin: Plugin, vectorStore: IVectorStore) {
    this.plugin = plugin;
    this.vectorStore = vectorStore;
    
    // Create file embeddings collection
    this.fileEmbeddings = VectorStoreFactory.createFileEmbeddingCollection(vectorStore);
  }
  
  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    await this.fileEmbeddings.initialize();
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
   * Add a file embedding
   * @param embedding File embedding to add
   */
  async addFileEmbedding(embedding: FileEmbedding): Promise<void> {
    await this.fileEmbeddings.add(embedding);
  }
  
  /**
   * Check if a file has embeddings
   * @param filePath File path to check
   */
  async hasFileEmbedding(filePath: string): Promise<boolean> {
    const embedding = await this.getFileEmbedding(filePath);
    return !!embedding;
  }
  
  /**
   * Get embeddings count for a file
   * @param filePath File path
   */
  async getFileEmbeddingCount(filePath: string): Promise<number> {
    const chunks = await this.getFileChunks(filePath);
    return chunks.length;
  }
  
  /**
   * Search file embeddings by vector similarity
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
}