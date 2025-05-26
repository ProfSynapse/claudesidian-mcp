import { Plugin, Notice, TFile } from 'obsidian';
import { IEmbeddingProvider, ITokenTrackingProvider } from '../interfaces/IEmbeddingProvider';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { getErrorMessage } from '../../utils/errorUtils';
import { FileEmbedding } from '../workspace-types';
import { TextChunk, chunkText } from '../utils/TextChunker';
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
 * Service for generating and managing embeddings
 */
export class EmbeddingService {
  /**
   * Check if provider implements token tracking interface
   * @param provider Embedding provider to check
   * @returns true if provider implements ITokenTrackingProvider
   */
  private isTokenTrackingProvider(provider: IEmbeddingProvider): boolean {
    return (
      provider &&
      typeof (provider as ITokenTrackingProvider).getTokensThisMonth === 'function' &&
      typeof (provider as ITokenTrackingProvider).updateUsageStats === 'function' &&
      typeof (provider as ITokenTrackingProvider).getTotalCost === 'function'
    );
  }
  /**
   * Embedding provider instance
   */
  private embeddingProvider: IEmbeddingProvider;
  
  /**
   * Memory settings
   */
  private settings: MemorySettings;
  
  /**
   * Plugin instance
   */
  private plugin: Plugin;
  
  /**
   * Indexing state manager
   */
  private stateManager: IndexingStateManager;
  
  /**
   * Initialization status
   */
  private initialized: boolean = false;
  
  /**
   * Create a new embedding service
   * @param plugin Plugin instance
   */
  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.settings = { ...DEFAULT_MEMORY_SETTINGS };
    
    // Create a default embedding provider
    this.embeddingProvider = VectorStoreFactory.createEmbeddingProvider();
    
    // Initialize state manager
    this.stateManager = new IndexingStateManager(plugin);
    
