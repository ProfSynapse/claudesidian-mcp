import { Plugin } from 'obsidian';
import { IEmbeddingProvider } from '../interfaces/IEmbeddingProvider';
import { IEmbeddingProviderService } from '../interfaces/IEmbeddingProviderService';
import { IChunkingService } from '../interfaces/IChunkingService';
import { IIndexingOrchestrator } from '../interfaces/IIndexingOrchestrator';
import { IFileContentService } from '../interfaces/IFileContentService';
import { IProgressNotificationService } from '../interfaces/IProgressNotificationService';
import { IVectorStoreOperationsService } from '../interfaces/IVectorStoreOperationsService';
import { ITokenUsageService } from '../interfaces/ITokenUsageService';
import { EmbeddingProviderService } from './EmbeddingProviderService';
import { ChunkingService } from './ChunkingService';
import { IndexingOrchestrator } from './IndexingOrchestrator';
import { FileContentService } from './FileContentService';
import { ProgressNotificationService } from './ProgressNotificationService';
import { VectorStoreOperationsService } from './VectorStoreOperationsService';
import { TokenUsageService } from './TokenUsageService';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';
import { IndexingStateManager } from './IndexingStateManager';

// Define an interface that extends Plugin with our custom properties
interface ClaudesidianPlugin extends Plugin {
  settings: {
    settings: {
      memory: MemorySettings;
    };
    saveSettings: () => Promise<void>;
  };
}

/**
 * Refactored EmbeddingService - now acts as a coordinator using dependency injection
 * Delegates complex operations to specialized services
 */
export class EmbeddingService {
  private plugin: Plugin;
  private settings: MemorySettings;
  private initialized: boolean = false;

  // Specialized services
  private embeddingProviderService: IEmbeddingProviderService;
  private chunkingService: IChunkingService;
  private indexingOrchestrator: IIndexingOrchestrator;
  private fileContentService: IFileContentService;
  private progressService: IProgressNotificationService;
  private vectorStoreService: IVectorStoreOperationsService;
  private tokenUsageService: ITokenUsageService;
  private stateManager: IndexingStateManager;

  /**
   * Create a new embedding service with dependency injection
   * @param plugin Plugin instance
   * @param services Optional pre-configured services for dependency injection
   */
  constructor(
    plugin: Plugin,
    services?: {
      embeddingProviderService?: IEmbeddingProviderService;
      chunkingService?: IChunkingService;
      fileContentService?: IFileContentService;
      progressService?: IProgressNotificationService;
      vectorStoreService?: IVectorStoreOperationsService;
      tokenUsageService?: ITokenUsageService;
    }
  ) {
    this.plugin = plugin;
    this.settings = { ...DEFAULT_MEMORY_SETTINGS };    // Initialize services - use provided ones or create defaults
    this.embeddingProviderService = services?.embeddingProviderService || new EmbeddingProviderService();
    this.chunkingService = services?.chunkingService || new ChunkingService();
    this.fileContentService = services?.fileContentService || new FileContentService(plugin);
    this.progressService = services?.progressService || new ProgressNotificationService();
    this.vectorStoreService = services?.vectorStoreService || new VectorStoreOperationsService(plugin);
      // TokenUsageService requires settings, eventManager, and plugin
    this.tokenUsageService = services?.tokenUsageService || new TokenUsageService(
      this.settings,
      (plugin as any).eventManager || { emit: () => {} }, // Fallback event manager
      plugin
    );

    // Create IndexingOrchestrator with all dependencies
    this.indexingOrchestrator = new IndexingOrchestrator(
      plugin,
      this.fileContentService,
      this.progressService,
      this.vectorStoreService,
      this.embeddingProviderService,
      this.chunkingService,
      this.tokenUsageService
    );

    this.stateManager = new IndexingStateManager(plugin);
    this.initializeSettings();
  }

