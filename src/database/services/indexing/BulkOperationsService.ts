/**
 * Location: src/database/services/indexing/BulkOperationsService.ts
 * 
 * Summary: Consolidated bulk operations service that provides high-level coordination
 * for bulk processing operations including hash comparison, embedding operations,
 * and batch processing. Integrates AdaptiveBulkHashService and other bulk operation
 * capabilities into a unified interface.
 * 
 * Used by: FileIndexingService, EmbeddingService, and other services requiring bulk operations
 * Dependencies: AdaptiveBulkHashService, ContentHashService, FileStatsCollector, ProcessedFilesStateManager
 */

import { Plugin, TFile } from 'obsidian';
import { AdaptiveBulkHashService, BulkHashResult, BulkComparisonStats } from './embedding/AdaptiveBulkHashService';
import { ContentHashService } from './embedding/ContentHashService';
import { FileStatsCollector, FileStats, BatchConfiguration } from './embedding/FileStatsCollector';
import { ProcessedFilesStateManager } from './state/ProcessedFilesStateManager';
import { IVectorStore } from '../../interfaces/IVectorStore';
import { getErrorMessage } from '../../../utils/errorUtils';

export interface BulkProcessingOptions {
  maxConcurrent?: number;
  batchSize?: number;
  memoryThreshold?: number;
  enableFallback?: boolean;
  progressCallback?: (processed: number, total: number) => void;
}

export interface BulkEmbeddingResult {
  filePath: string;
  success: boolean;
  embedded: boolean;
  skipped: boolean;
  error?: string;
  processingTime?: number;
}

export interface BulkOperationStats {
  totalFiles: number;
  processedFiles: number;
  successfulFiles: number;
  skippedFiles: number;
  errorFiles: number;
  totalBatches: number;
  totalTime: number;
  averageFileTime: number;
  memoryStats?: {
    peakUsageMB: number;
    averageUsageMB: number;
  };
}

/**
 * Bulk Operations Service
 * 
 * Provides consolidated bulk processing capabilities including:
 * - Bulk hash comparison using AdaptiveBulkHashService
 * - Bulk embedding operations with memory management  
 * - Batch processing coordination with adaptive sizing
 * - Performance monitoring and statistics
 */
export class BulkOperationsService {
  private adaptiveBulkHashService: AdaptiveBulkHashService;
  private contentHashService: ContentHashService;
  private fileStatsCollector: FileStatsCollector;
  private stateManager: ProcessedFilesStateManager;

  constructor(
    private plugin: Plugin,
    contentHashService: ContentHashService,
    stateManager: ProcessedFilesStateManager
  ) {
    this.contentHashService = contentHashService;
    this.stateManager = stateManager;
    this.fileStatsCollector = new FileStatsCollector(plugin);
    this.adaptiveBulkHashService = new AdaptiveBulkHashService(
      plugin,
      contentHashService,
      stateManager
    );
  }

  // =============================================================================
  // BULK HASH COMPARISON OPERATIONS
  // =============================================================================

  /**
   * Perform bulk hash comparison for multiple files
   * Uses adaptive batching and memory management for optimal performance
   */
  async bulkCompareHashes(
    filePaths: string[],
    vectorStore: IVectorStore,
    options?: BulkProcessingOptions
  ): Promise<BulkHashResult[]> {
    const startTime = Date.now();
    
    try {
      // Use adaptive bulk hash service for optimal performance
      const results = await this.adaptiveBulkHashService.processBulkComparison(
        filePaths,
        vectorStore
      );

      // Apply progress callback if provided
      if (options?.progressCallback) {
        options.progressCallback(results.length, filePaths.length);
      }

      console.log(`[BulkOperationsService] Bulk hash comparison completed in ${Date.now() - startTime}ms`);
      return results;

    } catch (error) {
      console.error('[BulkOperationsService] Bulk hash comparison failed:', error);
      
      // Fallback to individual processing if enabled
      if (options?.enableFallback !== false) {
        console.log('[BulkOperationsService] Falling back to individual hash comparison');
        return this.fallbackHashComparison(filePaths, vectorStore, options);
      }
      
      throw error;
    }
  }

  /**
   * Check if multiple files need embedding using bulk operations
   * Optimized version of individual checkIfFileNeedsEmbedding calls
   */
  async checkBulkFilesNeedEmbedding(
    filePaths: string[],
    vectorStore: IVectorStore,
    options?: BulkProcessingOptions
  ): Promise<BulkHashResult[]> {
    return this.bulkCompareHashes(filePaths, vectorStore, options);
  }

  // =============================================================================
  // BULK EMBEDDING OPERATIONS
  // =============================================================================

