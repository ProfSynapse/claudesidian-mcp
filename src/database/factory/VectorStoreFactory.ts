import { Plugin } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';
import { IEmbeddingProvider } from '../interfaces/IEmbeddingProvider';
import { IStorageOptions } from '../interfaces/IStorageOptions';
import { ChromaVectorStore } from '../providers/chroma/ChromaVectorStore';
import { ChromaEmbeddingProvider } from '../providers/chroma/ChromaEmbedding';
import { VectorStoreConfig } from '../models/VectorStoreConfig';
import { 
  WorkspaceCollection,
  MemoryTraceCollection,
  SessionCollection,
  SnapshotCollection,
  FileEmbeddingCollection
} from '../collections';

/**
 * Factory class for creating vector store instances and related services
 */
export class VectorStoreFactory {
  /**
   * Create a vector store instance
   * @param plugin Plugin instance
   * @param options Storage options
   * @returns Vector store instance
   */
  static createVectorStore(plugin: Plugin, options?: Partial<IStorageOptions>): IVectorStore {
    // Use default config if none provided
    const config = options ? 
      new VectorStoreConfig(options) : 
      VectorStoreConfig.getDefaultConfig(`${plugin.manifest.dir}`);
    
    // Create the vector store
    return new ChromaVectorStore(plugin, config);
  }
  
  /**
   * Create an embedding provider
   * @param apiKey Optional OpenAI API key
   * @param model Optional embedding model
   * @returns Embedding provider instance
   */
  static createEmbeddingProvider(
    apiKey?: string,
    model?: string
  ): IEmbeddingProvider {
    // If API key is provided, create OpenAI provider
    if (apiKey) {
      const OpenAIProvider = require('../providers/openai-provider').OpenAIProvider;
      const settings = {
        openaiApiKey: apiKey,
        embeddingModel: model || 'text-embedding-3-small',
        dimensions: 1536,
        apiRateLimitPerMinute: 3000,
        embeddingsEnabled: true
      };
      return new OpenAIProvider(settings);
    }
    
    // Otherwise create default Chroma provider
    return new ChromaEmbeddingProvider(undefined, 1536);
  }
  
  /**
   * Create workspace collection
   * @param vectorStore Vector store
   * @returns Workspace collection
   */
  static createWorkspaceCollection(vectorStore: IVectorStore): WorkspaceCollection {
    return new WorkspaceCollection(vectorStore);
  }
  
  /**
   * Create memory trace collection
   * @param vectorStore Vector store
   * @returns Memory trace collection
   */
  static createMemoryTraceCollection(vectorStore: IVectorStore): MemoryTraceCollection {
    return new MemoryTraceCollection(vectorStore);
  }
  
  /**
   * Create session collection
   * @param vectorStore Vector store
   * @returns Session collection
   */
  static createSessionCollection(vectorStore: IVectorStore): SessionCollection {
    return new SessionCollection(vectorStore);
  }
  
  /**
   * Create snapshot collection
   * @param vectorStore Vector store
   * @returns Snapshot collection
   */
  static createSnapshotCollection(vectorStore: IVectorStore): SnapshotCollection {
    return new SnapshotCollection(vectorStore);
  }
  
  /**
   * Create file embedding collection
   * @param vectorStore Vector store
   * @returns File embedding collection
   */
  static createFileEmbeddingCollection(vectorStore: IVectorStore): FileEmbeddingCollection {
    return new FileEmbeddingCollection(vectorStore);
  }
  
  /**
   * Create all standard collections
   * @param vectorStore Vector store
   * @returns Collection map
   */
  static createAllCollections(vectorStore: IVectorStore): {
    workspaces: WorkspaceCollection;
    memoryTraces: MemoryTraceCollection;
    sessions: SessionCollection;
    snapshots: SnapshotCollection;
    fileEmbeddings: FileEmbeddingCollection;
  } {
    return {
      workspaces: this.createWorkspaceCollection(vectorStore),
      memoryTraces: this.createMemoryTraceCollection(vectorStore),
      sessions: this.createSessionCollection(vectorStore),
      snapshots: this.createSnapshotCollection(vectorStore),
      fileEmbeddings: this.createFileEmbeddingCollection(vectorStore)
    };
  }
}