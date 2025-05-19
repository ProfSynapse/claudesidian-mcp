import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { VaultLibrarianConfig } from './config';
import {
  SearchMode,
  VectorMode,
  BatchMode,
  DiagnosticMode
} from './modes';
import { EmbeddingProvider, MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';
import { OpenAIProvider } from '../../database/providers/openai-provider';
import { EmbeddingServiceAdapter } from '../../database/services/EmbeddingServiceAdapter';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { WorkspaceService } from '../../database/services/WorkspaceService';
import { MemoryService } from '../../database/services/MemoryService';
import { ChromaSearchService } from '../../database/services/ChromaSearchService';

/**
 * Agent for searching and navigating the vault
 */
export class VaultLibrarianAgent extends BaseAgent {
  public app: App;
  private embeddingProvider: EmbeddingProvider | null = null;
  private indexingService: EmbeddingServiceAdapter | null = null;
  private embeddingService: EmbeddingService | null = null;
  private workspaceService: WorkspaceService | null = null;
  private memoryService: MemoryService | null = null;
  private searchService: ChromaSearchService | null = null;
  private settings: MemorySettings;
  private currentIndexingOperationId: string | null = null;
  private indexingInProgress: boolean = false;
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
    
    // Define plugin outside the try-catch to make it accessible for all modes
    let plugin = null;
    try {
      if (app.plugins) {
        plugin = app.plugins.getPlugin('claudesidian-mcp');
        if (plugin?.settings?.settings?.memory?.embeddingsEnabled && plugin.settings.settings.memory.openaiApiKey) {
          this.settings = plugin.settings.settings.memory;
          this.embeddingProvider = new OpenAIProvider(this.settings);
        }
        
        // Get services from the plugin
        if (plugin?.services) {
          // Get indexing service
          if (plugin.services.indexingService) {
            this.indexingService = plugin.services.indexingService;
          }
          
          // Get ChromaDB services
          if (plugin.services.embeddingService) {
            this.embeddingService = plugin.services.embeddingService;
          }
          
          if (plugin.services.workspaceService) {
            this.workspaceService = plugin.services.workspaceService;
          }
          
          if (plugin.services.memoryService) {
            this.memoryService = plugin.services.memoryService;
          }
          
          if (plugin.services.searchService) {
            this.searchService = plugin.services.searchService;
          }
        }
      }
    } catch (error) {
      console.error("Error initializing services:", error);
      this.embeddingProvider = null;
      plugin = null; // Reset plugin if there was an error
    }
    
    // Register new unified modes
    this.registerMode(new SearchMode(app));
    this.registerMode(new VectorMode(
      app, 
      this.memoryService, 
      this.searchService, 
      this.embeddingService
    ));
    this.registerMode(new BatchMode(
      app, 
      this.memoryService, 
      this.searchService, 
      this.embeddingService
    ));
    
    // Add diagnostic mode to help troubleshoot ChromaDB issues
    // Use plugin?.services?.vectorStore safely since plugin is now in scope
    const vectorStore = plugin?.services?.vectorStore || null;
    this.registerMode(new DiagnosticMode(
      app,
      this.searchService,
      vectorStore
    ));
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
    
    // Clean up existing provider
    if (this.embeddingProvider && typeof (this.embeddingProvider as any).close === 'function') {
      (this.embeddingProvider as any).close();
      this.embeddingProvider = null;
    }
    
    // Create new provider if enabled
    if (settings.embeddingsEnabled && settings.openaiApiKey) {
      try {
        this.embeddingProvider = new OpenAIProvider(settings);
      } catch (error) {
        console.error('Error initializing embedding provider:', error);
        this.embeddingProvider = null;
      }
    }
  }
  
  /**
   * Set the indexing service
   * @param indexingService The indexing service to use
   */
  setIndexingService(indexingService: EmbeddingServiceAdapter): void {
    this.indexingService = indexingService;
  }
  
  /**
   * Initialize the VaultLibrarianAgent
   * This is called after the agent is registered with the agent manager
   */
  async initialize(): Promise<void> {
    await super.initialize();
    // No additional initialization needed - all ChromaDB services are initialized elsewhere
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
        try {
          if (this.app.plugins) {
            const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
            if (plugin?.services?.indexingService) {
              this.indexingService = plugin.services.indexingService;
            } else {
              throw new Error("Indexing service not available in plugin");
            }
          } else {
            throw new Error("App plugins not available");
          }
        } catch (error) {
          console.error("Error accessing indexing service:", error);
          throw new Error("Indexing service not available: " + error.message);
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
        try {
          if (this.app.plugins) {
            const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
            if (plugin?.services?.indexingService) {
              this.indexingService = plugin.services.indexingService;
            } else {
              throw new Error("Indexing service not available in plugin");
            }
          } else {
            throw new Error("App plugins not available");
          }
        } catch (error) {
          console.error("Error accessing indexing service:", error);
          throw new Error("Indexing service not available: " + error.message);
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
   * Clean up resources when the agent is unloaded
   */
  onunload(): void {
    try {
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