    this.initializeSettings();
  }
  
  /**
   * Initialize settings from plugin
   */
  private initializeSettings(): void {
    try {
      // Get settings from plugin - cast to ClaudesidianPlugin
      const pluginAsClaudesidian = this.plugin as ClaudesidianPlugin;
      const pluginSettings = pluginAsClaudesidian?.settings?.settings?.memory || DEFAULT_MEMORY_SETTINGS;
      this.settings = pluginSettings;
      
      const embeddingsWereEnabled = pluginSettings.embeddingsEnabled;
      
      // Validate settings
      if (embeddingsWereEnabled && (!pluginSettings.openaiApiKey || pluginSettings.openaiApiKey.trim() === "")) {
        this.settings.embeddingsEnabled = false;
        console.warn("OpenAI API key is required but not provided. Embeddings will be disabled.");
      }
      
      // Initialize provider
      this.initializeProvider();
      
      this.initialized = true;
      
      // Save if modified
      if (embeddingsWereEnabled !== this.settings.embeddingsEnabled) {
        this.saveSettings();
      }
    } catch (error) {
      console.error("Failed to initialize EmbeddingService settings:", error);
      this.settings = { ...DEFAULT_MEMORY_SETTINGS, embeddingsEnabled: false };
      this.initialized = false;
    }
  }
  
  /**
   * Initialize the embedding provider
   */
  private async initializeProvider(): Promise<void> {
    if (this.settings.embeddingsEnabled && this.settings.openaiApiKey) {
      try {
        // Use a custom embedding function for OpenAI
        const openAiEmbedFunc = async (texts: string[]): Promise<number[][]> => {
          try {
            // Make OpenAI API call
            const response = await fetch('https://api.openai.com/v1/embeddings', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.settings.openaiApiKey}`
              },
              body: JSON.stringify({
                input: texts,
                model: this.settings.embeddingModel || 'text-embedding-ada-002'
              })
            });
            
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
            }
            
            const data = await response.json();
            return data.data.map((item: any) => item.embedding);
          } catch (error) {
            console.error('Error calling OpenAI API:', error);
            throw error;
          }
        };
        
        // Create a new provider with the OpenAI function
        this.embeddingProvider = VectorStoreFactory.createEmbeddingProvider(this.settings.openaiApiKey, this.settings.embeddingModel);
        await this.embeddingProvider.initialize();
        
        console.log("OpenAI embedding provider initialized successfully");
      } catch (providerError) {
        console.error("Error initializing OpenAI provider:", providerError);
        this.settings.embeddingsEnabled = false;
        
        // Fall back to default provider
        this.embeddingProvider = VectorStoreFactory.createEmbeddingProvider();
        await this.embeddingProvider.initialize();
      }
    } else {
      // Use the default provider in disabled mode
      this.embeddingProvider = VectorStoreFactory.createEmbeddingProvider();
      await this.embeddingProvider.initialize();
      
      console.log("Embeddings are disabled - using default provider");
    }
  }
  
  /**
   * Get the embedding provider
   */
  getProvider(): IEmbeddingProvider {
    return this.embeddingProvider;
  }
  
  /**
   * Get embedding for text
   * @param text Text to generate embedding for
   */
  async getEmbedding(text: string): Promise<number[] | null> {
    if (!this.initialized) {
      await this.initializeProvider();
    }
    
    if (!this.settings.embeddingsEnabled) {
      return null;
    }
    
    try {
      const embeddings = await this.embeddingProvider.generateEmbeddings([text]);
      return embeddings[0];
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }
  
  /**
   * Get embeddings for multiple texts
   * @param texts Array of texts to generate embeddings for
   */
  async getEmbeddings(texts: string[]): Promise<number[][] | null> {
    if (!this.initialized) {
      await this.initializeProvider();
    }
    
    if (!this.settings.embeddingsEnabled || texts.length === 0) {
      return null;
    }
    
    try {
      return await this.embeddingProvider.generateEmbeddings(texts);
    } catch (error) {
      console.error('Error generating embeddings:', error);
      return null;
    }
  }
  
  /**
   * Check if embeddings are enabled
   */
  areEmbeddingsEnabled(): boolean {
    return this.settings.embeddingsEnabled;
  }
  
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
    
    // Validate API key if embeddings are enabled
    if (settings.embeddingsEnabled && (!settings.openaiApiKey || settings.openaiApiKey.trim() === "")) {
      // API key is required but not provided, disable embeddings
      console.warn("OpenAI API key is required but not provided. Embeddings will be disabled.");
      this.settings.embeddingsEnabled = false;
    }
    
    // Reinitialize provider
    await this.initializeProvider();
    
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
  
  /**
   * Calculate similarity between two embeddings
   * @param embedding1 First embedding
   * @param embedding2 Second embedding
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    return this.embeddingProvider.calculateSimilarity(embedding1, embedding2);
  }
  
  /**
   * Check if there's a resumable indexing operation
   */
  async hasResumableIndexing(): Promise<boolean> {
    return await this.stateManager.hasResumableIndexing();
  }
  
  /**
   * Resume a previously interrupted indexing operation
   */
  async resumeIndexing(progressCallback?: (current: number, total: number) => void): Promise<string[]> {
    const state = await this.stateManager.loadState();
    if (!state || state.pendingFiles.length === 0) {
      throw new Error('No resumable indexing operation found');
    }
    
    console.log(`Resuming indexing: ${state.completedFiles.length} completed, ${state.pendingFiles.length} remaining`);
    
    // Update the state to show we're resuming
    state.status = 'indexing';
    await this.stateManager.saveState(state);
    
    // Process only the pending files
    const result = await this.batchIndexFiles(state.pendingFiles, (current, total) => {
      // Adjust progress to account for already completed files
      const totalProgress = state.completedFiles.length + current;
      const totalFiles = state.totalFiles;
      
      if (progressCallback) {
        progressCallback(totalProgress, totalFiles);
      }
    });
    
    // Clear the state after successful completion
    await this.stateManager.clearState();
    
    return result;
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
   * Incrementally update embeddings for specific files without purging the entire collection
   * @param filePaths Array of file paths to update
   * @param progressCallback Optional callback for progress updates
   * @returns Promise resolving to an array of updated embedding IDs
   */
  async incrementalIndexFiles(filePaths: string[], progressCallback?: (current: number, total: number) => void): Promise<string[]> {
    if (!this.settings.embeddingsEnabled) {
      throw new Error('Embeddings are disabled in settings');
    }
    
    if (!filePaths || filePaths.length === 0) {
      return [];
    }
    
    // Get plugin and vector store
    const plugin = this.plugin.app.plugins.plugins['claudesidian-mcp'] as any;
    if (!plugin || !plugin.vectorStore) {
      throw new Error('Vector store not available');
    }
    
    // Mark this as a system operation to prevent file event loops
    plugin.vectorStore.startSystemOperation();
    
    try {
      // Get collections
      const fileEmbeddings = VectorStoreFactory.createFileEmbeddingCollection(plugin.vectorStore);
      const vectorStore = plugin.vectorStore;
      
      console.log(`[EmbeddingService] Incrementally updating embeddings for ${filePaths.length} files`);
      console.log('[EmbeddingService] Files to update:', filePaths);
      
      // Get settings for batching
      const batchSize = this.settings.batchSize || 5;
      const processingDelay = this.settings.processingDelay || 1000;
      
      const notice = new Notice(`Updating embeddings: 0/${filePaths.length} files`, 0);
      
      const ids: string[] = [];
      let processedCount = 0;
      let totalTokensProcessed = 0;
      
      // Initialize progress immediately
      if (progressCallback) {
        progressCallback(0, filePaths.length);
      }
      // Process files in batches
      for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize);
        
        // Process batch in parallel
        const results = await Promise.allSettled(batch.map(async (filePath) => {
          try {
            // First, delete any existing embeddings for this file
            try {
              const existingEmbeddings = await vectorStore.query('file_embeddings', {
                where: { filePath: { $eq: filePath } },
                limit: 1000 // Get all chunks for this file
              });
              
              if (existingEmbeddings && existingEmbeddings.length > 0) {
                const existingIds = existingEmbeddings.map((e: any) => e.id);
                console.log(`Deleting ${existingIds.length} existing embeddings for file: ${filePath}`);
                await vectorStore.delete('file_embeddings', existingIds);
              }
            } catch (deleteError) {
              console.warn(`Error deleting existing embeddings for ${filePath}:`, deleteError);
              // Continue with re-indexing even if deletion fails
            }
            
            // Read file content
            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!file || !('children' in file === false)) { // Not a folder
              console.warn(`File not found or is a folder: ${filePath}`);
              return null;
            }
            
            const content = await this.plugin.app.vault.read(file as TFile);
            if (!content || content.trim().length === 0) {
              console.warn(`File is empty: ${filePath}`);
              return null;
            }
            
            // Get the chunking settings from plugin settings
            const chunkMaxTokens = this.settings.maxTokensPerChunk || 8000;
            const chunkStrategy = this.settings.chunkStrategy || 'paragraph';
            
            // Extract frontmatter and main content separately
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
            const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
            const mainContent = frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;
            
            // Chunk only the main content
            const chunks = chunkText(mainContent, {
              maxTokens: chunkMaxTokens,
              strategy: chunkStrategy as any,
              includeMetadata: true
            });
            
            const chunkIds: string[] = [];
            let totalTokensInFile = 0;
            
            // Process each chunk
            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i];
              
              totalTokensInFile += chunk.metadata.tokenCount;
              
              // Generate embedding for the chunk content
              const embedding = await this.getEmbedding(chunk.content);
              if (!embedding) {
                console.warn(`Failed to generate embedding for chunk ${i+1}/${chunks.length} of file: ${filePath}`);
                continue;
              }
              
              // Create new embedding for this chunk
              const id = uuidv4();
              const fileEmbedding: FileEmbedding = {
                id,
                filePath,
                timestamp: Date.now(),
                workspaceId: 'default',
                vector: embedding,
                content: chunk.content,
                chunkIndex: chunk.metadata.chunkIndex,
                totalChunks: chunk.metadata.totalChunks,
                metadata: {
                  frontmatter: i === 0 ? frontmatter : undefined,
                  chunkSize: chunk.content.length,
                  indexedAt: new Date().toISOString()
                }
              };
              
              await fileEmbeddings.add(fileEmbedding);
              chunkIds.push(id);
            }
            
            totalTokensProcessed += totalTokensInFile;
            
            return {
              ids: chunkIds,
              tokens: totalTokensInFile,
              chunks: chunks.length
            };
          } catch (error) {
            console.error(`Error updating embeddings for file ${filePath}:`, error);
            return null;
          }
        }));
        
        // Update progress count
        processedCount += batch.length;
        
        // Update notice
        notice.setMessage(`Updating embeddings: ${processedCount}/${filePaths.length} files`);
        
        // Call progress callback if provided
        if (progressCallback) {
          progressCallback(processedCount, filePaths.length);
        }
        
        // Add successful IDs to the result
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            if (Array.isArray(result.value.ids)) {
              ids.push(...result.value.ids);
            }
          }
        });
        
        // Add a small delay between batches
        if (i + batchSize < filePaths.length) {
          await new Promise(resolve => setTimeout(resolve, processingDelay));
        }
      }
      
      // Update token usage stats
      if (totalTokensProcessed > 0) {
        try {
          const embeddingModel = this.settings.embeddingModel || 'text-embedding-3-small';
          const provider = this.embeddingProvider;
          
          if (this.isTokenTrackingProvider(provider)) {
            const trackingProvider = provider as ITokenTrackingProvider;
            await trackingProvider.updateUsageStats(totalTokensProcessed, embeddingModel);
            console.log(`Updated token usage stats: +${totalTokensProcessed} tokens for ${embeddingModel}`);
          }
        } catch (statsError) {
          console.error('Error updating token usage stats:', statsError);
        }
      }
      
      // Update the notice with completion message
      notice.setMessage(`Updated embeddings for ${processedCount} files (${totalTokensProcessed} tokens)`);
      
      // Automatically hide notice after 3 seconds
      setTimeout(() => notice.hide(), 3000);
      
      console.log(`Incremental update completed: ${ids.length} embeddings created/updated for ${processedCount} files`);
      
      return ids;
    } catch (error) {
      // Create a new notice for error display
      const errorNotice = new Notice(`Error updating embeddings: ${getErrorMessage(error)}`);
      setTimeout(() => errorNotice.hide(), 3000);
      throw error;
    } finally {
      // Always clear the system operation flag
      plugin.vectorStore.endSystemOperation();
    }
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
  
  /**
   * Batch index multiple files with progress reporting
   * @param filePaths Array of file paths to index
   * @param progressCallback Optional callback for progress updates
   * @returns Promise resolving to an array of created embedding IDs
   */
  async batchIndexFiles(filePaths: string[], progressCallback?: (current: number, total: number) => void): Promise<string[]> {
    if (!this.settings.embeddingsEnabled) {
      throw new Error('Embeddings are disabled in settings');
    }
    
    if (!filePaths || filePaths.length === 0) {
      return [];
    }
    
    // Get plugin and vector store
    const plugin = this.plugin.app.plugins.plugins['claudesidian-mcp'] as any;
    if (!plugin || !plugin.vectorStore) {
      throw new Error('Vector store not available');
    }
    
    // Set reindexing flag to prevent file update queue from processing
    plugin.isReindexing = true;
    
    // Check if this is a new indexing operation or resuming
    const existingState = await this.stateManager.loadState();
    const isResuming = existingState && existingState.pendingFiles.length > 0;
    
    if (!isResuming) {
      // Initialize new indexing state
      await this.stateManager.initializeIndexing(filePaths);
    } else {
      console.log(`Resuming indexing operation: ${existingState.completedFiles.length} files already completed`);
    }
    
    // Get collections
    const fileEmbeddings = VectorStoreFactory.createFileEmbeddingCollection(plugin.vectorStore);
    
    // Get vector store for direct collection access
    const vectorStore = plugin.vectorStore;
    if (!vectorStore) {
      throw new Error('Vector store not available');
    }
    
    // IMPORTANT: For reindexing, we need to completely purge the file_embeddings collection
    // to ensure we get a clean slate. This is more reliable than trying to delete individual embeddings.
    try {
      // First get a count to log how many embeddings will be purged
      const beforeCount = await vectorStore.count('file_embeddings');
      console.log(`Found ${beforeCount} existing file embeddings before reindexing`);
      
      if (beforeCount > 0) {
        console.log('Purging file_embeddings collection before reindexing...');
        // Delete the collection
        await vectorStore.deleteCollection('file_embeddings');
        // Recreate it (empty)
        await vectorStore.createCollection('file_embeddings', { 
          createdAt: new Date().toISOString(),
          reindexOperation: true
        });
        console.log('Successfully purged file_embeddings collection');
      }
    } catch (purgeError) {
      console.error('Error purging file_embeddings collection:', purgeError);
      // Don't throw here, we'll try to continue with reindexing anyway
    }
    
    // Get settings for batching
    const batchSize = this.settings.batchSize || 5;
    const processingDelay = this.settings.processingDelay || 1000;
    
    // Show a single notice for the batch operation
    const notice = new Notice(`Generating embeddings: 0/${filePaths.length} files`, 0);
    
    const ids: string[] = [];
    let processedCount = 0;
    let totalTokensProcessed = 0;
    
    // Initialize progress immediately
    if (progressCallback) {
      progressCallback(0, filePaths.length);
    }
    
    try {
      // Process files in batches
      for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize);
        const successfulFiles: string[] = [];
        const failedFiles: string[] = [];
        
        // Process batch in parallel
        const results = await Promise.allSettled(batch.map(async (filePath) => {
          try {
            // Read file content
            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!file || !('children' in file === false)) { // Not a folder
              console.warn(`File not found or is a folder: ${filePath}`);
              failedFiles.push(filePath);
              return null;
            }
            
            const content = await this.plugin.app.vault.read(file as TFile);
            if (!content || content.trim().length === 0) {
              console.warn(`File is empty: ${filePath}`);
              failedFiles.push(filePath);
              return null;
            }
            
            // Get the chunking settings from plugin settings
            const chunkMaxTokens = this.settings.maxTokensPerChunk || 8000; // Default to 8000 tokens to stay under limit
            const chunkStrategy = this.settings.chunkStrategy || 'paragraph';
            
            // Extract frontmatter and main content separately
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
            const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
            const mainContent = frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;
            
            // Chunk only the main content (excluding frontmatter to reduce redundancy)
            const chunks = chunkText(mainContent, {
              maxTokens: chunkMaxTokens,
              strategy: chunkStrategy as any, // Cast to satisfy TS
              includeMetadata: true
            });
            
            // Create an array to store the chunk IDs
            const chunkIds: string[] = [];
            let totalTokensInFile = 0;
            
            // Process each chunk
            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i];
              
              // Accumulate token count for total
              totalTokensInFile += chunk.metadata.tokenCount;
              
              // Generate embedding for the chunk content (just the text, no file path)
              const embedding = await this.getEmbedding(chunk.content);
              if (!embedding) {
                console.warn(`Failed to generate embedding for chunk ${i+1}/${chunks.length} of file: ${filePath}`);
                continue; // Skip this chunk but continue with others
              }
              
              // Create new embedding for this chunk with minimal metadata
              const id = uuidv4();
              const fileEmbedding: FileEmbedding = {
                id,
                filePath, // Still need this to identify which file the chunk belongs to
                timestamp: Date.now(),
                workspaceId: 'default',
                vector: embedding,
                content: chunk.content, // Only the chunk text content, no file path or frontmatter
                chunkIndex: chunk.metadata.chunkIndex,
                totalChunks: chunk.metadata.totalChunks,
                metadata: {
                  // Store frontmatter separately at file level instead of per chunk
                  frontmatter: i === 0 ? frontmatter : undefined, // Only store with first chunk
                  chunkSize: chunk.content.length,
                  indexedAt: new Date().toISOString()
                }
              };
              
              await fileEmbeddings.add(fileEmbedding);
              chunkIds.push(id);
            }
            
            // Add to total tokens processed
            totalTokensProcessed += totalTokensInFile;
            successfulFiles.push(filePath);
            
            return { 
              ids: chunkIds, 
              tokens: totalTokensInFile,
              chunks: chunks.length
            } as { ids: string[]; tokens: number; chunks: number };
          } catch (error) {
            console.error(`Error indexing file ${filePath}:`, error);
            failedFiles.push(filePath);
            return null;
          }
        }));
        
        // Update state after each batch
        await this.stateManager.updateProgress(successfulFiles, failedFiles);
        
        // Update progress count
        processedCount += batch.length;
        
        // Update notice
        notice.setMessage(`Generating embeddings: ${processedCount}/${filePaths.length} files`);
        
        // Call progress callback if provided
        if (progressCallback) {
          progressCallback(processedCount, filePaths.length);
        }
        
        // Add successful IDs to the result
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            if (Array.isArray(result.value.ids)) {
              // Add all chunk IDs from the file
              ids.push(...result.value.ids);
            } else if (result.value && typeof result.value === 'object' && 'id' in result.value) {
              // Legacy format - single embedding
              ids.push(result.value.id as string);
            }
          }
        });
        
        // Add a small delay between batches to prevent UI freezing
        if (i + batchSize < filePaths.length) {
          await new Promise(resolve => setTimeout(resolve, processingDelay));
        }
      }
      
      // Update token usage stats
      if (totalTokensProcessed > 0) {
        try {
          // Update token usage
          const embeddingModel = this.settings.embeddingModel || 'text-embedding-3-small';
          const provider = this.embeddingProvider;
          
          // Log important info for debugging
          console.log(`Attempting to update token usage: ${totalTokensProcessed} tokens for ${embeddingModel}`);
          console.log(`Provider type: ${provider ? provider.constructor.name : 'null'}`);
          
          // Check if provider supports token tracking
          const supportsTokenTracking = this.isTokenTrackingProvider(provider);
          console.log(`Provider supports token tracking interface: ${supportsTokenTracking}`);
          
          if (supportsTokenTracking) {
            // Use the standard interface for token tracking
            const trackingProvider = provider as ITokenTrackingProvider;
            await trackingProvider.updateUsageStats(totalTokensProcessed, embeddingModel);
            console.log(`Updated token usage stats via standard interface: +${totalTokensProcessed} tokens for ${embeddingModel}`);
            
            // Log current tokens and cost after update
            const tokensThisMonth = trackingProvider.getTokensThisMonth();
            const estimatedCost = trackingProvider.getTotalCost();
            console.log(`Current token usage: ${tokensThisMonth} tokens, estimated cost: $${estimatedCost.toFixed(6)}`);
          } else {
            console.warn(`Provider ${provider.constructor.name} does not support token tracking. Stats won't be updated.`);
          }
          
          // Also manually update all-time token usage in localStorage
          try {
            if (typeof localStorage !== 'undefined') {
              // Get current all-time stats
              const allTimeUsageStr = localStorage.getItem('claudesidian-tokens-all-time');
              let allTimeStats = {
                tokensAllTime: 0,
                estimatedCostAllTime: 0,
                lastUpdated: new Date().toISOString()
              };
              
              if (allTimeUsageStr) {
                try {
                  const parsed = JSON.parse(allTimeUsageStr);
                  if (typeof parsed === 'object' && parsed !== null) {
                    allTimeStats = parsed;
                  }
                } catch (parseError) {
                  console.warn('Failed to parse all-time token usage:', parseError);
                }
              }
              
              // Add new tokens to all-time count
              allTimeStats.tokensAllTime += totalTokensProcessed;
              
              // Calculate cost based on model
              const costPerThousandTokens = this.settings.costPerThousandTokens || {
                'text-embedding-3-small': 0.00002,
                'text-embedding-3-large': 0.00013
              };
              
              const costPerThousand = costPerThousandTokens[embeddingModel] || 0.00002;
              const cost = (totalTokensProcessed / 1000) * costPerThousand;
              
              // Add cost to all-time cost
              allTimeStats.estimatedCostAllTime += cost;
              allTimeStats.lastUpdated = new Date().toISOString();
              
              // Save updated all-time stats
              localStorage.setItem('claudesidian-tokens-all-time', JSON.stringify(allTimeStats));
              console.log(`Updated all-time token usage: +${totalTokensProcessed} tokens, +$${cost.toFixed(6)} cost. New total: ${allTimeStats.tokensAllTime} tokens, $${allTimeStats.estimatedCostAllTime.toFixed(6)} cost`);
              
              // Force event dispatch to notify UI components
              if (typeof window !== 'undefined' && typeof StorageEvent === 'function' && typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new StorageEvent('storage', {
                  key: 'claudesidian-tokens-all-time',
                  newValue: JSON.stringify(allTimeStats),
                  storageArea: localStorage
                }));
                console.log('Dispatched storage event for all-time token usage update');
              }
            }
          } catch (allTimeError) {
            console.warn('Failed to update all-time token usage:', allTimeError);
          }
          
          // Update last indexed date
          if (plugin.settings && plugin.settings.settings && plugin.settings.settings.memory) {
            plugin.settings.settings.memory.lastIndexedDate = new Date().toISOString();
            await plugin.settings.saveSettings();
          }
        } catch (statsError) {
          console.error('Error updating token usage stats:', statsError);
        }
      }
      
      // Notify completion
      if ((window as any).mcpProgressHandlers && (window as any).mcpProgressHandlers.completeProgress) {
        (window as any).mcpProgressHandlers.completeProgress({
          success: true,
          processed: processedCount,
          failed: filePaths.length - ids.length,
          operationId: 'batch-index'
        });
      }
      
      // Update the notice with completion message
      notice.setMessage(`Completed embedding generation for ${processedCount} files (${totalTokensProcessed} tokens)`);
      
      // Automatically hide notice after 3 seconds
      setTimeout(() => notice.hide(), 3000);
      
      // Emit event for token usage updates and batch completion
      try {
        const app = (window as any).app;
        const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
        
        if (plugin?.eventManager?.emit) {
          plugin.eventManager.emit('batch-embedding-completed', {
            processedCount,
            totalTokensProcessed,
            timestamp: new Date().toISOString()
          });
          console.log('Emitted batch-embedding-completed event');
        }
      } catch (emitError) {
        console.warn('Failed to emit batch completion event:', emitError);
      }
      
      // Clear the indexing state on successful completion
      await this.stateManager.clearState();
      
      return ids;
    } catch (error) {
      // Mark state as error but don't clear it - allow resume
      const state = await this.stateManager.loadState();
      if (state) {
        state.status = 'error';
        state.errorMessage = getErrorMessage(error);
        await this.stateManager.saveState(state);
      }
      // Notify error
      if ((window as any).mcpProgressHandlers && (window as any).mcpProgressHandlers.completeProgress) {
        (window as any).mcpProgressHandlers.completeProgress({
          success: false,
          processed: processedCount,
          failed: filePaths.length - processedCount,
          error: getErrorMessage(error),
          operationId: 'batch-index'
        });
      }
      
      notice.setMessage(`Error generating embeddings: ${getErrorMessage(error)}`);
      setTimeout(() => notice.hide(), 3000);
      throw error;
    } finally {
      // Clear reindexing flag
      plugin.isReindexing = false;
    }
  }

  /**
   * Check if any embeddings exist in the system
   * @returns Promise resolving to true if embeddings exist
   */
  async hasExistingEmbeddings(): Promise<boolean> {
    try {
      // Get the vector store directly from the plugin
      const plugin = this.plugin.app.plugins.plugins['claudesidian-mcp'];
      if (!plugin) {
        console.error('Claudesidian plugin not found');
        return false;
      }
      
      // Try to get the vector store directly
      const vectorStore = plugin.vectorStore;
      if (!vectorStore) {
        console.error('Vector store not found on plugin');
        return false;
      }

      // Check collections that would have embeddings
      const collections = await vectorStore.listCollections();
      if (!collections || collections.length === 0) {
        console.log('No collections found');
        return false;
      }
      
      console.log('Found collections:', collections);

      // Check for specific collections that would contain embeddings
      const embeddingCollections = [
        'file_embeddings', 
        'memory_traces', 
        'sessions',
        'snapshots',
        'workspaces'
      ];
      
      const collectionExists = embeddingCollections.some(name => 
        collections.includes(name)
      );

      if (!collectionExists) {
        console.log('No embedding collections found');
        return false;
      }

      // Check if any of those collections have items
      for (const collectionName of embeddingCollections) {
        if (collections.includes(collectionName)) {
          try {
            const count = await vectorStore.count(collectionName);
            console.log(`Collection ${collectionName} has ${count} items`);
            if (count > 0) {
              return true;
            }
          } catch (countError) {
            console.warn(`Error getting count for collection ${collectionName}:`, countError);
          }
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking for existing embeddings:', error);
      // In case of error, we'll return false instead of true
      return false;
    }
  }
}