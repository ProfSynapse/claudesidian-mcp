import { Plugin } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';
import { IEmbeddingProvider } from '../interfaces/IEmbeddingProvider';
import { IStorageOptions } from '../interfaces/IStorageOptions';
import { ChromaVectorStore } from '../providers/chroma/ChromaVectorStore';
import { ChromaVectorStoreModular } from '../providers/chroma/ChromaVectorStoreModular';
import { ChromaEmbeddingProvider } from '../providers/chroma/ChromaEmbedding';
import { VectorStoreConfig } from '../models/VectorStoreConfig';
import { EmbeddingProviderRegistry } from '../providers/registry/EmbeddingProviderRegistry';
import { MemorySettings } from '../../types';
import { EmbeddingService } from '../services/EmbeddingService';
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
  /**
   * Create a vector store instance
   * @param plugin Plugin instance
   * @param options Storage options
   * @param useModular Whether to use the modular implementation (default: true)
   * @returns Vector store instance
   */
  static createVectorStore(plugin: Plugin, options?: Partial<IStorageOptions>, useModular: boolean = true): IVectorStore {
    const config = options ? 
      new VectorStoreConfig(options) : 
      VectorStoreConfig.getDefaultConfig(`${plugin.manifest.dir}`);
    
    if (useModular) {
      return new ChromaVectorStoreModular(plugin, options);
    } else {
      // Keep legacy implementation for backwards compatibility
      return new ChromaVectorStore(plugin, config);
    }
  }

  /**
   * Create a modular vector store instance (new implementation)
   * @param plugin Plugin instance
   * @param options Storage options
   * @returns Modular vector store instance
   */
  static createModularVectorStore(plugin: Plugin, options?: Partial<IStorageOptions>): ChromaVectorStoreModular {
    return new ChromaVectorStoreModular(plugin, options);
  }

  /**
   * Create a legacy vector store instance (for backwards compatibility)
   * @param plugin Plugin instance
   * @param options Storage options
   * @returns Legacy vector store instance
   */
  static createLegacyVectorStore(plugin: Plugin, options?: Partial<IStorageOptions>): ChromaVectorStore {
    const config = options ? 
      new VectorStoreConfig(options) : 
      VectorStoreConfig.getDefaultConfig(`${plugin.manifest.dir}`);
    
    return new ChromaVectorStore(plugin, config);
  }
  
  /**
   * Create an embedding provider based on memory settings
   * @param settings Memory settings containing provider configuration
   * @returns Embedding provider instance
   */
  static async createEmbeddingProvider(settings: MemorySettings): Promise<IEmbeddingProvider> {
    const providerId = settings.apiProvider;
    const providerSettings = settings.providerSettings?.[providerId];
    
    if (!providerSettings || !providerSettings.apiKey) {
      return new ChromaEmbeddingProvider(undefined, 1536);
    }
    
    // Try to create provider using the registry
    const embeddingFunction = await EmbeddingProviderRegistry.createEmbeddingFunction(
      providerId,
      providerSettings
    );
    
    if (embeddingFunction) {
      // Wrap the Chroma embedding function in our IEmbeddingProvider interface
      return new ChromaEmbeddingProvider(
        embeddingFunction.generate.bind(embeddingFunction),
        providerSettings.dimensions,
        providerSettings.model
      );
    }
    
    // Fallback to default provider
    console.warn(`Failed to create ${providerId} provider, falling back to default`);
    return new ChromaEmbeddingProvider(undefined, providerSettings.dimensions || 1536);
  }
  
  /**
   * Create an embedding provider from legacy settings (for migration)
   * @param apiKey API key
   * @param model Model name
   * @returns Embedding provider instance
   * @deprecated Use createEmbeddingProvider with MemorySettings instead
   */
  static async createLegacyEmbeddingProvider(
    apiKey?: string,
    model?: string
  ): Promise<IEmbeddingProvider> {
    if (!apiKey) {
      return new ChromaEmbeddingProvider(undefined, 1536);
    }
    
    // Create a temporary settings object for the legacy provider
    const settings: MemorySettings = {
      enabled: true,
      embeddingsEnabled: true,
      apiProvider: 'openai',
      providerSettings: {
        openai: {
          apiKey,
          model: model || 'text-embedding-3-small',
          dimensions: 1536
        }
      },
      maxTokensPerMonth: 1000000,
      apiRateLimitPerMinute: 3000,
      chunkStrategy: 'paragraph',
      chunkSize: 512,
      chunkOverlap: 50,
      includeFrontmatter: true,
      excludePaths: [],
      minContentLength: 50,
      embeddingStrategy: 'manual',
      batchSize: 10,
      concurrentRequests: 3,
      processingDelay: 1000,
      dbStoragePath: '',
      autoCleanOrphaned: true,
      maxDbSize: 500,
      pruningStrategy: 'least-used',
      defaultResultLimit: 10,
      includeNeighbors: true,
      graphBoostFactor: 0.3,
      backlinksEnabled: true,
      useFilters: true,
      defaultThreshold: 0.3,
      autoCreateSessions: true,
      sessionNaming: 'timestamp',
      autoCheckpoint: false,
      checkpointInterval: 30,
      maxStates: 10,
      statePruningStrategy: 'oldest',
      costPerThousandTokens: {
        'text-embedding-3-small': 0.00002,
        'text-embedding-3-large': 0.00013
      }
    };
    
    return this.createEmbeddingProvider(settings);
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