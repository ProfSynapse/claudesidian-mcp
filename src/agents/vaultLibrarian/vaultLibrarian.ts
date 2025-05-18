import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { VaultLibrarianConfig } from './config';
import {
  SearchContentMode,
  SearchTagMode,
  SearchPropertyMode,
  BatchSearchMode,
  SemanticSearchMode,
  CreateEmbeddingsMode,
  BatchCreateEmbeddingsMode,
  CombinedSearchMode
} from './modes';
import { EmbeddingProvider, MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';
import { OpenAIProvider } from '../../database/providers/openai-provider';
import { IndexingService } from '../../database/services/indexingService';

/**
 * Agent for searching and navigating the vault
 */
export class VaultLibrarianAgent extends BaseAgent {
  public app: App;
  private embeddingProvider: EmbeddingProvider | null = null;
  private indexingService: IndexingService | null = null;
  private settings: MemorySettings;
  private currentIndexingOperationId: string | null = null;
  private indexingInProgress: boolean = false;
  public activityEmbedder: any = null; // Add this property to store the ToolActivityEmbedder
  private usageStats = {
    tokensUsed: 0,
    lastReset: new Date().getTime(),
    modelUsage: {
      'text-embedding-3-small': 0,
      'text-embedding-3-large': 0
    },
    estimatedCost: 0
  };
  
  /**
   * Create a new VaultLibrarianAgent
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      VaultLibrarianConfig.name,
      VaultLibrarianConfig.description,
      VaultLibrarianConfig.version
    );
    
    this.app = app;
    
    // Initialize with default settings
    this.settings = { ...DEFAULT_MEMORY_SETTINGS };
    
    // Override some settings for the vault librarian specifically
    this.settings.embeddingsEnabled = false; // Disable by default until API key is provided
    this.settings.batchSize = 5;
    this.settings.processingDelay = 500;
    this.settings.reindexThreshold = 7;
    this.settings.maxTokensPerChunk = 8191; // Set token limit per chunk
    
    // Try to initialize provider if settings available
    try {
      if (app.plugins) {
        const plugin = app.plugins.getPlugin('claudesidian-mcp');
        if (plugin?.settings?.settings?.memory?.embeddingsEnabled && plugin.settings.settings.memory.openaiApiKey) {
          this.settings = plugin.settings.settings.memory;
          this.embeddingProvider = new OpenAIProvider(this.settings);
          
          // Initialize ToolActivityEmbedder with the provider
          if (this.embeddingProvider) {
            // Import required classes
            const { ToolActivityEmbedder } = require('../../database/tool-activity-embedder');
            this.activityEmbedder = new ToolActivityEmbedder(this.embeddingProvider);
            console.log("Activity embedder initialized in VaultLibrarianAgent constructor");
          }
        }
        
        // Try to get the services from the plugin
        if (plugin?.services) {
          if (plugin.services.indexingService) {
            this.indexingService = plugin.services.indexingService;
          }
          
          // Make sure the workspaceDb is initialized and accessible
          if (!plugin.workspaceDb && plugin.services.workspaceDb) {
            plugin.workspaceDb = plugin.services.workspaceDb;
            console.log("Attached workspaceDb from services to plugin instance");
          }
        }
      }
    } catch (error) {
      console.error("Error initializing embedding provider and activity embedder:", error);
      this.embeddingProvider = null;
      this.activityEmbedder = null;
    }
    
    // Register traditional search modes - these are always available
    this.registerMode(new SearchContentMode(app));
    this.registerMode(new SearchTagMode(app));
    this.registerMode(new SearchPropertyMode(app));
    this.registerMode(new BatchSearchMode(app));
    
    // Register embedding-based modes
    this.registerMode(new SemanticSearchMode(app));
    this.registerMode(new CombinedSearchMode(app));
    this.registerMode(new CreateEmbeddingsMode(app));
    this.registerMode(new BatchCreateEmbeddingsMode(app));
  }
  
  /**
   * Get the embedding provider
   * @returns The current embedding provider or null if embeddings are disabled
   */
  getProvider(): EmbeddingProvider | null {
    return this.embeddingProvider;
  }
  
  /**
   * Update the agent settings
   * @param settings New memory settings
   */
  updateSettings(settings: MemorySettings): void {
    this.settings = settings;
    
    // Clean up existing provider and activity embedder
    if (this.embeddingProvider && typeof (this.embeddingProvider as any).close === 'function') {
      (this.embeddingProvider as any).close();
      this.embeddingProvider = null;
      this.activityEmbedder = null;
    }
    
    // Create new provider if enabled
    if (settings.embeddingsEnabled && settings.openaiApiKey) {
      try {
        this.embeddingProvider = new OpenAIProvider(settings);
        
        // Initialize ToolActivityEmbedder with the new provider
        if (this.embeddingProvider) {
          // Import dynamically to avoid circular dependencies
          const { ToolActivityEmbedder } = require('../../database/tool-activity-embedder');
          this.activityEmbedder = new ToolActivityEmbedder(this.embeddingProvider);
          console.log("Activity embedder initialized in VaultLibrarianAgent");
        }
      } catch (error) {
        console.error('Error initializing embedding provider or activity embedder:', error);
        this.embeddingProvider = null;
        this.activityEmbedder = null;
      }
    }
  }
  
  /**
   * Set the indexing service
   * @param indexingService The indexing service to use
   */
  setIndexingService(indexingService: IndexingService): void {
    this.indexingService = indexingService;
  }
  
  /**
   * Initialize the VaultLibrarianAgent
   * This is called after the agent is registered with the agent manager
   */
  async initialize(): Promise<void> {
    await super.initialize();
    
    // Initialize activity embedder if needed
    if (this.embeddingProvider && !this.activityEmbedder) {
      try {
        const { ToolActivityEmbedder } = require('../../database/tool-activity-embedder');
        this.activityEmbedder = new ToolActivityEmbedder(this.embeddingProvider);
        
        if (typeof this.activityEmbedder.initialize === 'function') {
          await this.activityEmbedder.initialize();
        }
        
        console.log("Activity embedder initialized in VaultLibrarianAgent.initialize()");
      } catch (error) {
        console.error("Failed to initialize activity embedder:", error);
        this.activityEmbedder = null;
      }
    }
  }
  
  /**
   * Get the current indexing operation ID
   * @returns The current indexing operation ID or null if no indexing in progress
   */
  getCurrentIndexingOperationId(): string | null {
    return this.currentIndexingOperationId;
  }
  
  /**
   * Cancel the current indexing operation
   */
  cancelIndexing(): void {
    if (this.indexingService && this.currentIndexingOperationId) {
      // Use the indexing service to cancel the operation
      this.indexingService.cancelIndexing();
    }
    
    // Update our state
    this.indexingInProgress = false;
    this.currentIndexingOperationId = null;
  }
  
  /**
   * Index a file for semantic search
   * @param filePath Path to the file to index
   * @param force Whether to force re-indexing even if file hasn't changed
   * @returns Promise that resolves with indexing result
   */
  async indexFile(filePath: string, force: boolean = false): Promise<{
    success: boolean;
    filePath: string;
    chunks?: number;
    error?: string;
  }> {
    try {
      // Check if we have access to the indexing service
      if (!this.indexingService) {
        console.log("Getting indexingService from plugin");
        // Try to get the indexing service from the plugin
        const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
        if (plugin?.services?.indexingService) {
          this.indexingService = plugin.services.indexingService;
        } else {
          throw new Error("Indexing service not available");
        }
      }
      
      // Use the indexing service to index the file
      if (!this.indexingService) {
        throw new Error("Indexing service not available");
      }
      const result = await this.indexingService.indexFile(filePath, force);
      
      // Return the result
      return {
        success: result.success,
        filePath: result.filePath,
        chunks: result.chunks,
        error: result.error
      };
    } catch (error) {
      console.error(`Error indexing file ${filePath}:`, error);
      return {
        success: false,
        filePath,
        error: error.message
      };
    }
  }
  
  /**
   * Perform a combined search with semantic search and filters
   * @param query Search query
   * @param filters Optional filters to apply to search results
   * @param limit Maximum number of results to return
   * @param threshold Similarity threshold
   * @returns Promise that resolves with combined search results
   */
  async combinedSearch(
    query: string, 
    filters: Record<string, any> = {}, 
    limit: number = 10, 
    threshold: number = 0.7
  ): Promise<{
    success: boolean;
    matches?: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart?: number;
      lineEnd?: number;
      metadata?: Record<string, any>;
    }>;
    error?: string;
  }> {
    try {
      // This is a placeholder for the actual implementation
      // Actual implementation would combine semantic search with traditional search
      console.log(`Combined search for: ${query}, filters: ${JSON.stringify(filters)}, limit: ${limit}, threshold: ${threshold}`);
      
      // Simulate successful search with sample results
      return {
        success: true,
        matches: [
          {
            similarity: 0.95,
            content: `This is a matched content for "${query}"`,
            filePath: 'example/file1.md',
            lineStart: 1,
            lineEnd: 5,
            metadata: { tags: ['example', 'test'] }
          }
        ]
      };
    } catch (error) {
      console.error(`Error performing combined search for "${query}":`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get the current usage statistics
   * @returns Current usage statistics in the format expected by the UI
   */
  getUsageStats(): {
    tokensThisMonth: number;
    totalEmbeddings: number;
    dbSizeMB: number;
    lastIndexedDate: string;
    indexingInProgress: boolean;
    estimatedCost: number;
    modelUsage: {
      'text-embedding-3-small': number;
      'text-embedding-3-large': number;
    };
  } {
    // Try to get stats from the indexing service if available
    if (this.indexingService) {
      const indexingStats = this.indexingService.getUsageStats();
      return {
        tokensThisMonth: this.usageStats.tokensUsed,
        totalEmbeddings: indexingStats.totalEmbeddings || 0,
        dbSizeMB: indexingStats.dbSizeMB || 0,
        lastIndexedDate: indexingStats.lastIndexedDate || new Date(this.usageStats.lastReset).toISOString(),
        indexingInProgress: indexingStats.indexingInProgress || this.currentIndexingOperationId !== null,
        estimatedCost: this.usageStats.estimatedCost,
        modelUsage: this.usageStats.modelUsage
      };
    }
    
    // Fall back to local stats if indexing service not available
    return {
      tokensThisMonth: this.usageStats.tokensUsed,
      totalEmbeddings: 0, // Not tracked directly in this implementation
      dbSizeMB: 0, // Not tracked directly in this implementation
      lastIndexedDate: new Date(this.usageStats.lastReset).toISOString(),
      indexingInProgress: this.currentIndexingOperationId !== null,
      estimatedCost: this.usageStats.estimatedCost,
      modelUsage: this.usageStats.modelUsage
    };
  }
  
  /**
   * Update the token usage statistics
   * @param tokens Number of tokens to add to usage
   * @param details Optional detailed usage information
   */
  updateUsageStats(tokens: number, details?: {
    model?: string;
    cost?: number;
    modelUsage?: {[key: string]: number};
  }): void {
    this.usageStats.tokensUsed += tokens;
    
    // Update model-specific usage if provided
    if (details?.model) {
      const model = details.model as 'text-embedding-3-small' | 'text-embedding-3-large';
      if (this.usageStats.modelUsage[model] !== undefined) {
        this.usageStats.modelUsage[model] += tokens;
      }
    }
    
    // Update cost if provided
    if (details?.cost) {
      this.usageStats.estimatedCost += details.cost;
    } else if (details?.model) {
      // Calculate cost if not provided but model is
      const model = details.model as 'text-embedding-3-small' | 'text-embedding-3-large';
      const costPerThousand = this.settings.costPerThousandTokens?.[model as 'text-embedding-3-small' | 'text-embedding-3-large'] || 0;
      this.usageStats.estimatedCost += (tokens / 1000) * costPerThousand;
    }
    
    // If a full model usage snapshot is provided, use it instead
    if (details?.modelUsage) {
      for (const model in details.modelUsage) {
        if (this.usageStats.modelUsage[model as keyof typeof this.usageStats.modelUsage] !== undefined) {
          this.usageStats.modelUsage[model as keyof typeof this.usageStats.modelUsage] = 
            details.modelUsage[model];
        }
      }
    }
  }
  
  /**
   * Reset the usage statistics
   */
  resetUsageStats(): void {
    this.usageStats = {
      tokensUsed: 0,
      lastReset: new Date().getTime(),
      modelUsage: {
        'text-embedding-3-small': 0,
        'text-embedding-3-large': 0
      },
      estimatedCost: 0
    };
  }
  
  /**
   * Track token usage
   * @param tokenCount Number of tokens to track
   * @param details Optional detailed usage information
   */
  trackTokenUsage(tokenCount: number, details?: {
    model?: string;
    cost?: number;
    modelUsage?: {[key: string]: number};
  }): void {
    this.updateUsageStats(tokenCount, details);
  }
  
  /**
   * Reindex all files in the vault
   * @param operationId Optional operation ID for progress tracking
   */
  async reindexAll(operationId?: string): Promise<void> {
    // Generate an operation ID if not provided
    const opId = operationId || `reindex-all-${Date.now()}`;
    this.currentIndexingOperationId = opId;
    this.indexingInProgress = true;
    
    try {
      console.log(`Reindexing all files with operation ID: ${this.currentIndexingOperationId}`);
      
      // Check if we have access to the indexing service
      if (!this.indexingService) {
        console.log("Getting indexingService from plugin");
        // Try to get the indexing service from the plugin
        const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
        if (plugin?.services?.indexingService) {
          this.indexingService = plugin.services.indexingService;
        } else {
          throw new Error("Indexing service not available");
        }
      }
      
      // Use the indexing service to reindex all files
      if (!this.indexingService) {
        throw new Error("Indexing service not available");
      }
      await this.indexingService.reindexAll(opId);
      
      // The indexingService will manage its own progress tracking and completion
      // After it's done, we'll update our state
      this.indexingInProgress = false;
      this.currentIndexingOperationId = null;
    } catch (error) {
      console.error('Error reindexing all files:', error);
      this.indexingInProgress = false;
      this.currentIndexingOperationId = null;
      throw error;
    }
  }
  
  /**
   * Get all workspaces
   * @returns Promise that resolves with workspace objects
   */
  async getWorkspaces(): Promise<Array<{id: string; name: string}>> {
    // This is a placeholder for the actual implementation
    return [{
      id: 'default',
      name: 'Default Workspace'
    }];
  }
  
  /**
   * Clean up resources when the agent is unloaded
   */
  onunload(): void {
    try {
      // Clean up activity embedder if it exists
      if (this.activityEmbedder && typeof this.activityEmbedder.initialize === 'function') {
        console.log('Cleaning up activity embedder');
        this.activityEmbedder = null;
      }
      
      // Clean up embedding provider
      if (this.embeddingProvider && typeof (this.embeddingProvider as any).close === 'function') {
        (this.embeddingProvider as any).close();
        this.embeddingProvider = null;
      }
      
      // Call parent class onunload if it exists
      super.onunload?.();
      
      console.log('VaultLibrarian agent unloaded successfully');
    } catch (error) {
      console.error('Error unloading VaultLibrarian agent:', error);
    }
  }
}