  /**
   * Process multiple files for embedding using bulk operations
   */
  async bulkProcessEmbeddings(
    files: TFile[],
    vectorStore: IVectorStore,
    embeddingFunction: (file: TFile) => Promise<boolean>,
    options?: BulkProcessingOptions
  ): Promise<BulkEmbeddingResult[]> {
    const startTime = Date.now();
    const results: BulkEmbeddingResult[] = [];
    const maxConcurrent = options?.maxConcurrent || 5;

    console.log(`[BulkOperationsService] Starting bulk embedding for ${files.length} files`);

    try {
      // First, check which files need embedding
      const filePaths = files.map(f => f.path);
      const hashResults = await this.bulkCompareHashes(filePaths, vectorStore, options);
      
      // Filter to only files that need embedding
      const filesToEmbed = files.filter(file => {
        const hashResult = hashResults.find(r => r.filePath === file.path);
        return hashResult?.needsEmbedding || false;
      });

      console.log(`[BulkOperationsService] ${filesToEmbed.length} of ${files.length} files need embedding`);

      // Process files in controlled concurrency batches
      const batches = this.createProcessingBatches(filesToEmbed, maxConcurrent);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`[BulkOperationsService] Processing embedding batch ${batchIndex + 1}/${batches.length}`);

        // Process batch concurrently
        const batchPromises = batch.map(async (file) => {
          const fileStartTime = Date.now();
          const result: BulkEmbeddingResult = {
            filePath: file.path,
            success: false,
            embedded: false,
            skipped: false
          };

          try {
            const wasEmbedded = await embeddingFunction(file);
            result.success = true;
            result.embedded = wasEmbedded;
            result.processingTime = Date.now() - fileStartTime;
          } catch (error) {
            result.error = getErrorMessage(error);
            result.processingTime = Date.now() - fileStartTime;
          }

          return result;
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Update progress
        if (options?.progressCallback) {
          options.progressCallback(results.length, filesToEmbed.length);
        }

        // Add delay between batches to prevent overwhelming the system
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Add skipped files to results
      const embeddedPaths = new Set(filesToEmbed.map(f => f.path));
      for (const file of files) {
        if (!embeddedPaths.has(file.path)) {
          results.push({
            filePath: file.path,
            success: true,
            embedded: false,
            skipped: true
          });
        }
      }

      const totalTime = Date.now() - startTime;
      console.log(`[BulkOperationsService] Bulk embedding completed in ${totalTime}ms`);

      return results;

    } catch (error) {
      console.error('[BulkOperationsService] Bulk embedding failed:', error);
      throw error;
    }
  }

  // =============================================================================
  // STATISTICS AND MONITORING
  // =============================================================================

  /**
   * Generate bulk operation statistics from results
   */
  generateBulkStats(results: (BulkHashResult | BulkEmbeddingResult)[], totalTime: number): BulkOperationStats {
    const totalFiles = results.length;
    const processedFiles = results.filter(r => !r.error).length;
    const successfulFiles = results.filter(r => 'success' in r ? r.success : !r.error).length;
    const skippedFiles = results.filter(r => 'skipped' in r ? r.skipped : false).length;
    const errorFiles = results.filter(r => r.error).length;
    
    return {
      totalFiles,
      processedFiles,
      successfulFiles,
      skippedFiles,
      errorFiles,
      totalBatches: Math.ceil(totalFiles / 10), // Estimated
      totalTime,
      averageFileTime: totalFiles > 0 ? totalTime / totalFiles : 0
    };
  }

  /**
   * Get file statistics for adaptive batching
   */
  async getFileStats(filePaths: string[]): Promise<FileStats[]> {
    return this.fileStatsCollector.collectFileStats(filePaths);
  }

  /**
   * Create adaptive batches based on file characteristics
   */
  async createAdaptiveBatches(filePaths: string[]): Promise<string[][]> {
    return this.fileStatsCollector.createAdaptiveBatches(filePaths);
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Fallback to individual hash comparison when bulk operations fail
   */
  private async fallbackHashComparison(
    filePaths: string[],
    vectorStore: IVectorStore,
    options?: BulkProcessingOptions
  ): Promise<BulkHashResult[]> {
    const results: BulkHashResult[] = [];
    let processed = 0;

    for (const filePath of filePaths) {
      try {
        const needsEmbedding = await this.contentHashService.checkIfFileNeedsEmbedding(
          filePath,
          vectorStore
        );
        
        results.push({
          filePath,
          needsEmbedding,
          reason: 'fallback_individual_check'
        });

        processed++;
        if (options?.progressCallback) {
          options.progressCallback(processed, filePaths.length);
        }

      } catch (error) {
        results.push({
          filePath,
          needsEmbedding: false,
          error: getErrorMessage(error),
          reason: 'fallback_error'
        });
      }
    }

    return results;
  }

  /**
   * Create processing batches with controlled concurrency
   */
  private createProcessingBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Check if memory pressure is high
   */
  private isMemoryPressureHigh(threshold: number = 0.85): boolean {
    return this.fileStatsCollector.isMemoryPressureHigh(threshold);
  }
}