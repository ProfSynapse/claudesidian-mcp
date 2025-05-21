import { Plugin, Notice, TFile } from 'obsidian';
import { IEmbeddingProvider, ITokenTrackingProvider } from '../interfaces/IEmbeddingProvider';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { getErrorMessage } from '../../utils/errorUtils';
import { FileEmbedding } from '../workspace-types';
import { TextChunk, chunkText } from '../utils/TextChunker';
import { OpenAIProvider } from '../providers/openai-provider';
import { LocalEmbeddingProvider } from '../providers/local-provider';

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
    if (!this.settings.embeddingsEnabled) {
      // Embeddings are disabled - use the default provider
      this.embeddingProvider = VectorStoreFactory.createEmbeddingProvider();
      await this.embeddingProvider.initialize();
      console.log("Embeddings are disabled - using default provider");
      return;
    }

    try {
      // Check which provider to use
      if (this.settings.apiProvider === 'openai' && this.settings.openaiApiKey) {
        // Initialize OpenAI provider
        try {
          this.embeddingProvider = new OpenAIProvider(this.settings);
          await this.embeddingProvider.initialize();
          console.log("OpenAI embedding provider initialized successfully");
        } catch (openaiError) {
          console.error("Error initializing OpenAI provider:", openaiError);
          throw new Error(`OpenAI provider initialization failed: ${getErrorMessage(openaiError)}`);
        }
      } 
      else if (this.settings.apiProvider === 'local-minilm') {
        // Try to create and initialize local MiniLM provider with additional error handling
        try {
          console.log("Attempting to initialize local embedding provider...");
          const localProvider = new LocalEmbeddingProvider(this.settings);
          
          // Set a timeout for initialization to avoid hanging
          const initPromise = localProvider.initialize();
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Local provider initialization timed out after 30 seconds")), 30000);
          });
          
          // Wait for initialization with timeout
          await Promise.race([initPromise, timeoutPromise]);
          
          // If initialization succeeded, set as the provider
          this.embeddingProvider = localProvider;
          console.log("Local MiniLM embedding provider initialized successfully");
        } catch (localError) {
          // If local provider fails, log and throw with detailed message
          console.error("Error initializing local MiniLM provider:", localError);
          
          // Check for specific errors
          const errorMsg = getErrorMessage(localError);
          if (errorMsg.includes('fileURLToPath') || errorMsg.includes('import.meta.url')) {
            throw new Error(`Local provider failed due to browser compatibility issues: ${errorMsg}`);
          } else if (errorMsg.includes('timeout')) {
            throw new Error(`Local provider initialization timed out - your device may not have enough resources`);
          } else {
            throw new Error(`Local provider initialization failed: ${errorMsg}`);
          }
        }
      } 
      else {
        // No valid provider configuration, fall back to default
        console.warn("No valid embedding provider configuration - using default provider");
        this.embeddingProvider = VectorStoreFactory.createEmbeddingProvider();
        await this.embeddingProvider.initialize();
      }
    } catch (providerError) {
      console.error("Error initializing embedding provider:", providerError);
      
      // Log detailed provider-specific error messages
      const errorMsg = getErrorMessage(providerError);
      if (this.settings.apiProvider === 'openai') {
        console.error(`OpenAI provider error: ${errorMsg}`);
        new Notice(`OpenAI embeddings error: ${errorMsg.includes('key') ? 'Invalid API key' : errorMsg}`);
      } else if (this.settings.apiProvider === 'local-minilm') {
        console.error(`Local MiniLM provider error: ${errorMsg}`);
        
        // Check for fileURLToPath specific error
        if (errorMsg.includes('fileURLToPath') || errorMsg.includes('import.meta.url')) {
          new Notice("Local embeddings not supported in this environment. Switching to OpenAI embeddings instead.");
        } else {
          new Notice(`Local embeddings error: ${errorMsg}`);
        }
      }
      
      // Fall back to default provider and disable embeddings
      this.settings.embeddingsEnabled = false;
      this.embeddingProvider = VectorStoreFactory.createEmbeddingProvider();
      
      try {
        await this.embeddingProvider.initialize();
      } catch (fallbackError) {
        console.error("Even fallback provider failed to initialize:", fallbackError);
      }
      
      // Save updated settings
      this.saveSettings();
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
    
    // Validate settings based on provider
    if (settings.embeddingsEnabled) {
      if (settings.apiProvider === 'openai' && (!settings.openaiApiKey || settings.openaiApiKey.trim() === "")) {
        // OpenAI API key is required but not provided when using OpenAI provider
        console.warn("OpenAI API key is required but not provided. Embeddings will be disabled.");
        this.settings.embeddingsEnabled = false;
      }
      else if (settings.apiProvider === 'local-minilm') {
        // Local provider doesn't need validation, set the appropriate model
        this.settings.embeddingModel = 'all-MiniLM-L6-v2';
        this.settings.dimensions = 384; // Force the correct dimensions
        console.log("Using local MiniLM provider with 384 dimensions");
      }
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
    const plugin = this.plugin.app.plugins.plugins['claudesidian-mcp'];
    if (!plugin || !plugin.vectorStore) {
      throw new Error('Vector store not available');
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
    const notice = new Notice(`Generating embeddings for ${filePaths.length} files...`, 0);
    
    const ids: string[] = [];
    let processedCount = 0;
    let totalTokensProcessed = 0;
    
    try {
      // Process files in batches
      for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize);
        
        // Process batch in parallel
        const results = await Promise.allSettled(batch.map(async (filePath) => {
          try {
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
            const chunkMaxTokens = this.settings.maxTokensPerChunk || 8000; // Default to 8000 tokens to stay under limit
            const chunkStrategy = this.settings.chunkStrategy || 'paragraph';
            
            // Chunk the content based on settings
            const chunks = chunkText(content, {
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
              
              // Generate embedding for the chunk
              const embedding = await this.getEmbedding(chunk.content);
              if (!embedding) {
                console.warn(`Failed to generate embedding for chunk ${i+1}/${chunks.length} of file: ${filePath}`);
                continue; // Skip this chunk but continue with others
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
                  fileSize: content.length,
                  chunkSize: chunk.content.length,
                  indexedAt: new Date().toISOString(),
                  startPosition: chunk.metadata.startPosition,
                  endPosition: chunk.metadata.endPosition
                }
              };
              
              await fileEmbeddings.add(fileEmbedding);
              chunkIds.push(id);
            }
            
            // Add to total tokens processed
            totalTokensProcessed += totalTokensInFile;
            
            return { 
              ids: chunkIds, 
              tokens: totalTokensInFile,
              chunks: chunks.length
            } as { ids: string[]; tokens: number; chunks: number };
          } catch (error) {
            console.error(`Error indexing file ${filePath}:`, error);
            return null;
          }
        }));
        
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
              
              // Calculate cost based on model (local models are free)
              const costPerThousandTokens = this.settings.costPerThousandTokens || {
                'text-embedding-3-small': 0.00002,
                'text-embedding-3-large': 0.00013
              };
              
              // If it's a local model, cost is 0
              const isLocalModel = embeddingModel === 'all-MiniLM-L6-v2';
              const costPerThousand = isLocalModel ? 0 : (costPerThousandTokens[embeddingModel as keyof typeof costPerThousandTokens] || 0.00002);
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
      
      return ids;
    } catch (error) {
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