  /**
   * Initialize settings from plugin
   */
  private initializeSettings(): void {
    try {
      const pluginAsClaudesidian = this.plugin as ClaudesidianPlugin;
      const pluginSettings = pluginAsClaudesidian?.settings?.settings?.memory || DEFAULT_MEMORY_SETTINGS;
      this.settings = pluginSettings;
      
      // Initialize embedding provider service with settings
      this.embeddingProviderService.initialize(this.settings);
      
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize EmbeddingService settings:", error);
      this.settings = { ...DEFAULT_MEMORY_SETTINGS, embeddingsEnabled: false };
      this.initialized = false;
    }
  }

  // ===== DELEGATION METHODS - Core Embedding Operations =====

  /**
   * Get the embedding provider
   */
  getProvider(): IEmbeddingProvider | null {
    return this.embeddingProviderService.getProvider();
  }

  /**
   * Get embedding for text
   * @param text Text to generate embedding for
   */
  async getEmbedding(text: string): Promise<number[] | null> {
    return await this.embeddingProviderService.getEmbedding(text);
  }

  /**
   * Get embeddings for multiple texts
   * @param texts Array of texts to generate embeddings for
   */
  async getEmbeddings(texts: string[]): Promise<number[][] | null> {
    return await this.embeddingProviderService.getEmbeddings(texts);
  }

  /**
   * Check if embeddings are enabled
   */
  areEmbeddingsEnabled(): boolean {
    return this.embeddingProviderService.areEmbeddingsEnabled();
  }

  /**
   * Calculate similarity between two embeddings
   * @param embedding1 First embedding
   * @param embedding2 Second embedding
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    return this.embeddingProviderService.calculateSimilarity(embedding1, embedding2);
  }

  // ===== DELEGATION METHODS - Indexing Operations =====

  /**
   * Batch index multiple files with progress reporting
   * @param filePaths Array of file paths to index
   * @param progressCallback Optional callback for progress updates
   * @returns Promise resolving to an array of created embedding IDs
   */
  async batchIndexFiles(filePaths: string[], progressCallback?: (current: number, total: number) => void): Promise<string[]> {
    const result = await this.indexingOrchestrator.batchIndexFiles(
      filePaths, 
      { purgeExisting: true }, // Default behavior for batch indexing
      progressCallback
    );
    return result.embeddingIds;
  }

  /**
   * Incrementally update embeddings for specific files without purging the entire collection
   * @param filePaths Array of file paths to update
   * @param progressCallback Optional callback for progress updates
   * @returns Promise resolving to an array of updated embedding IDs
   */
  async incrementalIndexFiles(filePaths: string[], progressCallback?: (current: number, total: number) => void): Promise<string[]> {
    const result = await this.indexingOrchestrator.incrementalIndexFiles(
      filePaths,
      undefined,
      progressCallback
    );
    return result.embeddingIds;
  }

  /**
   * Update embeddings for files that have changed (used by file modification queue)
   * @param filePaths Array of file paths that have been modified
   * @param progressCallback Optional callback for progress updates
   * @returns Promise resolving to array of updated embedding IDs
   */
  async updateFileEmbeddings(filePaths: string[], progressCallback?: (current: number, total: number) => void): Promise<string[]> {
    // Use incremental update instead of full reindexing
    return await this.incrementalIndexFiles(filePaths, progressCallback);
  }

  /**
   * Update only the changed chunks of a file based on content diff
   * @param filePath File path to update
   * @param oldContent Previous file content
   * @param newContent New file content
   * @param workspaceId Optional workspace ID
   * @returns Promise resolving to array of updated embedding IDs
   */
  async updateChangedChunks(filePath: string, oldContent: string, newContent: string, workspaceId?: string): Promise<string[]> {
    return await this.indexingOrchestrator.updateChangedChunks(
      filePath,
      oldContent,
      newContent,
      { workspaceId }
    );
  }

  /**
   * Check if there's a resumable indexing operation
   */
  async hasResumableIndexing(): Promise<boolean> {
    return await this.indexingOrchestrator.hasResumableIndexing();
  }

