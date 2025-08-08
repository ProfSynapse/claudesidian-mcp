import { Plugin } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';
import { IEmbeddingProvider } from '../interfaces/IEmbeddingProvider';
import { IStorageOptions } from '../interfaces/IStorageOptions';
import { ChromaVectorStoreModular as ChromaVectorStore } from '../providers/chroma/ChromaVectorStoreModular';
import { ChromaEmbeddingProvider } from '../providers/chroma/ChromaEmbedding';
import { VectorStoreConfig } from '../models/VectorStoreConfig';
import { EmbeddingProviderRegistry } from '../providers/registry/EmbeddingProviderRegistry';
import { MemorySettings } from '../../types';
import { EmbeddingService } from '../services/core/EmbeddingService';
import { 
  WorkspaceCollection,
  MemoryTraceCollection,
  SessionCollection,
  SnapshotCollection,
  FileEmbeddingCollection
} from '../collections';

// Import provider registrations
import '../providers/registry/providers';

/**
 * Factory class for creating vector store instances and related services
 */
export class VectorStoreFactory {
  // Singleton cache for embedding providers keyed by provider config
  private static embeddingProviderCache = new Map<string, IEmbeddingProvider>();
  /**
   * Create a vector store instance using the modular implementation
   * @param plugin Plugin instance
   * @param options Storage options
   * @returns Vector store instance
   */
  static createVectorStore(plugin: Plugin, options?: Partial<IStorageOptions>): IVectorStore {
    return new ChromaVectorStore(plugin, options);
  }

  
  /**
   * Create an embedding provider based on memory settings (with singleton caching)
   * @param settings Memory settings containing provider configuration
   * @returns Embedding provider instance
   */
  static async createEmbeddingProvider(settings: MemorySettings): Promise<IEmbeddingProvider> {
    const providerId = settings.apiProvider;
    const providerSettings = settings.providerSettings?.[providerId];
    
    // Check if provider settings exist
    if (!providerSettings) {
      throw new Error(`No provider settings found for ${providerId}. Provider settings with dimensions must be configured.`);
    }
    
    // Validate that dimensions are specified
    if (!providerSettings.dimensions) {
      throw new Error(`Embedding dimensions not specified for ${providerId}. Dimensions must match the actual model being used.`);
    }
    
    // Ollama doesn't require an API key, so don't check for it
    if (providerId !== 'ollama' && !providerSettings.apiKey) {
      throw new Error(`API key required for ${providerId} but not provided.`);
    }
    
    // Create cache key from provider configuration
    const cacheKey = this.generateProviderCacheKey(providerId, providerSettings);
    
    // Check if provider already exists in cache
    if (this.embeddingProviderCache.has(cacheKey)) {
      const cachedProvider = this.embeddingProviderCache.get(cacheKey)!;
      console.log(`Reusing existing ${providerId} embedding provider from cache`);
      return cachedProvider;
    }
    
    // Try to create provider using the registry
    const embeddingFunction = await EmbeddingProviderRegistry.createEmbeddingFunction(
      providerId,
      providerSettings
    );
    
    if (embeddingFunction) {
      // Wrap the Chroma embedding function in our IEmbeddingProvider interface
      const provider = new ChromaEmbeddingProvider(
        providerSettings.dimensions,
        embeddingFunction.generate.bind(embeddingFunction),
        providerSettings.model,
        providerId
      );
      
      // Cache the provider
      this.embeddingProviderCache.set(cacheKey, provider);
      
      return provider;
    }
    
    // No fallback - if provider creation fails, throw error
    throw new Error(`Failed to create ${providerId} provider. Check your provider configuration and API credentials.`);
  }
  
  /**
   * Generate a cache key for embedding provider based on configuration
   * @param providerId Provider ID
   * @param providerSettings Provider settings
   * @returns Cache key string
   */
  private static generateProviderCacheKey(providerId: string, providerSettings: any): string {
    return `${providerId}-${providerSettings.model}-${providerSettings.dimensions}-${providerSettings.apiKey ? 'auth' : 'noauth'}`;
  }
  
  /**
   * Clear embedding provider cache (useful for testing or settings changes)
   */
  static clearEmbeddingProviderCache(): void {
    this.embeddingProviderCache.clear();
  }
  
  
  /**
   * Create workspace collection
   * @param vectorStore Vector store instance
   * @param embeddingService Optional embedding service for real embeddings
   */
  static createWorkspaceCollection(vectorStore: IVectorStore, embeddingService?: EmbeddingService): WorkspaceCollection {
    return new WorkspaceCollection(vectorStore, embeddingService);
  }
  
  /**
   * Create memory trace collection
   */
  static createMemoryTraceCollection(vectorStore: IVectorStore): MemoryTraceCollection {
    return new MemoryTraceCollection(vectorStore);
  }
  
  /**
   * Create session collection
   * @param vectorStore Vector store instance
   * @param embeddingService Optional embedding service for real embeddings
   */
  static createSessionCollection(vectorStore: IVectorStore, embeddingService?: EmbeddingService): SessionCollection {
    return new SessionCollection(vectorStore, embeddingService);
  }
  
  /**
   * Create snapshot collection
   * @param vectorStore Vector store instance
   * @param embeddingService Optional embedding service for real embeddings
   */
  static createSnapshotCollection(vectorStore: IVectorStore, embeddingService?: EmbeddingService): SnapshotCollection {
    return new SnapshotCollection(vectorStore, embeddingService);
  }
  
  /**
   * Create file embedding collection
   */
  static createFileEmbeddingCollection(vectorStore: IVectorStore): FileEmbeddingCollection {
    return new FileEmbeddingCollection(vectorStore);
  }
  
  /**
   * Create all standard collections
   * @param vectorStore Vector store instance
   * @param embeddingService Optional embedding service for real embeddings
   */
  static createAllCollections(vectorStore: IVectorStore, embeddingService?: EmbeddingService): {
    workspaces: WorkspaceCollection;
    memoryTraces: MemoryTraceCollection;
    sessions: SessionCollection;
    snapshots: SnapshotCollection;
    fileEmbeddings: FileEmbeddingCollection;
  } {
    return {
      workspaces: this.createWorkspaceCollection(vectorStore, embeddingService),
      memoryTraces: this.createMemoryTraceCollection(vectorStore),
      sessions: this.createSessionCollection(vectorStore, embeddingService),
      snapshots: this.createSnapshotCollection(vectorStore, embeddingService),
      fileEmbeddings: this.createFileEmbeddingCollection(vectorStore)
    };
  }
}