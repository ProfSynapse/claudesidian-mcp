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
      
      // Step 2: Get bulk database metadata for all files in batch
      const dbStartTime = performance.now();
      const dbMetadata = await this.getBulkDatabaseMetadata(filePaths, vectorStore);
      const dbEndTime = performance.now();
      const dbEndMemory = this.getMemoryUsageMB();
      
      console.log(`[AdaptiveBulkHashService] Batch database query:`, {
        files: filePaths.length,
        found: dbMetadata.size,
        timeMs: Math.round(dbEndTime - dbStartTime),
        memoryDeltaMB: Math.round((dbEndMemory - hashEndMemory) * 100) / 100,
        memoryPressure: this.getMemoryPressureLevel()
      });
      
      // Step 3: Compare hashes in memory (the "spreadsheet" operation)
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
        
        // Check persistent state first
        if (this.stateManager.isFileProcessed(data.filePath, data.currentHash)) {
          results.push({
            filePath: data.filePath,
            needsEmbedding: false,
            currentHash: data.currentHash,
            skipped: true,
            reason: 'Already processed (state)'
          });
          continue;
        }
        
        // Check database metadata
        const dbInfo = dbMetadata.get(data.filePath);
        if (!dbInfo) {
          // No embeddings found, needs embedding
          results.push({
            filePath: data.filePath,
            needsEmbedding: true,
            currentHash: data.currentHash,
            reason: 'No existing embeddings'
          });
          continue;
        }
        
        if (!dbInfo.contentHash) {
          // No content hash in metadata, needs embedding
          results.push({
            filePath: data.filePath,
            needsEmbedding: true,
            currentHash: data.currentHash,
            reason: 'No content hash in metadata'
          });
          continue;
        }
        
        // Compare hashes
        const hashMatches = data.currentHash === dbInfo.contentHash;
        if (hashMatches) {
          // Hashes match, mark as processed in state
          this.stateManager.markFileProcessed(data.filePath, data.currentHash, 'existing');
          results.push({
            filePath: data.filePath,
            needsEmbedding: false,
            currentHash: data.currentHash,
            storedHash: dbInfo.contentHash,
            reason: 'Hash matches, marked as processed'
          });
        } else {
          // Hashes don't match, needs re-embedding
          results.push({
            filePath: data.filePath,
            needsEmbedding: true,
            currentHash: data.currentHash,
            storedHash: dbInfo.contentHash,
            reason: 'Content changed'
          });
        }
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

  /**
   * Get database metadata for all files in batch with single query
   * @param filePaths Array of file paths
   * @param vectorStore Vector store instance
   * @returns Promise resolving to Map of file metadata
   */
  private async getBulkDatabaseMetadata(filePaths: string[], vectorStore: any): Promise<Map<string, {
    contentHash?: string;
    hasEmbeddings: boolean;
  }>> {
    const metadataMap = new Map<string, { contentHash?: string; hasEmbeddings: boolean }>();
    
    try {
      // Check if collection exists
      const collectionExists = await vectorStore.hasCollection('file_embeddings');
      if (!collectionExists) {
        // No collection exists, all files need embedding
        filePaths.forEach(filePath => {
          metadataMap.set(FileUtils.normalizePath(filePath), {
            hasEmbeddings: false
          });
        });
        return metadataMap;
      }
      
      // Normalize paths for database query
      const normalizedPaths = filePaths.map(path => FileUtils.normalizePath(path));
      
      // Try to use bulk metadata query if available (new optimization)
      let bulkResults: Array<{ filePath: string; contentHash?: string; metadata: Record<string, any> }> = [];
      
      if (vectorStore.getBulkFileMetadata) {
        // Use new bulk metadata method
        bulkResults = await vectorStore.getBulkFileMetadata('file_embeddings', normalizedPaths);
      } else {
        // Fallback to individual query approach
        const queryResult = await vectorStore.query('file_embeddings', {
          where: { filePath: { $in: normalizedPaths } },
          nResults: 1000, // Get multiple chunks per file if needed
          include: ['metadatas']
        });
        
        // Convert query result to bulk results format
        if (queryResult.metadatas && queryResult.metadatas[0]) {
          const metadatas = queryResult.metadatas[0];
          const filePathMap = new Map<string, { contentHash?: string; metadata: Record<string, any> }>();
          
          for (const metadata of metadatas) {
            if (metadata && metadata.filePath) {
              const filePath = metadata.filePath;
              if (!filePathMap.has(filePath)) {
                filePathMap.set(filePath, {
                  contentHash: metadata.contentHash,
                  metadata: metadata
                });
              }
            }
          }
          
          bulkResults = Array.from(filePathMap.entries()).map(([filePath, data]) => ({
            filePath,
            contentHash: data.contentHash,
            metadata: data.metadata
          }));
        }
      }
      
      // Process bulk results and populate metadata map
      for (const result of bulkResults) {
        metadataMap.set(result.filePath, {
          contentHash: result.contentHash,
          hasEmbeddings: true
        });
      }
      
      // Add entries for files not found in database
      normalizedPaths.forEach(filePath => {
        if (!metadataMap.has(filePath)) {
          metadataMap.set(filePath, {
            hasEmbeddings: false
          });
        }
      });
      
      return metadataMap;
      
    } catch (error) {
      console.error(`[AdaptiveBulkHashService] Error getting bulk database metadata:`, error);
      
      // On error, assume all files need embedding
      filePaths.forEach(filePath => {
        metadataMap.set(FileUtils.normalizePath(filePath), {
          hasEmbeddings: false
        });
      });
      
      return metadataMap;
    }
  }


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
    const totalFileSize = validFiles.reduce((sum, stat) => sum + stat.size, 0);
    const estimatedBatchMemory = Math.max(totalFileSize * 3, validFiles.length * 1024); // 3x file size or min 1KB per file
    const estimatedBatchMemoryMB = estimatedBatchMemory / (1024 * 1024);

    // Get current memory state
    const memoryUsage = this.fileStatsCollector.getMemoryUsage();
    if (!memoryUsage) {
      // If we can't measure memory, use conservative thresholds based on batch characteristics
      const maxFileSize = Math.max(...validFiles.map(stat => stat.size));
      
      // Very large files or many files - be conservative
      if (maxFileSize > 50 * 1024 * 1024) { // Files > 50MB
        return {
          shouldFallback: true,
          reason: `Large file detected (${Math.round(maxFileSize / 1024 / 1024)}MB), memory usage unknown`,
          fallbackStrategy: 'individual'
        };
      } else if (validFiles.length > 200) { // Many files
        return {
          shouldFallback: true,
          reason: `Large batch (${validFiles.length} files), memory usage unknown`,
          fallbackStrategy: 'smaller-batches',
          suggestedBatchSize: 50
        };
      }
      
      return { shouldFallback: false };
    }

    // Use heap limit instead of current allocation for more realistic pressure calculation
    const memoryLimit = (performance as any).memory?.jsHeapSizeLimit || memoryUsage.total;
    const availableMemoryMB = (memoryLimit - memoryUsage.used) / (1024 * 1024);
    const memoryUsagePercent = (memoryUsage.used / memoryLimit) * 100;

    // Smart decision matrix based on actual requirements vs availability
    
    // Debug: Log actual memory numbers for diagnostics including plugin context
    const currentOperationMemory = this.getMemoryUsageMB();
    
    // Get plugin-specific memory info if available
    let pluginMemoryInfo = '';
    try {
      if ((this.plugin as any).getMemoryInfo) {
        const memInfo = (this.plugin as any).getMemoryInfo();
        pluginMemoryInfo = `, PluginContext: HeapLimit=${memInfo.totalMemoryMB.toFixed(1)}MB`;
      }
    } catch (error) {
      pluginMemoryInfo = ', PluginContext: unavailable';
    }
    
    console.log(`[AdaptiveBulkHashService] Memory diagnostics: Used=${(memoryUsage.used/1024/1024).toFixed(1)}MB, Allocated=${(memoryUsage.total/1024/1024).toFixed(1)}MB, Limit=${(memoryLimit/1024/1024).toFixed(1)}MB, Available=${availableMemoryMB.toFixed(1)}MB, Usage=${memoryUsagePercent.toFixed(1)}%, EstimatedBatch=${estimatedBatchMemoryMB.toFixed(1)}MB, CurrentOperation=${currentOperationMemory}MB${pluginMemoryInfo}`);
    
    // CRITICAL: Current heap usage is very high regardless of batch size
    if (memoryUsagePercent > 92) {
      return {
        shouldFallback: true,
        reason: `Critical memory pressure (${memoryUsagePercent.toFixed(1)}% heap usage)`,
        fallbackStrategy: 'individual'
      };
    }

    // HIGH RISK: Batch would likely push us over safe limits
    if (estimatedBatchMemoryMB > availableMemoryMB * 0.8) { // Batch needs >80% of available memory
      if (validFiles.length > 10) {
        return {
          shouldFallback: true,
          reason: `Batch requires ${estimatedBatchMemoryMB.toFixed(1)}MB, only ${availableMemoryMB.toFixed(1)}MB available`,
          fallbackStrategy: 'smaller-batches',
          suggestedBatchSize: Math.max(Math.floor(validFiles.length / 4), 5)
        };
      } else {
        return {
          shouldFallback: true,
          reason: `Batch requires ${estimatedBatchMemoryMB.toFixed(1)}MB, only ${availableMemoryMB.toFixed(1)}MB available`,
          fallbackStrategy: 'individual'
        };
      }
    }

    // MODERATE RISK: Large batch with moderate memory pressure
    if (memoryUsagePercent > 75 && estimatedBatchMemoryMB > 100) {
      return {
        shouldFallback: true,
        reason: `Moderate memory pressure (${memoryUsagePercent.toFixed(1)}%) + large batch (${estimatedBatchMemoryMB.toFixed(1)}MB)`,
        fallbackStrategy: 'smaller-batches',
        suggestedBatchSize: Math.max(Math.floor(validFiles.length / 2), 10)
      };
    }

    // LOW RISK: Batch size is very small anyway - no meaningful benefit to fallback
    if (estimatedBatchMemoryMB < 5) { // Less than 5MB estimated
      return { shouldFallback: false };
    }

    // ALL CLEAR: Proceed with batch processing
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