import { Plugin, Notice, TFile } from 'obsidian';
import { IEmbeddingProvider, ITokenTrackingProvider } from '../interfaces/IEmbeddingProvider';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { getErrorMessage } from '../../utils/errorUtils';
import { FileEmbedding } from '../workspace-types';
import { TextChunk, chunkText } from '../utils/TextChunker';
import { IndexingStateManager } from './IndexingStateManager';
import { ChunkMatcher } from '../utils/ChunkMatcher';
import * as crypto from 'crypto';
import { EmbeddingProviderRegistry } from '../providers/registry/EmbeddingProviderRegistry';

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
  private isTokenTrackingProvider(provider: IEmbeddingProvider | null): boolean {
    return (
      provider !== null &&
      typeof (provider as ITokenTrackingProvider).getTokensThisMonth === 'function' &&
      typeof (provider as ITokenTrackingProvider).updateUsageStats === 'function' &&
      typeof (provider as ITokenTrackingProvider).getTotalCost === 'function'
    );
  }
  /**
   * Embedding provider instance
   */
  private embeddingProvider: IEmbeddingProvider | null;
  
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
    
    // Create a default embedding provider - will be properly initialized in initializeSettings
    this.embeddingProvider = null;
    
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
      
      // Initialize provider only if we have valid settings
      const providerConfig = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
      const currentProvider = this.settings.providerSettings?.[this.settings.apiProvider];
      
      // Initialize if embeddings are enabled AND either:
      // 1. Provider doesn't require API key, OR
      // 2. Provider requires API key and one is provided
      if (this.settings.embeddingsEnabled && 
          (!providerConfig?.requiresApiKey || (currentProvider?.apiKey && currentProvider.apiKey.trim() !== ""))) {
        this.initializeProvider().catch(error => {
          console.error('Failed to initialize provider:', error);
        });
      } else if (this.settings.embeddingsEnabled && providerConfig?.requiresApiKey) {
        console.warn(`${this.settings.apiProvider} API key is required but not provided. Provider will not be initialized.`);
      }
      
      this.initialized = true;
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
    try {
      // Use the factory to create the embedding provider with the current settings
      this.embeddingProvider = await VectorStoreFactory.createEmbeddingProvider(this.settings);
      if (this.embeddingProvider) {
        await this.embeddingProvider.initialize();
        console.log(`Initialized ${this.settings.apiProvider} embedding provider successfully`);
      }
    } catch (providerError) {
      console.error("Error initializing embedding provider:", providerError);
      this.embeddingProvider = null;
      // Don't disable embeddings here - let the settings validation handle that
    }
  }
  
  /**
   * Get the embedding provider
   */
  getProvider(): IEmbeddingProvider | null {
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
    
    if (!this.settings.embeddingsEnabled || !this.embeddingProvider) {
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
    
    if (!this.settings.embeddingsEnabled || !this.embeddingProvider || texts.length === 0) {
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
    const oldProvider = this.settings.apiProvider;
    const oldProviderSettings = this.settings.providerSettings?.[oldProvider];
    const newProvider = settings.apiProvider;
    const newProviderSettings = settings.providerSettings?.[newProvider];
    
    // Check if we're switching to a provider with different dimensions
    const dimensionsChanged = oldProviderSettings?.dimensions !== newProviderSettings?.dimensions;
    const providerChanged = oldProvider !== newProvider;
    
    // If provider or dimensions changed, check for existing embeddings
    if ((providerChanged || dimensionsChanged) && settings.embeddingsEnabled) {
      const hasExistingEmbeddings = await this.hasExistingEmbeddings();
      
      if (hasExistingEmbeddings) {
        console.warn(`⚠️  Provider dimension conflict detected!
          Previous: ${oldProvider} (${oldProviderSettings?.dimensions} dims)
          New: ${newProvider} (${newProviderSettings?.dimensions} dims)
          
          ChromaDB requires all embeddings in a collection to have the same dimensions.
          Existing embeddings must be reindexed with the new provider.`);
        
        // Check if there are active indexing operations
        const hasResumableIndexing = await this.stateManager.hasResumableIndexing();
        if (hasResumableIndexing) {
          throw new Error(`Cannot switch embedding providers while indexing is in progress. Please wait for current indexing to complete or clear the indexing state before switching providers.`);
        }
        
        // Get plugin and set reindexing flag to prevent conflicts
        const plugin = this.plugin.app.plugins.plugins['claudesidian-mcp'] as any;
        if (plugin) {
          plugin.isReindexing = true;
        }
        
        try {
          // Clear existing embeddings since they're incompatible
          const vectorStore = plugin?.vectorStore;
          if (vectorStore) {
            console.log('🔄 Clearing existing embeddings due to provider/dimension change...');
            
            // Delete and recreate file_embeddings collection
            try {
              await vectorStore.deleteCollection('file_embeddings');
              await vectorStore.createCollection('file_embeddings', { 
                providerChange: true,
                previousProvider: oldProvider,
                newProvider: newProvider,
                previousDimensions: oldProviderSettings?.dimensions,
                newDimensions: newProviderSettings?.dimensions,
                clearedAt: new Date().toISOString()
              });
              console.log('✅ File embeddings collection cleared for new provider');
            } catch (error) {
              console.error('Error clearing file embeddings collection:', error);
            }
            
            // Also clear other embedding-dependent collections if they exist
            const embeddingCollections = ['memory_traces', 'sessions', 'snapshots'];
            for (const collectionName of embeddingCollections) {
              try {
                const hasCollection = await vectorStore.hasCollection(collectionName);
                if (hasCollection) {
                  await vectorStore.deleteCollection(collectionName);
                  await vectorStore.createCollection(collectionName, { 
                    providerChange: true,
                    clearedAt: new Date().toISOString()
                  });
                  console.log(`✅ ${collectionName} collection cleared for new provider`);
                }
              } catch (error) {
                console.warn(`Error clearing ${collectionName} collection:`, error);
              }
            }
          }
        } finally {
          if (plugin) {
            plugin.isReindexing = false;
          }
        }
      }
    }
    
    this.settings = settings;
    
    // Only validate API key if embeddings are being enabled
    // Don't silently reset the setting - let the UI handle validation
    const currentProvider = settings.providerSettings?.[settings.apiProvider];
    if (settings.embeddingsEnabled && (!currentProvider?.apiKey || currentProvider.apiKey.trim() === "")) {
      console.warn(`${settings.apiProvider} API key is required but not provided. Provider will not be initialized.`);
      // Don't modify the embeddingsEnabled setting here - leave it for UI to handle
    }
    
    // Reinitialize provider only if we have valid settings
    if (settings.embeddingsEnabled && currentProvider?.apiKey && currentProvider.apiKey.trim() !== "") {
      await this.initializeProvider();
    }
    
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
    if (!this.embeddingProvider) {
      throw new Error('Embedding provider not initialized');
    }
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
   * Update file embeddings silently without showing progress notices
   * Used for batch processing where the parent handles progress display
   * @param filePaths Array of file paths to update
   * @returns Promise resolving to an array of updated embedding IDs
   */
  async updateFileEmbeddingsSilent(filePaths: string[]): Promise<string[]> {
    // Use incremental update but suppress the notice
    return await this.incrementalIndexFilesSilent(filePaths);
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
    if (!this.settings.embeddingsEnabled) {
      throw new Error('Embeddings are disabled in settings');
    }

    // Get plugin and vector store
    const plugin = this.plugin.app.plugins.plugins['claudesidian-mcp'] as any;
    if (!plugin || !plugin.vectorStore) {
      throw new Error('Vector store not available');
    }

    // Mark this as a system operation to prevent file event loops
    plugin.vectorStore.startSystemOperation();

    try {
      const vectorStore = plugin.vectorStore;
      
      // Get the chunking settings
      const chunkMaxTokens = this.settings.maxTokensPerChunk || 8000;
      const chunkStrategy = this.settings.chunkStrategy || 'paragraph';
      
      // Extract frontmatter from both versions
      const extractContent = (content: string) => {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
        return frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;
      };
      
      const oldMainContent = extractContent(oldContent);
      const newMainContent = extractContent(newContent);
      
      // Chunk both versions
      const oldChunks = chunkText(oldMainContent, {
        maxTokens: chunkMaxTokens,
        strategy: chunkStrategy as any,
        includeMetadata: true
      });
      
      const newChunks = chunkText(newMainContent, {
        maxTokens: chunkMaxTokens,
        strategy: chunkStrategy as any,
        includeMetadata: true
      });
      
      // Get existing embeddings for this file using normalized path
      const normalizedPath = filePath.replace(/\\/g, '/');
      const queryResult = await vectorStore.query('file_embeddings', {
        where: { filePath: { $eq: normalizedPath } },
        include: ['metadatas', 'documents'],
        nResults: 1000 // Get all chunks for this file
      });
      
      // Transform the query result to a flat array format
      const existingEmbeddings: any[] = [];
      if (queryResult.ids && queryResult.ids.length > 0) {
        for (let i = 0; i < queryResult.ids[0].length; i++) {
          existingEmbeddings.push({
            id: queryResult.ids[0][i],
            metadata: queryResult.metadatas?.[0]?.[i] || {},
            document: queryResult.documents?.[0]?.[i] || ''
          });
        }
      }
      
      // Map old chunks to their embedding IDs
      const oldEmbeddingIds: string[] = [];
      for (const oldChunk of oldChunks) {
        const embedding = existingEmbeddings.find((e: any) => 
          e.metadata?.chunkIndex === oldChunk.metadata.chunkIndex
        );
        oldEmbeddingIds.push(embedding?.id || '');
      }
      
      // Use ChunkMatcher to find the best matches
      const matchResults = ChunkMatcher.findBestMatches(oldChunks, newChunks, oldEmbeddingIds);
      
      console.log(`[EmbeddingService] File ${filePath} chunk analysis:
        - Total chunks: ${newChunks.length}
        - Exact matches: ${matchResults.filter(r => r.matchType === 'exact').length}
        - Similar matches: ${matchResults.filter(r => r.matchType === 'similar').length}
        - New chunks: ${matchResults.filter(r => r.matchType === 'new').length}`);
      
      const updatedIds: string[] = [];
      const embeddingsToDelete: string[] = [];
      
      // Process each match result
      for (const result of matchResults) {
        if (result.matchType === 'exact' && result.oldEmbeddingId) {
          // Reuse existing embedding - just update the metadata if needed
          updatedIds.push(result.oldEmbeddingId);
        } else {
          // Need new embedding for 'similar' or 'new' chunks
          if (result.oldEmbeddingId) {
            embeddingsToDelete.push(result.oldEmbeddingId);
          }
        }
      }
      
      // Delete old embeddings for changed chunks
      if (embeddingsToDelete.length > 0) {
        console.log(`[EmbeddingService] Deleting ${embeddingsToDelete.length} old embeddings`);
        for (const id of embeddingsToDelete) {
          await vectorStore.deleteItems('file_embeddings', [id]);
        }
      }
      
      // Get chunks that need new embeddings
      const chunksNeedingEmbedding = ChunkMatcher.getChunksNeedingEmbedding(matchResults);
      
      if (chunksNeedingEmbedding.length === 0) {
        console.log(`[EmbeddingService] No chunks need re-embedding for file ${filePath}`);
        return updatedIds;
      }
      
      // Generate embeddings for chunks that need them
      for (const result of chunksNeedingEmbedding) {
        const chunk = result.newChunk;
        
        // Generate embedding for the chunk content
        const embedding = await this.getEmbedding(chunk.content);
        if (!embedding) {
          console.warn(`Failed to generate embedding for chunk ${chunk.metadata.chunkIndex} of file: ${filePath}`);
          continue;
        }
        
        // Create new embedding for this chunk
        const id = uuidv4();
        const fileEmbedding: FileEmbedding = {
          id,
          filePath: filePath.replace(/\\/g, '/'), // Normalize path to forward slashes
          timestamp: Date.now(),
          workspaceId: workspaceId || 'default',
          vector: embedding,
          content: chunk.content,
          chunkIndex: chunk.metadata.chunkIndex,
          totalChunks: chunk.metadata.totalChunks,
          chunkHash: chunk.metadata.contentHash,
          semanticBoundary: chunk.metadata.semanticBoundary,
          metadata: {
            chunkIndex: chunk.metadata.chunkIndex,
            totalChunks: chunk.metadata.totalChunks,
            fileSize: newContent.length,
            indexedAt: new Date().toISOString(),
            tokenCount: chunk.metadata.tokenCount,
            startPosition: chunk.metadata.startPosition,
            endPosition: chunk.metadata.endPosition,
            contentHash: chunk.metadata.contentHash,
            semanticBoundary: chunk.metadata.semanticBoundary
          }
        };
        
        // Add the new embedding
        await vectorStore.addItems('file_embeddings', {
          ids: [id],
          embeddings: [fileEmbedding.vector],
          metadatas: [fileEmbedding.metadata],
          documents: [fileEmbedding.content]
        });
        updatedIds.push(id);
        
        console.log(`[EmbeddingService] Created embedding for chunk ${chunk.metadata.chunkIndex}/${chunk.metadata.totalChunks} of file ${filePath} (${result.matchType})`);
      }
      
      // Clean up orphaned embeddings (chunks that no longer exist)
      const allCurrentChunkIndices = new Set(newChunks.map(c => c.metadata.chunkIndex));
      const orphanedEmbeddings = existingEmbeddings.filter((e: any) => 
        !allCurrentChunkIndices.has(e.metadata?.chunkIndex || e.chunkIndex || -1)
      );
      
      if (orphanedEmbeddings.length > 0) {
        console.log(`[EmbeddingService] Cleaning up ${orphanedEmbeddings.length} orphaned embeddings`);
        for (const orphan of orphanedEmbeddings) {
          await vectorStore.deleteItems('file_embeddings', [orphan.id]);
        }
      }
      
      console.log(`[EmbeddingService] Chunk-level update complete for ${filePath}: ${updatedIds.length} embeddings updated`);
      return updatedIds;
      
    } finally {
      plugin.vectorStore.endSystemOperation();
    }
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
      
      console.log(`[EmbeddingService] Checking ${filePaths.length} files for embedding updates`);
      
      // Get settings for batching
      const batchSize = this.settings.batchSize || 5;
      const processingDelay = this.settings.processingDelay || 1000;
      
      const notice = new Notice(`Embedding 0/${filePaths.length} notes`, 0);
      
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
            // Check if file needs re-embedding by comparing content hash
            const needsEmbedding = await this.checkIfFileNeedsEmbedding(filePath, vectorStore);
            if (!needsEmbedding) {
              return { ids: [], tokens: 0, chunks: 0, skipped: true };
            }
            
            console.log(`[EmbeddingService] Processing ${filePath} - needs embedding`);

            // First, delete any existing embeddings for this file
            try {
              const queryResult = await vectorStore.query('file_embeddings', {
                where: { filePath: { $eq: filePath.replace(/\\/g, '/') } },
                nResults: 1000 // Get all chunks for this file
              });
              
              if (queryResult.ids && queryResult.ids.length > 0 && queryResult.ids[0].length > 0) {
                const existingIds = queryResult.ids[0]; // ids is an array of arrays
                console.log(`Deleting ${existingIds.length} existing embeddings for file: ${filePath}`);
                await vectorStore.deleteItems('file_embeddings', existingIds);
              }
            } catch (deleteError) {
              console.warn(`Error deleting existing embeddings for ${filePath}:`, deleteError);
              // Continue with re-indexing even if deletion fails
            }
            
            // Read file content
            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
            
            if (!file) {
              console.warn(`File not found: ${filePath}`);
              return null;
            }
            if ('children' in file) { // Check if it's a folder (TFolder has children)
              console.warn(`Path is a folder, not a file: ${filePath}`);
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
                filePath: filePath.replace(/\\/g, '/'), // Normalize path to forward slashes
                timestamp: Date.now(),
                workspaceId: 'default',
                vector: embedding,
                content: chunk.content,
                chunkIndex: chunk.metadata.chunkIndex,
                totalChunks: chunk.metadata.totalChunks,
                chunkHash: chunk.metadata.contentHash,
                semanticBoundary: chunk.metadata.semanticBoundary,
                metadata: {
                  frontmatter: i === 0 ? frontmatter : undefined,
                  chunkSize: chunk.content.length,
                  indexedAt: new Date().toISOString(),
                  tokenCount: chunk.metadata.tokenCount,
                  startPosition: chunk.metadata.startPosition,
                  endPosition: chunk.metadata.endPosition,
                  contentHash: this.hashContent(content), // File content hash for change detection
                  chunkHash: chunk.metadata.contentHash, // Chunk-specific hash
                  semanticBoundary: chunk.metadata.semanticBoundary
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
        notice.setMessage(`Embedding ${processedCount}/${filePaths.length} notes`);
        
        // Call progress callback if provided
        if (progressCallback) {
          progressCallback(processedCount, filePaths.length);
        }
        
        // Add successful IDs to the result and adjust counts for skipped files
        let skippedCount = 0;
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            if (Array.isArray(result.value.ids)) {
              ids.push(...result.value.ids);
            }
            if (result.value.skipped) {
              skippedCount++;
            }
          }
        });
        
        // Log summary of processing results
        if (skippedCount > 0) {
          console.log(`[EmbeddingService] Batch ${Math.floor(i/batchSize) + 1}: processed ${batch.length - skippedCount}, skipped ${skippedCount} (up-to-date)`);
        }
        
        // Add a small delay between batches
        if (i + batchSize < filePaths.length) {
          await new Promise(resolve => setTimeout(resolve, processingDelay));
        }
      }
      
      // Update token usage stats
      if (totalTokensProcessed > 0) {
        try {
          const currentProvider = this.settings.providerSettings?.[this.settings.apiProvider];
          const embeddingModel = currentProvider?.model || 'text-embedding-3-small';
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
      notice.setMessage(`Embedded ${processedCount} notes (${totalTokensProcessed} tokens)`);
      
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
   * Incrementally update embeddings for specific files without showing notices
   * @param filePaths Array of file paths to update
   * @returns Promise resolving to an array of updated embedding IDs
   */
  async incrementalIndexFilesSilent(filePaths: string[]): Promise<string[]> {
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
      
      console.log(`[EmbeddingService] Silently updating embeddings for ${filePaths.length} files`);
      
      // Get settings for batching
      const batchSize = this.settings.batchSize || 5;
      const processingDelay = this.settings.processingDelay || 1000;
      
      // No notice for silent operation
      
      const ids: string[] = [];
      let processedCount = 0;
      let totalTokensProcessed = 0;
      
      // Process files in batches
      for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize);
        
        // Process batch in parallel
        const results = await Promise.allSettled(batch.map(async (filePath) => {
          try {
            // Check if file needs re-embedding by comparing content hash
            const needsEmbedding = await this.checkIfFileNeedsEmbedding(filePath, vectorStore);
            if (!needsEmbedding) {
              return { ids: [], tokens: 0, chunks: 0, skipped: true };
            }
            
            console.log(`[EmbeddingService] Processing ${filePath} - needs embedding`);

            // First, delete any existing embeddings for this file
            try {
              const queryResult = await vectorStore.query('file_embeddings', {
                where: { filePath: { $eq: filePath.replace(/\\/g, '/') } },
                nResults: 1000 // Get all chunks for this file
              });
              
              if (queryResult.ids && queryResult.ids.length > 0) {
                const flatIds = queryResult.ids.flat();
                if (flatIds.length > 0) {
                  await vectorStore.deleteItems('file_embeddings', flatIds);
                  console.log(`[EmbeddingService] Deleted ${flatIds.length} existing embeddings for ${filePath}`);
                }
              }
            } catch (deleteError) {
              console.warn(`[EmbeddingService] Error deleting existing embeddings for ${filePath}:`, deleteError);
            }
            
            // Read file content
            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!file || 'children' in file) { // Check if it's a folder (TFolder has children)
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
                filePath: filePath.replace(/\\/g, '/'), // Normalize path to forward slashes
                timestamp: Date.now(),
                workspaceId: 'default',
                vector: embedding,
                content: chunk.content,
                chunkIndex: chunk.metadata.chunkIndex,
                totalChunks: chunk.metadata.totalChunks,
                chunkHash: chunk.metadata.contentHash,
                semanticBoundary: chunk.metadata.semanticBoundary,
                metadata: {
                  frontmatter: i === 0 ? frontmatter : undefined,
                  chunkSize: chunk.content.length,
                  indexedAt: new Date().toISOString(),
                  tokenCount: chunk.metadata.tokenCount,
                  startPosition: chunk.metadata.startPosition,
                  endPosition: chunk.metadata.endPosition,
                  contentHash: this.hashContent(content), // File content hash for change detection
                  chunkHash: chunk.metadata.contentHash, // Chunk-specific hash
                  semanticBoundary: chunk.metadata.semanticBoundary
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
        
        // Add successful IDs to the result and track skipped files
        let skippedCount = 0;
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            if (Array.isArray(result.value.ids)) {
              ids.push(...result.value.ids);
            }
            if (result.value.skipped) {
              skippedCount++;
            }
          }
        });
        
        // Log summary of silent processing results
        if (skippedCount > 0) {
          console.log(`[EmbeddingService] Silent batch ${Math.floor(i/batchSize) + 1}: processed ${batch.length - skippedCount}, skipped ${skippedCount} (up-to-date)`);
        }
        
        // Add a small delay between batches
        if (i + batchSize < filePaths.length) {
          await new Promise(resolve => setTimeout(resolve, processingDelay));
        }
      }
      
      // Update token usage stats
      if (totalTokensProcessed > 0) {
        try {
          const currentProvider = this.settings.providerSettings?.[this.settings.apiProvider];
          const embeddingModel = currentProvider?.model || 'text-embedding-3-small';
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
      
      console.log(`Silent incremental update completed: ${ids.length} embeddings created/updated for ${processedCount} files`);
      
      return ids;
    } catch (error) {
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
   * Generate a hash of content for comparison
   * @param content The content to hash
   * @returns A hash string
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
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
    const notice = new Notice(`Embedding 0/${filePaths.length} notes`, 0);
    
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
                filePath: filePath.replace(/\\/g, '/'), // Normalize path to forward slashes
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
        notice.setMessage(`Embedding ${processedCount}/${filePaths.length} notes`);
        
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
          const currentProvider = this.settings.providerSettings?.[this.settings.apiProvider];
          const embeddingModel = currentProvider?.model || 'text-embedding-3-small';
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
            console.warn(`Provider ${provider ? provider.constructor.name : 'null'} does not support token tracking. Stats won't be updated.`);
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
              
              const costPerThousand = (costPerThousandTokens as any)[embeddingModel] || 0.00002;
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
   * Check if a file needs re-embedding by comparing content hash
   * @param filePath Path to the file
   * @param vectorStore Vector store instance
   * @returns Promise resolving to true if file needs embedding
   */
  private async checkIfFileNeedsEmbedding(filePath: string, vectorStore: any): Promise<boolean> {
    try {
      // Read current file content and generate hash
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (!file || 'children' in file) {
        console.log(`[EmbeddingService] ${filePath} - file not found or is folder`);
        return false; // Skip if file doesn't exist or is a folder
      }

      const content = await this.plugin.app.vault.read(file as any);
      const currentHash = this.hashContent(content);

      // First check if the collection exists and has items
      const collectionExists = await vectorStore.hasCollection('file_embeddings');
      if (!collectionExists) {
        console.log(`[EmbeddingService] ${filePath} - file_embeddings collection does not exist`);
        return true;
      }

      const collectionCount = await vectorStore.count('file_embeddings');

      // Normalize the file path to match database format (forward slashes)
      const normalizedPath = filePath.replace(/\\/g, '/');

      // Query for existing embeddings for this file
      const queryResult = await vectorStore.query('file_embeddings', {
        where: { filePath: { $eq: normalizedPath } },
        nResults: 1, // Just need one to check metadata
        include: ['metadatas']
      });

      // Log result only if useful for debugging
      if (queryResult.ids?.[0]?.length === 0 && collectionCount > 0) {
        console.log(`[EmbeddingService] ${filePath} - query found no embeddings despite collection having ${collectionCount} items`);
      }

      // Debug: Let's see what file paths are actually in the database
      if (queryResult.ids?.[0]?.length === 0) {
        // Query a few random items to see what file paths look like
        const sampleQuery = await vectorStore.query('file_embeddings', {
          nResults: 5,
          include: ['metadatas']
        });
        
        const samplePaths = sampleQuery.metadatas?.[0]?.map((m: any) => m.filePath || 'no-filePath').slice(0, 5) || [];
        console.log(`[EmbeddingService] ${filePath} - sample stored file paths: ${samplePaths.join(', ')}`);
        console.log(`[EmbeddingService] ${filePath} - looking for exact match: "${normalizedPath}" (normalized from "${filePath}")`);
        
        // Test a direct query for a known path from the sample
        if (samplePaths.length > 0) {
          const testPath = samplePaths[0];
          console.log(`[EmbeddingService] Testing query for known path: "${testPath}"`);
          const testQuery = await vectorStore.query('file_embeddings', {
            where: { filePath: { $eq: testPath } },
            nResults: 1,
            include: ['metadatas']
          });
          console.log(`[EmbeddingService] Test query returned ${testQuery.ids?.[0]?.length || 0} results`);
        }
      }

      // If no embeddings exist, we need to create them
      if (!queryResult.ids || queryResult.ids.length === 0 || queryResult.ids[0].length === 0) {
        console.log(`[EmbeddingService] ${filePath} - no existing embeddings found`);
        return true;
      }

      // Check if any chunk has different content hash
      const existingMetadata = queryResult.metadatas?.[0]?.[0];
      if (!existingMetadata || !existingMetadata.contentHash) {
        console.log(`[EmbeddingService] ${filePath} - legacy embedding without content hash`);
        // No content hash in metadata - this might be a legacy embedding
        // Let's try to update the metadata rather than re-embedding everything
        const updated = await this.addContentHashToLegacyEmbedding(filePath, currentHash, vectorStore);
        if (updated) {
          console.log(`[EmbeddingService] Updated legacy embedding metadata for ${filePath}`);
          return false; // No re-embedding needed after metadata update
        }
        
        // If we couldn't update metadata, assume needs re-embedding
        console.log(`[EmbeddingService] ${filePath} - failed to update legacy metadata, needs re-embedding`);
        return true;
      }

      // Compare content hash - if different, needs re-embedding
      const hashesMatch = existingMetadata.contentHash === currentHash;
      if (!hashesMatch) {
        console.log(`[EmbeddingService] ${filePath} - content changed, needs re-embedding`);
      }
      return !hashesMatch;

    } catch (error) {
      console.warn(`[EmbeddingService] Error checking if file needs embedding for ${filePath}:`, error);
      return true; // If we can't check, assume it needs embedding
    }
  }

  /**
   * Add content hash metadata to legacy embeddings that don't have it
   * @param filePath Path to the file
   * @param contentHash Current content hash to add
   * @param vectorStore Vector store instance
   * @returns Promise resolving to true if metadata was successfully added
   */
  private async addContentHashToLegacyEmbedding(filePath: string, contentHash: string, vectorStore: any): Promise<boolean> {
    try {
      // Get all embeddings for this file using normalized path
      const normalizedPath = filePath.replace(/\\/g, '/');
      const queryResult = await vectorStore.query('file_embeddings', {
        where: { filePath: { $eq: normalizedPath } },
        nResults: 1000, // Get all chunks
        include: ['metadatas', 'documents']
      });

      if (!queryResult.ids || queryResult.ids.length === 0 || queryResult.ids[0].length === 0) {
        return false;
      }

      const ids = queryResult.ids[0];
      const metadatas = queryResult.metadatas?.[0] || [];
      
      // Update metadata for each chunk to include file content hash
      const updatedMetadatas = metadatas.map((metadata: any) => ({
        ...metadata,
        contentHash: contentHash // Add file-level content hash
      }));

      // Update the embeddings with new metadata
      await vectorStore.updateItems('file_embeddings', {
        ids: ids,
        metadatas: updatedMetadatas
      });

      return true;
    } catch (error) {
      console.warn(`[EmbeddingService] Failed to add content hash to legacy embedding for ${filePath}:`, error);
      return false;
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