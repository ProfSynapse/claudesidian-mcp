/**
 * AdaptiveBulkHashService - Memory-aware bulk hash comparison engine
 * 
 * This service provides the core "spreadsheet-style" bulk hash comparison optimization,
 * processing files in memory-safe adaptive batches instead of individual file-by-file operations.
 * Coordinates with FileStatsCollector for memory management and ContentHashService for compatibility.
 * 
 * Imports:
 * - Plugin: Obsidian plugin instance for vault access
 * - TFile: Obsidian file type for type safety
 * - ContentHashService: Individual hash comparison service for backward compatibility
 * - FileStatsCollector: File metadata and adaptive batching
 * - ProcessedFilesStateManager: State persistence and tracking
 * - FileUtils: Common file validation utilities
 * 
 * Key Architecture:
 * - Stream-process files in adaptive batches (10-500 files based on sizes)
 * - Single ChromaDB metadata query per batch (not per file)
 * - Memory pressure monitoring with graceful degradation
 * - Backward compatibility with existing ContentHashService
 */

import { Plugin, TFile } from 'obsidian';
import { ContentHashService } from './ContentHashService';
import { FileStatsCollector, FileStats, BatchConfiguration } from './FileStatsCollector';
import { ProcessedFilesStateManager } from '../state/ProcessedFilesStateManager';
import { FileUtils } from '../../../utils/FileUtils';

export interface BulkHashResult {
  filePath: string;
  needsEmbedding: boolean;
  currentHash?: string;
  storedHash?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

export interface BulkComparisonStats {
  totalFiles: number;
  processedFiles: number;
  needsEmbedding: number;
  skippedFiles: number;
  errorFiles: number;
  totalBatches: number;
  averageBatchSize: number;
  totalProcessingTime: number;
  memoryUsage?: {
    beforeMB: number;
    afterMB: number;
    peakMB: number;
  };
}

export class AdaptiveBulkHashService {
  private plugin: Plugin;
  private contentHashService: ContentHashService;
  private fileStatsCollector: FileStatsCollector;
  private stateManager: ProcessedFilesStateManager;
  
  constructor(
    plugin: Plugin,
    contentHashService: ContentHashService,
    stateManager: ProcessedFilesStateManager
  ) {
    this.plugin = plugin;
    this.contentHashService = contentHashService;
    this.fileStatsCollector = new FileStatsCollector(plugin);
    this.stateManager = stateManager;
  }

  /**
   * Process bulk file comparison with memory-aware adaptive batching
   * @param filePaths Array of file paths to compare
   * @param vectorStore Vector store instance for database queries
   * @returns Promise resolving to bulk comparison results
   */
  async processBulkComparison(filePaths: string[], vectorStore: any): Promise<BulkHashResult[]> {
    const startTime = Date.now();
    const startMemory = this.getMemoryUsageMB();
    let peakMemory = startMemory;
    
    // Log initial plugin memory footprint
    console.log(`[AdaptiveBulkHashService] Plugin memory footprint at start: ${startMemory}MB`);
    
    console.log(`[AdaptiveBulkHashService] Starting bulk comparison for ${filePaths.length} files`);
    
    try {
      // Create adaptive batches based on file statistics
      const batches = await this.fileStatsCollector.createAdaptiveBatches(filePaths);
      const allResults: BulkHashResult[] = [];
      
      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`[AdaptiveBulkHashService] Processing batch ${i + 1}/${batches.length} (${batch.length} files)`);
        
        // Smart memory pressure detection based on actual requirements
        const memoryPressureResult = await this.checkSmartMemoryPressure(batch);
        if (memoryPressureResult.shouldFallback) {
          console.warn(`[AdaptiveBulkHashService] ${memoryPressureResult.reason}, falling back to ${memoryPressureResult.fallbackStrategy}`);
          
          if (memoryPressureResult.fallbackStrategy === 'individual') {
            const fallbackResults = await this.fallbackToIndividualProcessing(batch, vectorStore);
            allResults.push(...fallbackResults);
            continue;
          } else if (memoryPressureResult.fallbackStrategy === 'smaller-batches') {
            // Split batch into smaller sub-batches
            const subBatches = this.splitBatchIntoSmallerBatches(batch, memoryPressureResult.suggestedBatchSize || 10);
            for (const subBatch of subBatches) {
              const subBatchResults = await this.processBatch(subBatch, vectorStore);
              allResults.push(...subBatchResults);
              await this.yieldToUI(); // Yield between sub-batches
            }
            continue;
          }
        }
        
        // Process batch
        const batchResults = await this.processBatch(batch, vectorStore);
        allResults.push(...batchResults);
        
        // Track peak memory usage
        const currentMemory = this.getMemoryUsageMB();
        if (currentMemory > peakMemory) {
          peakMemory = currentMemory;
        }
        
        // Yield to UI between batches to prevent blocking
        if (i < batches.length - 1) {
          await this.yieldToUI();
        }
      }
      
