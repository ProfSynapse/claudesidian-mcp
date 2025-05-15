import { App, Notice } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { VaultLibrarianConfig } from './config';
import {
  SearchContentMode,
  SearchTagMode,
  SearchPropertyMode,
  ListFolderMode,
  ListNoteMode,
  ListTagMode,
  ListPropertiesMode,
  ListRecursiveMode,
  BatchSearchMode,
  SemanticSearchMode,
  CreateEmbeddingsMode,
  BatchCreateEmbeddingsMode
} from './modes';
import { DummyEmbeddingProvider } from './providers/embeddings-provider';
import { OpenAIProvider } from './providers/openai-provider';
import { EmbeddingProvider, MemorySettings } from '../../types';

/**
 * Agent for searching and navigating the vault
 */
export class VaultLibrarianAgent extends BaseAgent {
  private embeddingProvider: EmbeddingProvider;
  public app: App;
  private settings: any;
  private currentIndexingOperationId: string | null = null;
  
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
    
    // Initialize with dummy embedding provider
    // This will be replaced with a real provider if settings are available
    this.embeddingProvider = new DummyEmbeddingProvider();
    
    // Register traditional search modes
    this.registerMode(new SearchContentMode(app));
    this.registerMode(new SearchTagMode(app));
    this.registerMode(new SearchPropertyMode(app));
    this.registerMode(new ListFolderMode(app));
    this.registerMode(new ListNoteMode(app));
    this.registerMode(new ListTagMode(app));
    this.registerMode(new ListPropertiesMode(app));
    this.registerMode(new ListRecursiveMode(app));
    this.registerMode(new BatchSearchMode(app));
    
