/**
 * FileIndexingService - Handles batch processing of files for embedding generation
 * 
 * Now includes bulk hash comparison optimization for improved startup performance.
 * Uses ContentHashService.checkBulkFilesNeedEmbedding() for memory-safe bulk operations
 * instead of individual file-by-file hash comparisons.
 * 
 * Key optimization: In incremental mode (!batchMode), performs bulk hash comparison
 * to filter out files that don't need re-embedding before processing.
 */

import { TFile } from 'obsidian';
import { v4 as uuidv4 } from 'uuid';
import { FileEmbedding } from '../../workspace-types';
import { chunkText } from '../../utils/TextChunker';
import { EmbeddingGenerator } from './EmbeddingGenerator';
import { ContentHashService } from './ContentHashService';
import { EmbeddingSettingsManager } from './EmbeddingSettingsManager';
import { IndexingProgressTracker } from './IndexingProgressTracker';

/**
 * Result of processing a single file for embedding
 */
export interface ProcessResult {
  /** Array of embedding IDs created for the file */
  ids: string[];
  /** Total number of tokens processed */
  tokens: number;
  /** Number of chunks created from the file */
  chunks: number;
  /** Whether the file was skipped (e.g., already processed) */
  skipped?: boolean;
}

/**
 * Result of processing multiple files in batches
 */
export interface BatchProcessResult {
  /** All embedding IDs created */
  ids: string[];
  /** Files successfully processed */
  processedFiles: string[];
  /** Files that failed to process */
  failedFiles: string[];
}

/**
 * Service responsible for indexing files and generating embeddings.
 * Handles both individual file processing and batch operations with
 * progress tracking and error recovery.
 * 
 * @remarks
 * This service follows the Single Responsibility Principle by focusing
 * solely on file indexing operations. It delegates embedding generation
 * to EmbeddingGenerator and content hashing to ContentHashService.
 */
export class FileIndexingService {
  /**
   * Creates a new FileIndexingService instance
   * @param plugin - Obsidian plugin instance
   * @param embeddingGenerator - Service for generating embeddings
   * @param contentHashService - Service for content hash management
   * @param settingsManager - Service for embedding settings
   * @param progressTracker - Service for tracking indexing progress
   */
  constructor(
    private plugin: any,
    private embeddingGenerator: EmbeddingGenerator,
    private contentHashService: ContentHashService,
    private settingsManager: EmbeddingSettingsManager,
    private progressTracker: IndexingProgressTracker
  ) {}