      // Calculate final statistics
      const endTime = Date.now();
      const endMemory = this.getMemoryUsageMB();
      
      const stats: BulkComparisonStats = {
        totalFiles: filePaths.length,
        processedFiles: allResults.filter(r => !r.error && !r.skipped).length,
        needsEmbedding: allResults.filter(r => r.needsEmbedding).length,
        skippedFiles: allResults.filter(r => r.skipped).length,
        errorFiles: allResults.filter(r => r.error).length,
        totalBatches: batches.length,
        averageBatchSize: Math.round(filePaths.length / batches.length),
        totalProcessingTime: endTime - startTime,
        memoryUsage: {
          beforeMB: startMemory,
          afterMB: endMemory,
          peakMB: peakMemory
        }
      };
      
      console.log(`[AdaptiveBulkHashService] Bulk comparison completed:`, stats);
      return allResults;
      
    } catch (error) {
      console.error(`[AdaptiveBulkHashService] Error in bulk comparison:`, error);
      
      // Fallback to individual processing on any error
      console.log(`[AdaptiveBulkHashService] Falling back to individual processing for all files`);
      return await this.fallbackToIndividualProcessing(filePaths, vectorStore);
    }
  }

  /**
   * Process a single batch of files with bulk operations
   * @param filePaths Batch of file paths to process
   * @param vectorStore Vector store instance
   * @returns Promise resolving to batch results
   */
  private async processBatch(filePaths: string[], vectorStore: any): Promise<BulkHashResult[]> {
    const results: BulkHashResult[] = [];
    const batchStartTime = performance.now();
    const batchStartMemory = this.getMemoryUsageMB();
    
    try {
      // Step 1: Collect file content and generate hashes in parallel
      const hashStartTime = performance.now();
      const fileData = await this.collectBatchFileData(filePaths);
      const hashEndTime = performance.now();
      const hashEndMemory = this.getMemoryUsageMB();
      
      console.log(`[AdaptiveBulkHashService] Batch hash generation:`, {
        files: filePaths.length,
        timeMs: Math.round(hashEndTime - hashStartTime),
        memoryDeltaMB: Math.round((hashEndMemory - batchStartMemory) * 100) / 100,
        memoryPressure: this.getMemoryPressureLevel()
      });
      
      // Step 2: STATE-BASED COMPARISON (No ChromaDB queries - 0MB memory overhead)
      const stateStartTime = performance.now();
      console.log(`[AdaptiveBulkHashService] Using state-based tracking instead of ChromaDB queries (memory-optimized)`);
      const stateEndTime = performance.now();
      const stateEndMemory = this.getMemoryUsageMB();
      
      console.log(`[AdaptiveBulkHashService] State-based comparison:`, {
        files: filePaths.length,
        timeMs: Math.round(stateEndTime - stateStartTime),
        memoryDeltaMB: Math.round((stateEndMemory - hashEndMemory) * 100) / 100,
        memoryPressure: this.getMemoryPressureLevel()
      });
      
      // Step 3: STATE-BASED COMPARISON (No ChromaDB queries needed)
      for (const data of fileData) {
        if (!data.isValid) {
          results.push({
            filePath: data.filePath,
            needsEmbedding: false,
            skipped: true,
            reason: 'Invalid file or folder'
          });
          continue;
        }
        
        // Check persistent state ONLY - no database queries needed
        if (this.stateManager.isFileProcessed(data.filePath, data.currentHash)) {
          results.push({
            filePath: data.filePath,
            needsEmbedding: false,
            currentHash: data.currentHash,
            reason: 'Already processed (state-based tracking)'
          });
          continue;
        }
        
        // File not in processed state or hash changed - needs embedding
        results.push({
          filePath: data.filePath,
          needsEmbedding: true,
          currentHash: data.currentHash,
          reason: 'Not in processed state or content changed'
        });
      }
      
      // Save state updates in bulk
      await this.stateManager.saveState();
      
      return results;
      
    } catch (error) {
      console.error(`[AdaptiveBulkHashService] Error processing batch:`, error);
      
      // On batch error, fallback to individual processing for this batch
      return await this.fallbackToIndividualProcessing(filePaths, vectorStore);
    }
  }

  /**
   * Collect file content and generate hashes for a batch of files
   * @param filePaths Array of file paths
   * @returns Promise resolving to file data with hashes
   */
  private async collectBatchFileData(filePaths: string[]): Promise<Array<{
    filePath: string;
    currentHash: string;
    isValid: boolean;
  }>> {
    const fileDataPromises = filePaths.map(async (filePath) => {
      try {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (!FileUtils.isValidFile(file)) {
          return {
            filePath: FileUtils.normalizePath(filePath),
            currentHash: '',
            isValid: false
          };
        }

        const content = await this.plugin.app.vault.read(file as TFile);
        const currentHash = this.contentHashService.hashContent(content);
        
        return {
          filePath: FileUtils.normalizePath(filePath),
          currentHash,
          isValid: true
        };
      } catch (error) {
        console.error(`[AdaptiveBulkHashService] Error reading file ${filePath}:`, error);
        return {
          filePath: FileUtils.normalizePath(filePath),
          currentHash: '',
          isValid: false
        };
      }
    });
    
    return await Promise.all(fileDataPromises);
  }

  // NOTE: getBulkDatabaseMetadata method removed - now using pure state-based tracking
  // This eliminates the 1GB+ ChromaDB collection loading entirely


  /**
   * Fallback to individual file processing when bulk operations fail
   * @param filePaths Array of file paths to process individually
   * @param vectorStore Vector store instance
   * @returns Promise resolving to individual results
   */
  private async fallbackToIndividualProcessing(filePaths: string[], vectorStore: any): Promise<BulkHashResult[]> {
    console.log(`[AdaptiveBulkHashService] Using individual processing fallback for ${filePaths.length} files`);
    
    const results: BulkHashResult[] = [];
    
    for (const filePath of filePaths) {
      try {
        const needsEmbedding = await this.contentHashService.checkIfFileNeedsEmbedding(filePath, vectorStore);
        results.push({
          filePath: FileUtils.normalizePath(filePath),
          needsEmbedding,
          reason: 'Individual processing (fallback)'
        });
      } catch (error) {
        console.error(`[AdaptiveBulkHashService] Error in individual processing for ${filePath}:`, error);
        results.push({
          filePath: FileUtils.normalizePath(filePath),
          needsEmbedding: true, // Assume needs embedding on error
          error: error instanceof Error ? error.message : String(error),
          reason: 'Error during individual processing'
        });
      }
    }
    
    return results;
  }

  /**
   * Get current memory usage in MB
   * @returns Memory usage in megabytes or 0 if not available
   */
  private getMemoryUsageMB(): number {
    const memoryUsage = this.fileStatsCollector.getMemoryUsage();
    return memoryUsage ? Math.round(memoryUsage.used / 1024 / 1024) : 0;
  }

  /**
   * Yield control to UI thread to prevent blocking
   * @param delay Delay in milliseconds (default 0 for next tick)
   */
  private async yieldToUI(delay: number = 0): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Update configuration for the file stats collector
   * @param config Configuration updates
   */
  updateConfiguration(config: Parameters<FileStatsCollector['updateConfiguration']>[0]): void {
    this.fileStatsCollector.updateConfiguration(config);
  }

  /**
   * Get memory pressure level for diagnostics
   */
  private getMemoryPressureLevel(): string {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      if (!memory) return 'unknown';
      
      const used = memory.usedJSHeapSize || 0;
      const limit = memory.jsHeapSizeLimit || 0;
      
      if (limit === 0) return 'unknown';
      
      const percentage = (used / limit) * 100;
      if (percentage > 90) return 'critical';
      if (percentage > 75) return 'high';
      if (percentage > 50) return 'moderate';
      return 'low';
    }
    return 'unknown';
  }

  /**
   * Smart memory pressure detection based on actual batch requirements
   * Now optimized for targeted queries (no collection loading concerns)
   */
  private async checkSmartMemoryPressure(batch: string[]): Promise<{
    shouldFallback: boolean;
    reason?: string;
    fallbackStrategy?: 'individual' | 'smaller-batches';
    suggestedBatchSize?: number;
  }> {
    // Collect file stats for this specific batch
    const fileStats = await this.fileStatsCollector.collectFileStats(batch);
    const validFiles = fileStats.filter(stat => stat.isValid);
    
    if (validFiles.length === 0) {
      return { shouldFallback: false };
    }

    // Calculate estimated memory requirements for this batch
    // Now much lower since we use targeted queries (no collection loading)
    const totalFileSize = validFiles.reduce((sum, stat) => sum + stat.size, 0);
    const estimatedBatchMemory = Math.max(totalFileSize * 2, validFiles.length * 512); // Reduced: 2x file size, 512 bytes overhead per file
    const estimatedBatchMemoryMB = estimatedBatchMemory / (1024 * 1024);

    // Get current memory state
    const memoryUsage = this.fileStatsCollector.getMemoryUsage();
    if (!memoryUsage) {
      // Conservative thresholds based on file characteristics (now more generous)
      const maxFileSize = Math.max(...validFiles.map(stat => stat.size));
      
      // Very large files - still be conservative
      if (maxFileSize > 100 * 1024 * 1024) { // Increased threshold to 100MB (was 50MB)
        return {
          shouldFallback: true,
          reason: `Very large file detected (${Math.round(maxFileSize / 1024 / 1024)}MB), memory usage unknown`,
          fallbackStrategy: 'individual'
        };
      } else if (validFiles.length > 500) { // Increased threshold (was 200)
        return {
          shouldFallback: true,
          reason: `Very large batch (${validFiles.length} files), memory usage unknown`,
          fallbackStrategy: 'smaller-batches',
          suggestedBatchSize: 100 // Increased batch size (was 50)
        };
      }
      
      return { shouldFallback: false };
    }

    // Use heap limit for realistic pressure calculation
    const memoryLimit = (performance as any).memory?.jsHeapSizeLimit || memoryUsage.total;
    const availableMemoryMB = (memoryLimit - memoryUsage.used) / (1024 * 1024);
    const memoryUsagePercent = (memoryUsage.used / memoryLimit) * 100;

    // Debug logging for diagnostics
    const currentOperationMemory = this.getMemoryUsageMB();
    console.log(`[AdaptiveBulkHashService] Memory diagnostics (targeted queries): Used=${(memoryUsage.used/1024/1024).toFixed(1)}MB, Available=${availableMemoryMB.toFixed(1)}MB, Usage=${memoryUsagePercent.toFixed(1)}%, EstimatedBatch=${estimatedBatchMemoryMB.toFixed(1)}MB`);
    
    // CRITICAL: Current heap usage is very high
    if (memoryUsagePercent > 95) { // Increased threshold (was 92%)
      return {
        shouldFallback: true,
        reason: `Critical memory pressure (${memoryUsagePercent.toFixed(1)}% heap usage)`,
        fallbackStrategy: 'individual'
      };
    }

    // HIGH RISK: Batch would use too much available memory
    if (estimatedBatchMemoryMB > availableMemoryMB * 0.9) { // More generous (was 0.8)
      if (validFiles.length > 20) { // Increased threshold (was 10)
        return {
          shouldFallback: true,
          reason: `Batch requires ${estimatedBatchMemoryMB.toFixed(1)}MB, only ${availableMemoryMB.toFixed(1)}MB available`,
          fallbackStrategy: 'smaller-batches',
          suggestedBatchSize: Math.max(Math.floor(validFiles.length / 3), 10) // Less aggressive splitting
        };
      } else {
        return {
          shouldFallback: true,
          reason: `Batch requires ${estimatedBatchMemoryMB.toFixed(1)}MB, only ${availableMemoryMB.toFixed(1)}MB available`,
          fallbackStrategy: 'individual'
        };
      }
    }

    // MODERATE RISK: Large batch with high memory pressure
    if (memoryUsagePercent > 85 && estimatedBatchMemoryMB > 200) { // Increased thresholds
      return {
        shouldFallback: true,
        reason: `High memory pressure (${memoryUsagePercent.toFixed(1)}%) + large batch (${estimatedBatchMemoryMB.toFixed(1)}MB)`,
        fallbackStrategy: 'smaller-batches',
        suggestedBatchSize: Math.max(Math.floor(validFiles.length / 2), 20) // Less aggressive splitting
      };
    }

    // ALL CLEAR: Proceed with batch processing using targeted queries
    return { shouldFallback: false };
  }

  /**
   * Split a batch into smaller sub-batches for gradual processing
   */
  private splitBatchIntoSmallerBatches(batch: string[], maxBatchSize: number): string[][] {
    const subBatches: string[][] = [];
    for (let i = 0; i < batch.length; i += maxBatchSize) {
      subBatches.push(batch.slice(i, i + maxBatchSize));
    }
    return subBatches;
  }
}