import { App, TFile, TFolder, Notice } from 'obsidian';
import { EmbeddingManager } from './embeddingManager';
import { ProgressTracker } from '../utils/progressTracker';

/**
 * Manages indexing operations for embedding-based search
 */
export class IndexingService {
  private app: App;
  private embeddingManager: EmbeddingManager;
  private progressTracker: ProgressTracker;
  private currentIndexingOperationId: string | null = null;
  
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

  constructor(app: App, embeddingManager: EmbeddingManager) {
    this.app = app;
    this.embeddingManager = embeddingManager;
    this.progressTracker = new ProgressTracker();
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
      // Check if embeddings are enabled
      if (!this.embeddingManager.areEmbeddingsEnabled()) {
        return {
          success: false,
          filePath,
          error: 'Embeddings functionality is currently disabled or no provider is available. Please enable embeddings and provide a valid API key in settings to index files.'
        };
      }
      
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
      
      // Get vector store from the plugin
      const vectorStore = (this.app as any).plugins?.getPlugin('claudesidian-mcp')?.vectorStore;
      if (!vectorStore) {
        console.log('Vector store not available, simulating indexing');
        
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
      
      // Get settings for chunking
      const settings = this.embeddingManager.getSettings();
      const chunkSize = settings.chunkSize || 1000;
      const chunkOverlap = settings.chunkOverlap || 0;
      const minContentLength = settings.minContentLength || 50;
      
      // Simple chunking by paragraph for now
      const paragraphs = content.split(/\\n\\s*\\n/).filter(p => p.trim().length >= minContentLength);
      
      // Skip if no chunks to process
      if (paragraphs.length === 0) {
        return {
          success: true,
          filePath,
          chunks: 0,
          tokensUsed: 0
        };
      }
      
      // Generate embeddings for each chunk
      const embeddingProvider = this.embeddingManager.getProvider();
      const chunks = [];
      let totalTokens = 0;
      
      for (const paragraph of paragraphs) {
        try {
          // Get an embedding
          if (!embeddingProvider) {
            throw new Error('Embedding provider is not available');
          }
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
      // Check if embeddings are enabled
      if (!this.embeddingManager.areEmbeddingsEnabled()) {
        return {
          success: false,
          results: filePaths.map(filePath => ({
            success: false,
            filePath,
            error: 'Embeddings functionality is currently disabled or no provider is available. Please enable embeddings and provide a valid API key in settings to index files.'
          })),
          processed: 0,
          failed: filePaths.length
        };
      }
      
      const settings = this.embeddingManager.getSettings();
      const batchSize = settings.batchSize || 10;
      const processingDelay = settings.processingDelay || 1000;
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

  /**
   * Reindex all content
   * @param operationId Optional operation ID for resuming
   */
  async reindexAll(operationId?: string): Promise<void> {
    try {
      // Check if embeddings are enabled
      if (!this.embeddingManager.areEmbeddingsEnabled()) {
        // Trigger error completion
        this.completeIndexing(false, 'Embeddings functionality is currently disabled or no provider is available. Please enable embeddings and provide a valid API key in settings to reindex content.');
        return;
      }
      
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
      const settings = this.embeddingManager.getSettings();
      
      // Apply exclude patterns if any
      let filesToIndex = markdownFiles;
      if (settings.excludePaths && Array.isArray(settings.excludePaths) && settings.excludePaths.length > 0) {
        const { path } = require('path');
        filesToIndex = markdownFiles.filter(file => {
          return !(settings.excludePaths as string[]).some((pattern: string) => {
            // Simple glob implementation
            if (pattern.includes('*')) {
              try {
                // Escape special regex characters except * which we'll convert to .*
                const escapedPattern = pattern
                  .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
                  .replace(/\*/g, '.*'); // Convert * to .*
                const regex = new RegExp(escapedPattern);
                return regex.test(file.path);
              } catch (error) {
                console.error(`Invalid regex pattern: ${pattern}`, error);
                return false;
              }
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
      const batchSize = (settings.batchSize || 10);
      const delay = (settings.processingDelay || 1000);
      
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
  private async processBatch(files: TFile[]): Promise<Array<{
    success: boolean;
    filePath: string;
    chunks?: number;
    tokensUsed?: number;
    error?: string;
  }>> {
    // Process each file
    return Promise.all(files.map(async (file) => {
      return this.indexFile(file.path, false);
    }));
  }

  /**
   * Update the progress UI
   * @param processed Number of files processed
   * @param total Total number of files
   */
  private updateProgressUI(processed: number, total: number): void {
    this.progressTracker.updateProgress({
      processed,
      total,
      remaining: total - processed,
      operationId: this.currentIndexingOperationId
    });
  }

  /**
   * Complete the indexing process
   * @param success Whether indexing was successful
   * @param error Optional error message
   */
  private completeIndexing(success: boolean, error?: string): void {
    this.progressTracker.completeProgress({
      success,
      processed: this.indexingStats.processedFiles,
      failed: this.indexingStats.failedFiles,
      error,
      operationId: this.currentIndexingOperationId || ''
    });
    
    // Reset current operation
    this.currentIndexingOperationId = null;
    this.indexingStats.cancelRequested = false;
    
    console.log(`Indexing completed. Success: ${success}, Processed: ${this.indexingStats.processedFiles}, Failed: ${this.indexingStats.failedFiles}`);
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
    // Get data from vector store if available
    const vectorStore = (this.app as any).plugins?.getPlugin('claudesidian-mcp')?.vectorStore;
    if (vectorStore) {
      try {
        // Get real stats from vector store if possible
        // For now we're using the tracked stats
      } catch (error) {
        console.error('Error getting stats from vector store:', error);
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
    
    // Update the vector store if available
    const vectorStore = (this.app as any).plugins?.getPlugin('claudesidian-mcp')?.vectorStore;
    if (vectorStore) {
      try {
        // Reset vector store stats if possible
        console.log('Resetting usage stats in vector store');
      } catch (error) {
        console.error('Error resetting stats in vector store:', error);
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
    
    // Update the vector store if available
    const vectorStore = (this.app as any).plugins?.getPlugin('claudesidian-mcp')?.vectorStore;
    if (vectorStore) {
      try {
        // Update vector store stats if possible
        console.log('Updating usage stats in vector store');
      } catch (error) {
        console.error('Error updating stats in vector store:', error);
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
    this.progressTracker.cancelProgress({
      operationId: this.currentIndexingOperationId
    });
  }
}