    // Register semantic search and embedding modes
    this.registerMode(new SemanticSearchMode(this));
    this.registerMode(new CreateEmbeddingsMode(this));
    this.registerMode(new BatchCreateEmbeddingsMode(this));
  }
  
  /**
   * Get the embedding provider
   */
  getProvider(): EmbeddingProvider {
    return this.embeddingProvider;
  }
  
  /**
   * Set the embedding provider
   * @param provider New embedding provider
   */
  setProvider(provider: EmbeddingProvider): void {
    this.embeddingProvider = provider;
  }
  
  /**
   * Perform semantic search across the vault
   * @param query Query text to search for
   * @param limit Maximum number of results to return
   * @param threshold Minimum similarity threshold (0-1)
   */
  async semanticSearch(query: string, limit: number = 10, threshold: number = 0.7): Promise<{
    success: boolean;
    matches?: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart: number;
      lineEnd: number;
      metadata?: {
        frontmatter?: Record<string, unknown>;
        tags?: string[];
        links?: {
          outgoing?: Array<{displayText: string; targetPath: string}>;
          incoming?: Array<{sourcePath: string; displayText: string}>;
        };
      };
    }>;
    error?: string;
  }> {
    try {
      // Validate input parameters
      if (!query || query.trim().length === 0) {
        throw new Error('Query text is required');
      }
      
      // Ensure limit is a positive number
      limit = Math.max(1, Math.min(50, limit));
      
      // Ensure threshold is between 0 and 1
      threshold = Math.max(0, Math.min(1, threshold));
      
      // Check if we have a real embedding provider
      if (this.embeddingProvider.getName() === 'dummy') {
        console.warn('Using dummy embedding provider for semantic search. Results may not be accurate.');
      }
      
      // 1. Convert the query to an embedding vector
      const queryEmbedding = await this.embeddingProvider.getEmbedding(query.trim());
      
      // 2. Use workspace-db to search for similar content
      const workspaceDb = this.app.plugins.getPlugin('claudesidian-mcp')?.workspaceDb;
      if (!workspaceDb) {
        throw new Error('Workspace database not available');
      }
      
      // Get search results from the database
      const searchResults = await workspaceDb.searchMemoryTraces({
        embedding: queryEmbedding,
        limit: limit,
        threshold: threshold,
        includeMetadata: true
      });
      
      // 3. Format and return the results
      return {
        success: true,
        matches: searchResults.map(result => ({
          similarity: result.similarity,
          content: result.content,
          filePath: result.filePath,
          lineStart: result.metadata?.lineStart || 0,
          lineEnd: result.metadata?.lineEnd || 0,
          metadata: {
            frontmatter: result.metadata?.frontmatter || {},
            tags: result.metadata?.tags || [],
            links: {
              outgoing: result.metadata?.links?.outgoing || [],
              incoming: result.metadata?.links?.incoming || []
            }
          }
        }))
      };
    } catch (error) {
      console.error('Error in semantic search:', error);
      return {
        success: false,
        error: `Error performing semantic search: ${error.message}`
      };
    }
  }
  
  /**
   * Index a file for semantic search
   * @param filePath Path to the file to index
   * @param force Whether to force re-indexing even if the file has not changed
   */
  async indexFile(filePath: string, force: boolean = false): Promise<{
    success: boolean;
    filePath: string;
    chunks?: number;
    error?: string;
  }> {
    try {
      // This is a stub implementation
      // In a real implementation, this would:
      // 1. Read the file content
      // 2. Split it into chunks
      // 3. Generate embeddings for each chunk
      // 4. Store the embeddings in a vector database
      
      // For now, we return dummy data
      return {
        success: true,
        filePath,
        chunks: 5
      };
    } catch (error) {
      return {
        success: false,
        filePath,
        error: `Error indexing file: ${error.message}`
      };
    }
  }
  
  /**
   * Combine semantic search with metadata filtering
   * @param query Query text to search for
   * @param filters Optional filters to apply to results
   * @param limit Maximum number of results to return
   * @param threshold Minimum similarity threshold (0-1)
   */
  async combinedSearch(
    query: string, 
    filters: {
      tags?: string[];
      paths?: string[];
      properties?: Record<string, any>;
      dateRange?: {
        start?: string;
        end?: string;
      };
    } = {},
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<{
    success: boolean;
    matches?: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart: number;
      lineEnd: number;
      metadata?: any;
    }>;
    error?: string;
  }> {
    try {
      // Perform semantic search first
      const semanticResults = await this.semanticSearch(query, limit * 2, threshold);
      if (!semanticResults.success || !semanticResults.matches) {
        return semanticResults;
      }
      
      // Apply filters to the results
      let filtered = semanticResults.matches;
      
      // Filter by tags
      if (filters.tags && filters.tags.length > 0) {
        filtered = filtered.filter(m => {
          const fileTags = m.metadata?.tags || [];
          return filters.tags!.some(tag => fileTags.includes(tag));
        });
      }
      
      // Filter by paths
      if (filters.paths && filters.paths.length > 0) {
        filtered = filtered.filter(m => {
          return filters.paths!.some(path => m.filePath.startsWith(path));
        });
      }
      
      // Filter by properties
      if (filters.properties && Object.keys(filters.properties).length > 0) {
        filtered = filtered.filter(m => {
          const frontmatter = m.metadata?.frontmatter || {};
          return Object.entries(filters.properties!).every(([key, value]) => {
            if (Array.isArray(value)) {
              return value.includes(frontmatter[key]);
            }
            return frontmatter[key] === value;
          });
        });
      }
      
      // Filter by date range
      if (filters.dateRange) {
        const { start, end } = filters.dateRange;
        if (start || end) {
          const startDate = start ? new Date(start).getTime() : 0;
          const endDate = end ? new Date(end).getTime() : Date.now();
          
          filtered = filtered.filter(m => {
            const created = m.metadata?.frontmatter?.created;
            if (!created) return true; // Skip if no date
            
            // Handle different types that 'created' might be
            const fileDate = created && (typeof created === 'string' || typeof created === 'number' || created instanceof Date)
                ? new Date(created as string | number | Date).getTime() 
                : 0;
            return fileDate >= startDate && fileDate <= endDate;
          });
        }
      }
      
      // Limit results
      filtered = filtered.slice(0, limit);
      
      return {
        success: true,
        matches: filtered
      };
    } catch (error) {
      return {
        success: false,
        error: `Error performing combined search: ${error.message}`
      };
    }
  }
  
  /**
   * Batch index multiple files for semantic search
   * @param filePaths Paths to the files to index
   * @param force Whether to force re-indexing even if files have not changed
   */
  async batchIndexFiles(filePaths: string[], force: boolean = false): Promise<{
    success: boolean;
    results: Array<{
      success: boolean;
      filePath: string;
      chunks?: number;
      error?: string;
    }>;
    processed: number;
    failed: number;
  }> {
    try {
      const results = await Promise.all(
        filePaths.map(filePath => this.indexFile(filePath, force))
      );
      
      const failed = results.filter(result => !result.success).length;
      
      return {
        success: failed === 0,
        results,
        processed: results.length,
        failed
      };
    } catch (error) {
      return {
        success: false,
        results: filePaths.map(filePath => ({
          success: false,
          filePath,
          error: `Error during batch indexing: ${error.message}`
        })),
        processed: 0,
        failed: filePaths.length
      };
    }
  }
  
  /**
   * Get the current usage stats
   */
  getUsageStats(): {
    tokensThisMonth: number;
    totalEmbeddings: number;
    dbSizeMB: number;
    lastIndexedDate: string;
    indexingInProgress: boolean;
  } {
    // This is a stub implementation
    // In a real implementation, this would query the database
    return {
      tokensThisMonth: 0,
      totalEmbeddings: 0,
      dbSizeMB: 0,
      lastIndexedDate: '',
      indexingInProgress: this.currentIndexingOperationId !== null
    };
  }
  
  /**
   * Reset usage stats
   */
  async resetUsageStats(): Promise<void> {
    // This is a stub implementation
    // In a real implementation, this would reset the database stats
    console.log('Resetting usage stats');
  }
  
  /**
   * Get the current indexing operation ID
   */
  getCurrentIndexingOperationId(): string | null {
    return this.currentIndexingOperationId;
  }
  
  /**
   * Cancel indexing
   */
  cancelIndexing(): void {
    // This is a stub implementation
    // In a real implementation, this would cancel the indexing operation
    this.currentIndexingOperationId = null;
    console.log('Indexing cancelled');
  }
  
  /**
   * Reindex all content
   */
  async reindexAll(operationId?: string): Promise<void> {
    // This is a stub implementation
    // In a real implementation, this would reindex all content
    if (operationId) {
      this.currentIndexingOperationId = operationId;
      console.log(`Resuming indexing operation ${operationId}`);
    } else {
      this.currentIndexingOperationId = 'new-operation-' + Date.now();
      console.log(`Starting new indexing operation ${this.currentIndexingOperationId}`);
    }
    
    // Simulate indexing
    setTimeout(() => {
      this.currentIndexingOperationId = null;
      console.log('Indexing completed');
    }, 5000);
  }
  
  /**
   * Update settings and initialize the appropriate embedding provider
   * @param settings Memory settings
   */
  updateSettings(settings: MemorySettings): void {
    this.settings = settings;
    
    // Clean up existing provider if needed
    if (this.embeddingProvider && typeof this.embeddingProvider.close === 'function') {
      this.embeddingProvider.close();
    }
    
    // Initialize the appropriate provider based on settings
    try {
      if (settings.apiProvider === 'openai' && settings.openaiApiKey) {
        // Use OpenAI provider if API key is available
        this.embeddingProvider = new OpenAIProvider(settings);
        console.log(`Initialized OpenAI embedding provider (${settings.embeddingModel})`);
      } else if (settings.apiProvider === 'local') {
        // Local provider not yet implemented, use dummy for now
        new Notice('Local embedding provider not yet implemented. Using dummy provider.');
        this.embeddingProvider = new DummyEmbeddingProvider(settings.dimensions);
      } else {
        // Fall back to dummy provider
        this.embeddingProvider = new DummyEmbeddingProvider(settings.dimensions);
        
        // Only show notice if openai is selected but no key is provided
        if (settings.apiProvider === 'openai' && !settings.openaiApiKey) {
          new Notice('OpenAI API key not set. Using dummy embedding provider for now.');
        }
      }
    } catch (error) {
      // Handle provider initialization errors
      console.error('Error initializing embedding provider:', error);
      new Notice(`Error initializing embedding provider: ${error.message}`);
      
      // Fall back to dummy provider
      this.embeddingProvider = new DummyEmbeddingProvider(settings.dimensions);
    }
    
    console.log('VaultLibrarian settings updated');
  }
  
  /**
   * Clean up resources when the agent is unloaded
   */
  onunload(): void {
    try {
      // Close any open database connections
      if (this.embeddingProvider && typeof this.embeddingProvider.close === 'function') {
        this.embeddingProvider.close();
      }
      
      // Clean up any event listeners or timers
      
      // Call parent class onunload if it exists
      super.onunload?.();
      
      console.log('VaultLibrarian agent unloaded successfully');
    } catch (error) {
      console.error('Error unloading VaultLibrarian agent:', error);
    }
  }
}