import { App, Plugin, TFile } from 'obsidian';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { FileEvent, EmbeddingStrategy } from './types';
import { FileContentCache } from './FileContentCache';

/**
 * Manages embedding generation and processing
 */
export class EmbeddingProcessor {
  constructor(
    private app: App,
    private plugin: Plugin,
    private embeddingService: EmbeddingService,
    private contentCache: FileContentCache,
    private embeddingStrategy: EmbeddingStrategy
  ) {}

  /**
   * Process embeddings for a single file event
   */
  async processFileEmbedding(event: FileEvent): Promise<boolean> {
    if (this.embeddingStrategy.type === 'manual' && event.operation !== 'delete') {
      // Skip embedding in manual mode except for deletes
      return false;
    }

    try {
      const file = this.app.vault.getAbstractFileByPath(event.path);
      if (!(file instanceof TFile)) return false;

      // For modify operations, try to get old content from cache
      const oldContent = this.contentCache.getCachedContent(event.path);

      // Read current content
      const newContent = await this.app.vault.read(file);

      // If we don't have old content cached, cache the current content for next time
      if (!oldContent && event.operation === 'modify') {
        this.contentCache.setCachedContent(event.path, newContent);
        console.log(`[EmbeddingProcessor] No cached content for ${event.path}, caching current content for next modification`);
      }

      // If we have old content and it's a modify operation, use chunk-level update
      if (oldContent && event.operation === 'modify' && oldContent !== newContent) {
        console.log(`[EmbeddingProcessor] Using chunk-level update for ${event.path} (old: ${oldContent.length} chars, new: ${newContent.length} chars)`);
        await this.embeddingService.updateChangedChunks(
          event.path, 
          oldContent, 
          newContent
        );
        // Update the cache with new content for next time
        this.contentCache.setCachedContent(event.path, newContent);
      } else {
        // Otherwise, use full file embedding
        if (event.operation === 'modify' && !oldContent) {
          console.log(`[EmbeddingProcessor] No old content cached for ${event.path}, using full file embedding`);
        } else {
          console.log(`[EmbeddingProcessor] Using full file embedding for ${event.path} (operation: ${event.operation})`);
        }
        await this.embeddingService.updateFileEmbeddings([event.path]);
        // Cache the content for next time
        this.contentCache.setCachedContent(event.path, newContent);
      }

      return true;
    } catch (error) {
      console.error(`[EmbeddingProcessor] Error processing embeddings for ${event.path}:`, error);
      return false;
    }
  }

  /**
   * Batch process embeddings for multiple files
   */
  async batchProcessEmbeddings(events: FileEvent[]): Promise<void> {
    console.log(`[EmbeddingProcessor] Batch processing embeddings for ${events.length} files`);

    // Process each file individually to use chunk-level updates when possible
    for (const event of events) {
      await this.processFileEmbedding(event);
    }
  }

  /**
   * Handle file deletion embeddings
   */
  async handleFileDeletion(filePath: string): Promise<void> {
    console.log(`[EmbeddingProcessor] Processing embedding deletion for: ${filePath}`);

    try {
      const searchService = (this.plugin as any).searchService;
      if (searchService) {
        await searchService.deleteFileEmbedding(filePath);
      }
    } catch (error) {
      console.error(`[EmbeddingProcessor] Error handling deletion for ${filePath}:`, error);
    }
  }

  /**
   * Handle startup embedding
   */
  async handleStartupEmbedding(isExcludedPath: (path: string) => boolean): Promise<void> {
    console.log('[EmbeddingProcessor] Running startup embedding');

    const markdownFiles = this.app.vault.getMarkdownFiles();
    const searchService = (this.plugin as any).searchService;

    if (!searchService) return;

    try {
      // Get existing embeddings
      const existingEmbeddings = await searchService.getAllFileEmbeddings();
      const indexedPaths = new Set(existingEmbeddings.map((e: any) => e.filePath));

      // Find files that need indexing
      const filesToIndex = markdownFiles
        .filter(file => !indexedPaths.has(file.path))
        .filter(file => !isExcludedPath(file.path))
        .map(file => file.path);

      if (filesToIndex.length > 0) {
        console.log(`[EmbeddingProcessor] Found ${filesToIndex.length} files to index on startup`);
        await this.embeddingService.batchIndexFiles(filesToIndex);
      }
    } catch (error) {
      console.error('[EmbeddingProcessor] Error during startup embedding:', error);
    }
  }

  /**
   * Update embedding strategy
   */
  updateStrategy(strategy: EmbeddingStrategy): void {
    this.embeddingStrategy = strategy;
  }

  /**
   * Get current strategy
   */
  getStrategy(): EmbeddingStrategy {
    return this.embeddingStrategy;
  }
}