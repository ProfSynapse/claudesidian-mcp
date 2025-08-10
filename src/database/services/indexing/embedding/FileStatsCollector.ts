/**
 * FileStatsCollector - Lightweight file metadata collection service
 * 
 * This service collects file metadata (paths, sizes, modification times) without reading
 * file content, enabling memory-safe batch size calculations for bulk hash operations.
 * 
 * Imports:
 * - Plugin: Obsidian plugin instance for vault access
 * - TFile: Obsidian file type for type safety
 * - FileUtils: Common file validation utilities
 * 
 * Key Features:
 * - Collects file metadata without content reading (memory efficient)
 * - Calculates adaptive batch sizes based on file sizes and available memory
 * - Provides file statistics for bulk processing optimization
 */

import { Plugin, TFile } from 'obsidian';
import { FileUtils } from '../../../utils/FileUtils';

export interface FileStats {
  filePath: string;
  size: number;
  mtime: number; // Modification time in milliseconds
  isValid: boolean;
}

export interface BatchConfiguration {
  batchSize: number;
  maxMemoryPerBatch: number; // In bytes
  estimatedMemoryUsage: number;
  processingDelay: number; // Milliseconds between batches
}

export class FileStatsCollector {
  private plugin: Plugin;
  private maxMemoryPerBatch: number = 200 * 1024 * 1024; // 200MB default
  private minBatchSize: number = 1; // At least 1 file per batch
  private maxBatchSize: number = 500; // Hard cap for sanity
  private minMemoryPerFile: number = 1024; // At least 1KB per file for overhead
  private defaultProcessingDelay: number = 1000; // 1 second between batches

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /**
   * Collect lightweight metadata for all files in given paths
   * @param filePaths Array of file paths to collect stats for
   * @returns Promise resolving to array of file statistics
   */
  async collectFileStats(filePaths: string[]): Promise<FileStats[]> {
    const stats: FileStats[] = [];
    
    for (const filePath of filePaths) {
      try {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        
        if (!FileUtils.isValidFile(file)) {
          stats.push({
            filePath: FileUtils.normalizePath(filePath),
            size: 0,
            mtime: 0,
            isValid: false
          });
          continue;
        }

        const tFile = file as TFile;
        stats.push({
          filePath: FileUtils.normalizePath(filePath),
          size: tFile.stat.size,
          mtime: tFile.stat.mtime,
          isValid: true
        });
      } catch (error) {
        console.error(`[FileStatsCollector] Error collecting stats for ${filePath}:`, error);
        stats.push({
          filePath: FileUtils.normalizePath(filePath),
          size: 0,
          mtime: 0,
          isValid: false
        });
      }
    }

    return stats;
  }

