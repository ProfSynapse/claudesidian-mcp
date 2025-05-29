import { IVectorStore } from '../interfaces/IVectorStore';
import { FileEmbeddingCollection } from '../collections/FileEmbeddingCollection';
import { MemoryTraceCollection } from '../collections/MemoryTraceCollection';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';

/**
 * Manages collection initialization and access
 */
export class CollectionManager {
  private fileEmbeddings: FileEmbeddingCollection;
  private memoryTraces: MemoryTraceCollection;
  private vectorStore: IVectorStore;

  constructor(vectorStore: IVectorStore) {
    this.vectorStore = vectorStore;
    this.fileEmbeddings = VectorStoreFactory.createFileEmbeddingCollection(vectorStore);
    this.memoryTraces = VectorStoreFactory.createMemoryTraceCollection(vectorStore);
  }

  /**
   * Initialize all collections
   */
  async initialize(): Promise<void> {
    await Promise.all([
      this.fileEmbeddings.initialize(),
      this.memoryTraces.initialize()
    ]);
  }

  /**
   * Get file embeddings collection
   */
  getFileEmbeddingsCollection(): FileEmbeddingCollection {
    return this.fileEmbeddings;
  }

  /**
   * Get memory traces collection
   */
  getMemoryTracesCollection(): MemoryTraceCollection {
    return this.memoryTraces;
  }

  /**
   * Get vector store instance
   */
  getVectorStore(): IVectorStore {
    return this.vectorStore;
  }
}