  /**
   * Resume a previously interrupted indexing operation
   */
  async resumeIndexing(progressCallback?: (current: number, total: number) => void): Promise<string[]> {
    const result = await this.indexingOrchestrator.resumeIndexing(progressCallback);
    return result.embeddingIds;
  }

  // ===== SETTINGS AND CONFIGURATION =====

  /**
   * Get current settings
   */
  getSettings(): MemorySettings {
    return this.settings;
  }

  /**
   * Update settings and initialize the appropriate embedding provider
   * @param settings Memory settings
   */
  async updateSettings(settings: MemorySettings): Promise<void> {
    this.settings = settings;
    
    // Update embedding provider service with new settings
    await this.embeddingProviderService.updateSettings(settings);
    
    // Save the settings
    this.saveSettings();
  }

  /**
   * Save settings to plugin
   */
  private saveSettings(): void {
    try {
      const pluginAsClaudesidian = this.plugin as ClaudesidianPlugin;
      if (pluginAsClaudesidian && pluginAsClaudesidian.settings) {
        pluginAsClaudesidian.settings.settings.memory = this.settings;
        pluginAsClaudesidian.settings.saveSettings();
      }
    } catch (saveError) {
      console.error('Error saving settings:', saveError);
    }
  }

  // ===== STATUS AND MONITORING =====

  /**
   * Get current indexing status
   */
  getIndexingStatus() {
    return this.indexingOrchestrator.getIndexingStatus();
  }

  /**
   * Cancel any ongoing indexing operation
   */
  async cancelIndexing(): Promise<void> {
    await this.indexingOrchestrator.cancelIndexing();
  }

  /**
   * Get token usage statistics (if provider supports it)
   */
  getTokenUsage() {
    return this.embeddingProviderService.getTokenUsage();
  }

  /**
   * Update token usage statistics (if provider supports it)
   */
  async updateTokenUsage(tokenCount: number, model?: string): Promise<void> {
    await this.embeddingProviderService.updateUsageStats(tokenCount, model);
  }

  // ===== UTILITY METHODS =====

  /**
   * Generate a hash of content for comparison
   * @param content The content to hash
   * @returns A hash string
   */
  hashContent(content: string): string {
    return this.chunkingService.generateContentHash(content);
  }

  /**
   * Check if any embeddings exist in the system
   * @returns Promise resolving to true if embeddings exist
   */
  async hasExistingEmbeddings(): Promise<boolean> {
    return await this.vectorStoreService.hasExistingEmbeddings();
  }

  /**
   * Clean up resources
   */
  onunload(): void {
    try {
      console.log('Embedding service unloaded successfully');
    } catch (error) {
      console.error('Error unloading embedding service:', error);
    }
  }

  // ===== DIRECT ACCESS TO SPECIALIZED SERVICES (for advanced use cases) =====

  /**
   * Get the embedding provider service
   * @returns IEmbeddingProviderService instance
   */
  getEmbeddingProviderService(): IEmbeddingProviderService {
    return this.embeddingProviderService;
  }

  /**
   * Get the chunking service
   * @returns IChunkingService instance
   */
  getChunkingService(): IChunkingService {
    return this.chunkingService;
  }

  /**
   * Get the indexing orchestrator
   * @returns IIndexingOrchestrator instance
   */
  getIndexingOrchestrator(): IIndexingOrchestrator {
    return this.indexingOrchestrator;
  }

  /**
   * Get the file content service
   * @returns IFileContentService instance
   */
  getFileContentService(): IFileContentService {
    return this.fileContentService;
  }

  /**
   * Get the vector store operations service
   * @returns IVectorStoreOperationsService instance
   */
  getVectorStoreService(): IVectorStoreOperationsService {
    return this.vectorStoreService;
  }

  /**
   * Get the token usage service
   * @returns ITokenUsageService instance
   */
  getTokenUsageService(): ITokenUsageService {
    return this.tokenUsageService;
  }
}