  /**
   * Process multiple files in batches with configurable batch size and delays.
   * Supports both incremental and full reindexing modes with optional state tracking.
   * 
   * @param filePaths - Array of file paths to process
   * @param vectorStore - Vector store instance for storing embeddings
   * @param batchMode - If true, processes all files; if false, checks if files need processing
   * @param progressCallback - Optional callback for progress updates
   * @param silent - If true, suppresses progress notifications
   * @param useStateTracking - If true, enables state persistence for resumable operations
   * @returns Results including processed files, failed files, and embedding IDs
   * 
   * @example
   * ```typescript
   * const results = await fileIndexingService.processFilesInBatches(
   *   ['file1.md', 'file2.md'],
   *   vectorStore,
   *   false,
   *   (current, total) => console.log(`${current}/${total}`),
   *   false,
   *   true  // Enable state tracking for resumable operations
   * );
   * ```
   */
  async processFilesInBatches(
    filePaths: string[], 
    vectorStore: any, 
    batchMode = false,
    progressCallback?: (current: number, total: number) => void,
    silent = false,
    useStateTracking = false
  ): Promise<BatchProcessResult> {
    const { batchSize, processingDelay } = this.settingsManager.getBatchingConfig();
    
    const ids: string[] = [];
    const processedFiles: string[] = [];
    const failedFiles: string[] = [];
    let processedCount = 0;
    
    // Get state manager for resumable operations
    let stateManager = null;
    if (useStateTracking) {
      const { IndexingStateManager } = await import('./IndexingStateManager');
      stateManager = new IndexingStateManager(this.plugin);
      
      // Check if there's existing state to resume from
      const existingState = await stateManager.loadState();
      if (existingState && existingState.pendingFiles.length > 0) {
        // Resume from existing state
        filePaths = existingState.pendingFiles;
        processedCount = existingState.processedFiles;
        console.log(`Resuming from existing state: ${processedCount} files already processed`);
      }
    }
    
    // Initialize progress immediately
    if (progressCallback) {
      progressCallback(processedCount, filePaths.length + processedCount);
    }
    
    // Process files in batches
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      
      // Update current batch in state if tracking enabled
      if (useStateTracking && stateManager) {
        await stateManager.updateBatchProgress(batch, i / filePaths.length);
      }
      
      // NEW: Use bulk hash comparison for better performance (incremental mode only)
      let filesToProcess = batch;
      if (!batchMode) {
        try {
          console.log(`[FileIndexingService] Using bulk hash comparison for batch of ${batch.length} files`);
          const bulkResults = await this.contentHashService.checkBulkFilesNeedEmbedding(batch, vectorStore);
          
          // Filter to only files that need embedding
          filesToProcess = bulkResults
            .filter(result => result.needsEmbedding && !result.error)
            .map(result => result.filePath);
          
          const skippedCount = batch.length - filesToProcess.length;
          if (skippedCount > 0) {
            console.log(`[FileIndexingService] Bulk comparison: ${filesToProcess.length} need embedding, ${skippedCount} skipped`);
          }
        } catch (bulkError) {
          console.error(`[FileIndexingService] Bulk comparison failed, falling back to individual checks:`, bulkError);
          // Fall back to individual processing on bulk error
          filesToProcess = batch;
        }
      }
      
      // Process files that need embedding in parallel
      const results = await Promise.allSettled(filesToProcess.map(async (filePath) => {
        try {
          // Double-check individual files only if bulk mode failed
          if (!batchMode && filesToProcess === batch) {
            const needsEmbedding = await this.contentHashService.checkIfFileNeedsEmbedding(filePath, vectorStore);
            if (!needsEmbedding) {
              return { ids: [], tokens: 0, chunks: 0, skipped: true };
            }
          }
          
          return await this.processFile(filePath, vectorStore);
        } catch (error) {
          console.error(`Error processing file ${filePath}:`, error);
          
          // NEW: Mark file as failed in state if not already marked
          try {
            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (file && !('children' in file)) {
              const content = await this.plugin.app.vault.read(file as TFile);
              const contentHash = this.contentHashService.hashContent(content);
              await this.contentHashService.markFileFailed(
                filePath,
                contentHash,
                error instanceof Error ? error.message : String(error)
              );
            }
          } catch (stateError) {
            console.error(`Failed to mark file as failed in state: ${stateError instanceof Error ? stateError.message : String(stateError)}`);
          }
          
          return null;
        }
      }));
      
      // Process results
      const batchCompletedFiles: string[] = [];
      const batchFailedFiles: string[] = [];
      
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const filePath = filesToProcess[j]; // Use filesToProcess instead of batch
        
        if (result.status === 'fulfilled' && result.value) {
          if (!result.value.skipped) {
            ids.push(...result.value.ids);
            processedFiles.push(filePath);
            batchCompletedFiles.push(filePath);
          }
        } else {
          failedFiles.push(filePath);
          batchFailedFiles.push(filePath);
        }
      }
      
      // NEW: Account for files skipped by bulk comparison
      if (!batchMode && filesToProcess.length < batch.length) {
        const skippedFiles = batch.filter(path => !filesToProcess.includes(path));
        // Skipped files are considered "completed" for progress tracking purposes
        processedFiles.push(...skippedFiles);
      }
      
      // Update state after each batch if tracking enabled
      if (useStateTracking && stateManager) {
        await stateManager.saveProgressUpdate(batchCompletedFiles, batchFailedFiles);
      }
      
      // Update progress
      processedCount += batch.length;
      
      if (!silent) {
        this.progressTracker.updateProgress(
          processedCount, 
          processedFiles.length, 
          failedFiles.length,
          progressCallback
        );
      }
      
