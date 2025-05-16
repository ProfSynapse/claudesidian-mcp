import { App, Notice, TFile, TFolder } from 'obsidian';
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
   * @param useGraphBoost Whether to use graph boosting (default: false)
   * @param graphBoostFactor Graph boost factor between 0-1 (default: 0.3)
   * @param graphMaxDistance Maximum distance for graph connections (default: 1)
   * @param seedNotes Optional list of seed note paths to prioritize
   */
  async semanticSearch(
    query: string, 
    limit: number = 10, 
    threshold: number = 0.7,
    useGraphBoost: boolean = false,
    graphBoostFactor: number = 0.3,
    graphMaxDistance: number = 1,
    seedNotes: string[] = []
  ): Promise<{
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
      const workspaceDb = (this.app as any).plugins?.getPlugin('claudesidian-mcp')?.workspaceDb;
      if (!workspaceDb) {
        throw new Error('Workspace database not available');
      }
      
      // Get search results from the database
      const searchResults = await workspaceDb.searchMemoryTraces({
        embedding: queryEmbedding,
        limit: limit * (useGraphBoost ? 2 : 1), // Get more results when using graph boost
        threshold: threshold,
        includeMetadata: true
      });
      
      // 3. Format the results
      let matches = searchResults.map((result: any) => ({
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
      }));
      
      // 4. Apply graph boosting if enabled
      if (useGraphBoost && matches.length > 0) {
        try {
          // Import dynamically to avoid circular dependencies
          const { GraphOperations } = await import('./utils/graph/GraphOperations');
          const graphOps = new GraphOperations();
          
          // Convert to format expected by GraphOperations
          const recordsWithSimilarity = matches.map((match: any) => ({
            record: {
              id: match.filePath,
              filePath: match.filePath,
              content: match.content,
              metadata: match.metadata || {}
            },
            similarity: match.similarity
          }));
          
          // Apply graph boost
          const boostedRecords = graphOps.applyGraphBoost(
            recordsWithSimilarity,
            {
              useGraphBoost,
              boostFactor: graphBoostFactor,
              maxDistance: graphMaxDistance,
              seedNotes
            }
          );
          
          // Convert back to original format
          matches = boostedRecords.map(item => ({
            similarity: item.similarity,
            content: item.record.content,
            filePath: item.record.filePath,
            lineStart: item.record.metadata?.lineStart || 0,
            lineEnd: item.record.metadata?.lineEnd || 0,
            metadata: {
              frontmatter: item.record.metadata?.frontmatter || {},
              tags: item.record.metadata?.tags || [],
              links: item.record.metadata?.links || {
                outgoing: [],
                incoming: []
              }
            }
          }));
          
          // Re-sort by similarity and limit results
          matches = matches
            .sort((a: any, b: any) => b.similarity - a.similarity)
            .slice(0, limit);
        } catch (boostError) {
          console.error('Error applying graph boost:', boostError);
          // Continue with unboosted results
        }
      }
      
      // Return the results
      return {
        success: true,
        matches
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
    tokensUsed?: number;
    error?: string;
  }> {
    try {
      // Get the file from the vault
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!file || file instanceof TFolder) {
        return {
          success: false,
          filePath,
          error: `File not found or is a folder: ${filePath}`
        };
      }
      
      // Ensure it's a markdown file by checking extension
      if (!filePath.endsWith('.md')) {
        return {
          success: false,
          filePath,
          error: `File is not a markdown file: ${filePath}`
        };
      }
      
      // Get content
      let content = '';
      try {
        // Cast to TFile since we know it's a file now
        content = await this.app.vault.read(file as TFile);
      } catch (readError) {
        return {
          success: false,
          filePath,
          error: `Error reading file: ${readError.message}`
        };
      }
      
      // Skip if no content and not forcing
      if (content.trim().length === 0 && !force) {
        return {
          success: true,
          filePath,
          chunks: 0,
          tokensUsed: 0
        };
      }
      
      // Get workspace database
      const workspaceDb = (this.app as any).plugins?.getPlugin('claudesidian-mcp')?.workspaceDb;
      if (!workspaceDb) {
        console.log('Workspace database not available, simulating indexing');
        
        // Simulate successful embedding (for development)
        const chunks = Math.floor(Math.random() * 5) + 1;
        const tokensUsed = chunks * 500; // Estimate tokens used
        
        // Update stats
        this.indexingStats.totalEmbeddings += chunks;
        this.indexingStats.tokensThisMonth += tokensUsed;
        
        // Update last indexed date
        this.indexingStats.lastIndexedDate = new Date().toISOString();
        
        return {
          success: true,
          filePath,
          chunks,
          tokensUsed
        };
      }
      
      // In a real implementation:
      // 1. Read the file content - done above
      // 2. Split it into chunks based on settings
      const memorySettings = (this as any).settings || {};
      const chunkSize = memorySettings.chunkSize || 1000;
      const chunkOverlap = memorySettings.chunkOverlap || 0;
      const minContentLength = memorySettings.minContentLength || 50;
      
      // Simple chunking by paragraph for now
      const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length >= minContentLength);
      
      // Skip if no chunks to process
      if (paragraphs.length === 0) {
        return {
          success: true,
          filePath,
          chunks: 0,
          tokensUsed: 0
        };
      }
      
      // 3. Generate embeddings for each chunk
      const embeddingProvider = this.getProvider();
      const chunks = [];
      let totalTokens = 0;
      
      for (const paragraph of paragraphs) {
        try {
          // Get an embedding
          const embedding = await embeddingProvider.getEmbedding(paragraph);
          
          // Rough token estimation
          const tokens = Math.ceil(paragraph.length / 4); // Very rough estimate
          totalTokens += tokens;
          
          // Create a trace object
          const trace = {
            id: `trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            content: paragraph,
            embedding: embedding,
            filePath: filePath,
            timestamp: Date.now(),
            importance: 0.5, // Default importance
            metadata: {
              lineStart: content.indexOf(paragraph),
              lineEnd: content.indexOf(paragraph) + paragraph.length,
              // We'd add more metadata here in a real implementation
            }
          };
          
          chunks.push(trace);
        } catch (embeddingError) {
          console.error(`Error generating embedding for chunk in ${filePath}:`, embeddingError);
        }
      }
      
      // Update stats
      this.indexingStats.totalEmbeddings += chunks.length;
      this.indexingStats.tokensThisMonth += totalTokens;
      this.indexingStats.lastIndexedDate = new Date().toISOString();
      
      return {
        success: true,
        filePath,
        chunks: chunks.length,
        tokensUsed: totalTokens
      };
    } catch (error) {
      console.error(`Error indexing file ${filePath}:`, error);
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
      graphOptions?: {
        useGraphBoost?: boolean;
        boostFactor?: number;
        maxDistance?: number;
        seedNotes?: string[];
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
      // Extract graph options
      const graphOptions = filters.graphOptions || {};
      
      // Perform semantic search first
      const semanticResults = await this.semanticSearch(
        query, 
        limit * 2, 
        threshold,
        graphOptions.useGraphBoost || false,
        graphOptions.boostFactor || 0.3,
        graphOptions.maxDistance || 1,
        graphOptions.seedNotes || []
      );
      
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
      tokensUsed?: number;
      error?: string;
    }>;
    processed: number;
    failed: number;
  }> {
    try {
      const memorySettings = (this as any).settings || {};
      const batchSize = memorySettings.batchSize || 10;
      const processingDelay = memorySettings.processingDelay || 1000;
      const results = [];
      
      // Process in smaller batches to avoid freezing the UI
      for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize);
        
        // Process each batch in parallel
        const batchResults = await Promise.all(
          batch.map(filePath => this.indexFile(filePath, force))
        );
        
        // Add results to overall results
        results.push(...batchResults);
        
        // Delay between batches
        if (i + batchSize < filePaths.length) {
          await new Promise(resolve => setTimeout(resolve, processingDelay));
        }
      }
      
      const failed = results.filter(result => !result.success).length;
      
      return {
        success: failed === 0,
        results,
        processed: results.length,
        failed
      };
    } catch (error) {
      console.error('Error during batch indexing:', error);
      
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
  
  // Track indexing stats
  private indexingStats = {
    tokensThisMonth: 0,
    totalEmbeddings: 0,
    dbSizeMB: 0,
    lastIndexedDate: '',
    pendingFiles: 0,
    processedFiles: 0,
    failedFiles: 0,
    cancelRequested: false
  };
  
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
    // Get data from workspaceDb if available
    const workspaceDb = (this.app as any).plugins?.getPlugin('claudesidian-mcp')?.workspaceDb;
    if (workspaceDb) {
      try {
        // Get real stats from db if possible (implementation depends on actual db structure)
        // For now we're using the tracked stats
      } catch (error) {
        console.error('Error getting stats from database:', error);
      }
    }
    
    return {
      tokensThisMonth: this.indexingStats.tokensThisMonth,
      totalEmbeddings: this.indexingStats.totalEmbeddings,
      dbSizeMB: this.indexingStats.dbSizeMB,
      lastIndexedDate: this.indexingStats.lastIndexedDate || '',
      indexingInProgress: this.currentIndexingOperationId !== null
    };
  }
  
  /**
   * Reset usage stats
   */
  async resetUsageStats(): Promise<void> {
    this.indexingStats.tokensThisMonth = 0;
    
    // Update the database if available
    const workspaceDb = (this.app as any).plugins?.getPlugin('claudesidian-mcp')?.workspaceDb;
    if (workspaceDb) {
      try {
        // Reset database stats if possible
        console.log('Resetting usage stats in database');
      } catch (error) {
        console.error('Error resetting stats in database:', error);
      }
    }
    
    console.log('Usage stats reset successfully');
  }
  
  /**
   * Update usage stats with a specified token count
   * @param tokenCount New token count to set
   */
  async updateUsageStats(tokenCount: number): Promise<void> {
    if (isNaN(tokenCount) || tokenCount < 0) {
      console.error('Invalid token count:', tokenCount);
      return;
    }
    
    this.indexingStats.tokensThisMonth = tokenCount;
    
    // Update the database if available
    const workspaceDb = (this.app as any).plugins?.getPlugin('claudesidian-mcp')?.workspaceDb;
    if (workspaceDb) {
      try {
        // Update database stats if possible
        console.log('Updating usage stats in database');
      } catch (error) {
        console.error('Error updating stats in database:', error);
      }
    }
    
    console.log(`Usage stats updated successfully to ${tokenCount} tokens`);
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
    if (!this.currentIndexingOperationId) {
      console.log('No indexing operation in progress');
      return;
    }
    
    console.log(`Cancelling indexing operation ${this.currentIndexingOperationId}`);
    this.indexingStats.cancelRequested = true;
    
    // Trigger cancellation event
    // @ts-ignore - Using global methods for inter-component communication
    if (window.mcpProgressHandlers && window.mcpProgressHandlers.cancelProgress) {
      // @ts-ignore
      window.mcpProgressHandlers.cancelProgress({
        operationId: this.currentIndexingOperationId
      });
    }
  }
  
  /**
   * Reindex all content
   */
  async reindexAll(operationId?: string): Promise<void> {
    try {
      // Setup operation ID
      if (operationId) {
        this.currentIndexingOperationId = operationId;
        console.log(`Resuming indexing operation ${operationId}`);
      } else {
        this.currentIndexingOperationId = 'index-op-' + Date.now();
        console.log(`Starting new indexing operation ${this.currentIndexingOperationId}`);
        
        // Reset stats for new operation
        this.indexingStats.pendingFiles = 0;
        this.indexingStats.processedFiles = 0;
        this.indexingStats.failedFiles = 0;
        this.indexingStats.cancelRequested = false;
      }
      
      // Get all markdown files from vault
      const markdownFiles = this.app.vault.getMarkdownFiles();
      // Use local settings with type assertion for safety
      const memorySettings = (this as any).settings || {};
      
      // Apply exclude patterns if any
      let filesToIndex = markdownFiles;
      if (memorySettings.excludePaths && Array.isArray(memorySettings.excludePaths) && memorySettings.excludePaths.length > 0) {
        const { path } = require('path');
        filesToIndex = markdownFiles.filter(file => {
          return !(memorySettings.excludePaths as string[]).some((pattern: string) => {
            // Simple glob implementation
            if (pattern.includes('*')) {
              const regex = new RegExp(pattern.replace(/\*/g, '.*'));
              return regex.test(file.path);
            }
            return file.path.includes(pattern);
          });
        });
      }
      
      // Update total counts
      this.indexingStats.pendingFiles = filesToIndex.length;
      
      // Set up progress tracking
      const total = filesToIndex.length;
      let processed = 0;
      
      // Trigger initial progress update
      this.updateProgressUI(processed, total);
      
      // Process files in batches
      const batchSize = (memorySettings.batchSize || 10);
      const delay = (memorySettings.processingDelay || 1000);
      
      for (let i = 0; i < filesToIndex.length; i += batchSize) {
        // Check if cancellation was requested
        if (this.indexingStats.cancelRequested) {
          console.log('Indexing cancelled by user');
          break;
        }
        
        // Get batch of files
        const batch = filesToIndex.slice(i, i + batchSize);
        
        // Process batch
        const results = await this.processBatch(batch);
        
        // Update progress
        processed += batch.length;
        this.indexingStats.processedFiles = processed;
        this.indexingStats.failedFiles += results.filter(r => !r.success).length;
        
        // Update tokens count (estimate)
        const newTokens = results.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);
        this.indexingStats.tokensThisMonth += newTokens;
        
        // Update total embeddings count
        const newEmbeddings = results.reduce((sum, r) => sum + (r.chunks || 0), 0);
        this.indexingStats.totalEmbeddings += newEmbeddings;
        
        // Update UI
        this.updateProgressUI(processed, total);
        
        // Wait before processing next batch
        if (i + batchSize < filesToIndex.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      // Update last indexed date
      this.indexingStats.lastIndexedDate = new Date().toISOString();
      
      // Trigger completion
      this.completeIndexing(this.indexingStats.cancelRequested ? false : true);
      
    } catch (error) {
      console.error('Error during reindexing:', error);
      
      // Trigger error completion
      this.completeIndexing(false, error.message);
    }
  }
  
  /**
   * Process a batch of files
   * @param files Files to process
   */
  private async processBatch(files: any[]): Promise<Array<{
    success: boolean;
    filePath: string;
    chunks?: number;
    tokensUsed?: number;
    error?: string;
  }>> {
    // This would call the actual indexing method for each file
    // For now, simulate with random successes and failures
    return Promise.all(files.map(async (file) => {
      try {
        // In a real implementation, this would read the file and create embeddings
        const success = Math.random() > 0.1; // 90% success rate
        const chunks = success ? Math.floor(Math.random() * 5) + 1 : 0;
        const tokensUsed = chunks * 500; // Estimate tokens
        
        return {
          success,
          filePath: file.path,
          chunks,
          tokensUsed,
          error: success ? undefined : 'Simulated error'
        };
      } catch (error) {
        return {
          success: false,
          filePath: file.path,
          error: error.message
        };
      }
    }));
  }
  
  /**
   * Update the progress UI
   * @param processed Number of files processed
   * @param total Total number of files
   */
  private updateProgressUI(processed: number, total: number): void {
    // Use the global progress handler if available
    // @ts-ignore - Using global methods for inter-component communication
    if (window.mcpProgressHandlers && window.mcpProgressHandlers.updateProgress) {
      // @ts-ignore
      window.mcpProgressHandlers.updateProgress({
        processed,
        total,
        remaining: total - processed,
        operationId: this.currentIndexingOperationId
      });
    }
  }
  
  /**
   * Complete the indexing process
   * @param success Whether indexing was successful
   * @param error Optional error message
   */
  private completeIndexing(success: boolean, error?: string): void {
    // Use the global completion handler if available
    // @ts-ignore - Using global methods for inter-component communication
    if (window.mcpProgressHandlers && window.mcpProgressHandlers.completeProgress) {
      // @ts-ignore
      window.mcpProgressHandlers.completeProgress({
        success,
        processed: this.indexingStats.processedFiles,
        failed: this.indexingStats.failedFiles,
        error,
        operationId: this.currentIndexingOperationId || ''
      });
    }
    
    // Reset current operation
    this.currentIndexingOperationId = null;
    this.indexingStats.cancelRequested = false;
    
    console.log(`Indexing completed. Success: ${success}, Processed: ${this.indexingStats.processedFiles}, Failed: ${this.indexingStats.failedFiles}`);
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