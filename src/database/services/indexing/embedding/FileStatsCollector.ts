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
  private maxMemoryPerBatch: number = 100 * 1024 * 1024; // 100MB default
  private minBatchSize: number = 10;
  private maxBatchSize: number = 500;
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
        batchSize: this.minBatchSize,
        maxMemoryPerBatch: this.maxMemoryPerBatch,
        estimatedMemoryUsage: 0,
        processingDelay: this.defaultProcessingDelay
      };
    }

    // Calculate average file size
    const totalSize = validFiles.reduce((sum, stat) => sum + stat.size, 0);
    const averageFileSize = totalSize / validFiles.length;
    
    // Estimate memory usage: file content + hash + metadata overhead
    // Conservative estimate: 3x file size (content + processing overhead)
    const estimatedMemoryPerFile = averageFileSize * 3;
    
    // Calculate safe batch size based on memory constraints
    let safeBatchSize = Math.floor(this.maxMemoryPerBatch / estimatedMemoryPerFile);
    
    // Apply min/max constraints
    safeBatchSize = Math.max(this.minBatchSize, safeBatchSize);
    safeBatchSize = Math.min(this.maxBatchSize, safeBatchSize);
    
    // For very large files (>10MB), use smaller batches
    const hasLargeFiles = validFiles.some(stat => stat.size > 10 * 1024 * 1024);
    if (hasLargeFiles) {
      safeBatchSize = Math.min(safeBatchSize, 20);
    }

    // Calculate estimated memory usage for this batch size
    const estimatedMemoryUsage = safeBatchSize * estimatedMemoryPerFile;
    
    // Adjust processing delay based on batch size (larger batches = longer delays)
    const processingDelay = safeBatchSize > 100 ? 2000 : this.defaultProcessingDelay;

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
    maxBatchSize: number;
    defaultProcessingDelay: number;
  }>): void {
    if (config.maxMemoryPerBatch !== undefined) {
      this.maxMemoryPerBatch = config.maxMemoryPerBatch;
    }
    if (config.minBatchSize !== undefined) {
      this.minBatchSize = config.minBatchSize;
    }
    if (config.maxBatchSize !== undefined) {
      this.maxBatchSize = config.maxBatchSize;
    }
    if (config.defaultProcessingDelay !== undefined) {
      this.defaultProcessingDelay = config.defaultProcessingDelay;
    }
  }
}