      // Add delay between batches
      if (processingDelay > 0 && i + batchSize < filePaths.length) {
        await new Promise(resolve => setTimeout(resolve, processingDelay));
      }
    }
    
    return { ids, processedFiles, failedFiles };
  }

  /**
   * Process a single file to generate embeddings.
   * Handles content extraction, chunking, embedding generation, and storage.
   * 
   * @param filePath - Path to the file to process
   * @param vectorStore - Vector store instance for storing embeddings
   * @returns Processing results including embedding IDs and token counts
   * 
   * @throws Error if file is not found or is a directory
   * @throws Error if embedding generation fails
   * 
   * @remarks
   * This method:
   * - Deletes existing embeddings for the file before processing
   * - Extracts frontmatter separately from main content
   * - Chunks content based on configured strategy and token limits
   * - Generates embeddings for each chunk
   * - Stores embeddings with comprehensive metadata
   */
  async processFile(filePath: string, vectorStore: any): Promise<ProcessResult> {
    // Normalize file path for consistent storage
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // Read file content
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!file || 'children' in file) {
      throw new Error(`File not found or is directory: ${filePath}`);
    }
    
    const content = await this.plugin.app.vault.read(file as TFile);
    if (!content || content.trim().length === 0) {
      return { ids: [], tokens: 0, chunks: 0 };
    }
    
    // Get chunking configuration
    const { maxTokensPerChunk, chunkStrategy } = this.settingsManager.getChunkingConfig();
    
    // Extract frontmatter and main content
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
    const mainContent = frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;
    
    // Chunk content
    const chunks = chunkText(mainContent, {
      maxTokens: maxTokensPerChunk,
      strategy: chunkStrategy as any
    });
    
    // Generate content hash
    const contentHash = this.contentHashService.hashContent(content);
    
    // Generate embeddings for chunks
    const chunkTexts = chunks.map(chunk => chunk.content);
    const embeddings = await this.embeddingGenerator.generateBatch(chunkTexts);
    
    if (!embeddings) {
      throw new Error('Failed to generate embeddings');
    }
    
    // Prepare embedding records
    const embeddingRecords: FileEmbedding[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      
      embeddingRecords.push({
        id: uuidv4(),
        filePath: normalizedPath,
        timestamp: Date.now(),
        vector: embedding,
        content: chunk.content,
        chunkIndex: i,
        totalChunks: chunks.length,
        metadata: {
          title: file.name,
          filePath: normalizedPath,
          chunkIndex: i,
          chunkCount: chunks.length,
          startOffset: chunk.metadata.startPosition,
          endOffset: chunk.metadata.endPosition,
          tokenCount: chunk.metadata.tokenCount,
          frontmatter: frontmatter,
          contentHash: contentHash,
          createdAt: new Date().toISOString()
        }
      });
    }
    
    // Add embeddings to vector store
    const ids = embeddingRecords.map(record => record.id);
    const embeddingVectors = embeddingRecords.map(record => record.vector);
    const metadatas = embeddingRecords.map(record => record.metadata);
    const contents = embeddingRecords.map(record => record.content || '');
    
    try {
      await vectorStore.addItems('file_embeddings', {
        ids: ids,
        embeddings: embeddingVectors,
        metadatas: metadatas,
        documents: contents
      });
      
      // NEW: Mark file as successfully processed in state
      console.log(`[StateManager] FileIndexingService marking file as processed: ${normalizedPath}`);
      await this.contentHashService.markFileProcessed(
        normalizedPath,
        contentHash,
        this.embeddingGenerator.getProvider()?.constructor.name || 'unknown'
      );
      
      return {
        ids: ids,
        tokens: chunks.reduce((total: number, chunk: any) => total + chunk.metadata.tokenCount, 0),
        chunks: chunks.length
      };
    } catch (error) {
      // NEW: Mark file as failed processing in state
      console.log(`[StateManager] FileIndexingService marking file as failed: ${normalizedPath}`);
      await this.contentHashService.markFileFailed(
        normalizedPath,
        contentHash,
        error instanceof Error ? error.message : String(error)
      );
      
      throw error;
    }
  }
}