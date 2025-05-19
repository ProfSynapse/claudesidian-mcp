import { BaseAgent } from '../baseAgent';
import { VectorManagerConfig } from './config';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { ChromaSearchService } from '../../database/services/ChromaSearchService';
import { MemoryService } from '../../database/services/MemoryService';
import { createErrorMessage } from '../../utils/errorUtils';

// Import collection modes
import { CreateCollectionMode } from './modes/collection/createCollectionMode';
import { ListCollectionsMode } from './modes/collection/listCollectionsMode';
import { GetCollectionMode } from './modes/collection/getCollectionMode';
import { DeleteCollectionMode } from './modes/collection/deleteCollectionMode';
import { CollectionAddItemsMode } from './modes/collection/collectionAddItemsMode';

// Import embedding modes
import { CreateEmbeddingMode } from './modes/embedding/createEmbeddingMode';
import { GetEmbeddingMode } from './modes/embedding/getEmbeddingMode';
import { DeleteEmbeddingMode } from './modes/embedding/deleteEmbeddingMode';
import { BatchEmbeddingMode } from './modes/embedding/batchEmbeddingMode';

/**
 * Agent for managing vector collections and embeddings
 */
export class VectorManagerAgent extends BaseAgent {
  /**
   * Embedding service for generating and managing embeddings
   */
  private embeddingService!: EmbeddingService;

  /**
   * Search service for ChromaDB operations
   */
  private searchService!: ChromaSearchService;

  /**
   * Memory service for tracking operations
   */
  private memoryService!: MemoryService;

  /**
   * Create a new VectorManagerAgent
   * @param plugin Plugin instance for accessing shared services
   */
  constructor(public plugin?: any) {
    super(
      VectorManagerConfig.name,
      VectorManagerConfig.description,
      VectorManagerConfig.version
    );
    
    // Get services if plugin is defined
    if (plugin && plugin.services) {
      this.embeddingService = plugin.services.embeddingService;
      this.searchService = plugin.services.searchService;
      this.memoryService = plugin.services.memoryService;
    }
    
    // Register collection modes
    this.registerMode(new CreateCollectionMode(this));
    this.registerMode(new ListCollectionsMode(this));
    this.registerMode(new GetCollectionMode(this));
    this.registerMode(new DeleteCollectionMode(this));
    this.registerMode(new CollectionAddItemsMode(this));
    
    // Register embedding modes
    this.registerMode(new CreateEmbeddingMode(this));
    this.registerMode(new GetEmbeddingMode(this));
    this.registerMode(new DeleteEmbeddingMode(this));
    this.registerMode(new BatchEmbeddingMode(this));
  }
  
  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    await super.initialize();
    // No additional initialization needed
  }
  
  /**
   * Get the embedding service instance
   */
  getEmbeddingService(): EmbeddingService {
    return this.embeddingService;
  }
  
  /**
   * Get the search service instance
   */
  getSearchService(): ChromaSearchService {
    return this.searchService;
  }
  
  /**
   * Get the memory service instance
   */
  getMemoryService(): MemoryService {
    return this.memoryService;
  }
  
  /**
   * Get the vector store instance from the search service
   * @returns The vector store instance
   */
  getVectorStore(): any {
    if (!this.searchService) {
      throw new Error(createErrorMessage('Vector store error: ', 'Search service not initialized'));
    }
    return this.searchService['vectorStore'];
  }
}