  /**
   * Calculate adaptive batch configuration based on file statistics
   * @param fileStats Array of file statistics
   * @returns Batch configuration optimized for memory usage
   */
  calculateAdaptiveBatchConfig(fileStats: FileStats[]): BatchConfiguration {
    const validFiles = fileStats.filter(stat => stat.isValid);
    
    if (validFiles.length === 0) {
      return {
        batchSize: 0,
        maxMemoryPerBatch: this.maxMemoryPerBatch,
        estimatedMemoryUsage: 0,
        processingDelay: this.defaultProcessingDelay
      };
    }

    // Calculate file size statistics for better estimation
    const fileSizes = validFiles.map(stat => Math.max(stat.size, 0)); // Ensure non-negative
    const totalSize = fileSizes.reduce((sum, size) => sum + size, 0);
    const averageFileSize = validFiles.length > 0 ? totalSize / validFiles.length : 0;
    const maxFileSize = fileSizes.length > 0 ? Math.max(...fileSizes) : 0;
    
    // Robust memory estimation with minimum overhead and scaling factor
    // For small files: ensure minimum overhead (1KB)
    // For larger files: 3x file size for content + hash + processing overhead
    const baseMemoryPerFile = Math.max(averageFileSize * 3, this.minMemoryPerFile);
    
    // Handle edge case: if average is misleading due to one huge file,
    // use the max file size for more conservative estimation
    const conservativeMemoryPerFile = maxFileSize > averageFileSize * 10 
      ? Math.max(maxFileSize * 3, this.minMemoryPerFile)
      : baseMemoryPerFile;
    
    // Calculate safe batch size based on memory constraints
    // Guard against division by zero or very small numbers
    let safeBatchSize = conservativeMemoryPerFile > 0 
      ? Math.floor(this.maxMemoryPerBatch / conservativeMemoryPerFile)
      : this.maxBatchSize;
    
    // Apply all constraints in proper order
    safeBatchSize = Math.max(this.minBatchSize, safeBatchSize); // At least minimum
    safeBatchSize = Math.min(safeBatchSize, this.maxBatchSize); // Hard cap for sanity
    safeBatchSize = Math.min(safeBatchSize, validFiles.length); // Can't exceed available files
    
    // Additional constraints based on file characteristics
    if (maxFileSize > 10 * 1024 * 1024) { // Files > 10MB
      safeBatchSize = Math.min(safeBatchSize, 20);
    } else if (maxFileSize > 1 * 1024 * 1024) { // Files > 1MB
      safeBatchSize = Math.min(safeBatchSize, 100);
    }
    
    // For very small batches, don't apply artificial minimum
    if (validFiles.length < this.minBatchSize) {
      safeBatchSize = validFiles.length;
    }

    // Calculate final estimated memory usage based on actual batch size
    const estimatedMemoryUsage = safeBatchSize * conservativeMemoryPerFile;
    
    // Dynamic processing delay based on batch characteristics
    let processingDelay = this.defaultProcessingDelay;
    if (safeBatchSize > 200) {
      processingDelay = 3000; // 3 seconds for very large batches
    } else if (safeBatchSize > 100) {
      processingDelay = 2000; // 2 seconds for large batches
    } else if (estimatedMemoryUsage > 100 * 1024 * 1024) {
      processingDelay = 1500; // 1.5 seconds for memory-intensive batches
    }

    return {
      batchSize: safeBatchSize,
      maxMemoryPerBatch: this.maxMemoryPerBatch,
      estimatedMemoryUsage,
      processingDelay
    };
  }

  /**
   * Create adaptive batches from file paths based on statistics
   * @param filePaths Array of file paths to batch
   * @returns Promise resolving to array of file path batches
   */
  async createAdaptiveBatches(filePaths: string[]): Promise<string[][]> {
    // Collect file stats
    const fileStats = await this.collectFileStats(filePaths);
    
    // Calculate batch configuration
    const batchConfig = this.calculateAdaptiveBatchConfig(fileStats);
    
    // Create batches
    const batches: string[][] = [];
    for (let i = 0; i < filePaths.length; i += batchConfig.batchSize) {
      const batch = filePaths.slice(i, i + batchConfig.batchSize);
      batches.push(batch);
    }

    console.log(`[FileStatsCollector] Created ${batches.length} adaptive batches:`, {
      totalFiles: filePaths.length,
      batchSize: batchConfig.batchSize,
      estimatedMemoryUsage: Math.round(batchConfig.estimatedMemoryUsage / 1024 / 1024) + 'MB',
      processingDelay: batchConfig.processingDelay + 'ms'
    });

    return batches;
  }

  /**
   * Get memory usage statistics for current browser environment
   * @returns Memory usage information or null if not available
   */
  getMemoryUsage(): { used: number; total: number; available: number } | null {
    if ('memory' in performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        available: memory.jsHeapSizeLimit - memory.usedJSHeapSize
      };
    }
    return null;
  }

  /**
   * Check if system is under memory pressure
   * @param threshold Pressure threshold (0.0 to 1.0, default 0.8 = 80% usage)
   * @returns True if memory usage is above threshold
   */
  isMemoryPressureHigh(threshold: number = 0.8): boolean {
    const memoryUsage = this.getMemoryUsage();
    if (!memoryUsage) {
      return false; // Conservative: assume no pressure if we can't measure
    }
    
    const usageRatio = memoryUsage.used / memoryUsage.total;
    return usageRatio > threshold;
  }

  /**
   * Update batch configuration limits
   * @param config Partial configuration to update
   */
  updateConfiguration(config: Partial<{
    maxMemoryPerBatch: number;
    minBatchSize: number;
    defaultProcessingDelay: number;
  }>): void {
    if (config.maxMemoryPerBatch !== undefined) {
      this.maxMemoryPerBatch = config.maxMemoryPerBatch;
    }
    if (config.minBatchSize !== undefined) {
      this.minBatchSize = config.minBatchSize;
    }
    // maxBatchSize removed - memory constraints naturally limit batch sizes
    if (config.defaultProcessingDelay !== undefined) {
      this.defaultProcessingDelay = config.defaultProcessingDelay;
    }
  }
}