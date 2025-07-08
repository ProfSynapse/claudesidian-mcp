/**
 * IndexedDbUtils - Utilities for IndexedDB operations with hnswlib-wasm
 * Follows Single Responsibility Principle by focusing only on IndexedDB helpers
 * Provides safe filename generation and storage management for HNSW indexes
 */

import { logger } from '../../../../utils/logger';

export interface StorageInfo {
  supported: boolean;
  quota?: number;
  usage?: number;
  available?: number;
  percentUsed?: number;
}

export interface IndexInfo {
  filename: string;
  collectionName: string;
  lastModified: number;
  estimatedSize: number;
}

export class IndexedDbUtils {
  private static readonly SAFE_FILENAME_REGEX = /[^a-zA-Z0-9_-]/g;
  private static readonly MAX_FILENAME_LENGTH = 200;
  private static readonly INDEX_PREFIX = 'hnsw_';
  private static readonly PARTITION_SUFFIX = '_part_';

  /**
   * Generate a safe filename for IndexedDB storage
   * @param collectionName Collection name to convert
   * @returns Safe filename for use with hnswlib-wasm
   */
  static generateSafeFilename(collectionName: string): string {
    if (!collectionName || typeof collectionName !== 'string') {
      throw new Error('Collection name must be a non-empty string');
    }

    // Start with the prefix
    let safeFilename = this.INDEX_PREFIX;
    
    // Clean the collection name
    const cleanName = collectionName
      .replace(this.SAFE_FILENAME_REGEX, '_') // Replace invalid chars with underscore
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores

    if (!cleanName) {
      throw new Error('Collection name resulted in empty filename after sanitization');
    }

    safeFilename += cleanName;

    // Ensure length is within limits
    if (safeFilename.length > this.MAX_FILENAME_LENGTH) {
      const hash = this.generateSimpleHash(collectionName);
      const maxBaseLength = this.MAX_FILENAME_LENGTH - hash.length - 1;
      safeFilename = safeFilename.substring(0, maxBaseLength) + '_' + hash;
    }

    return safeFilename;
  }

  /**
   * Generate safe filename for partition
   * @param collectionName Collection name
   * @param partitionIndex Partition index
   * @returns Safe partition filename
   */
  static generatePartitionFilename(collectionName: string, partitionIndex: number): string {
    const baseFilename = this.generateSafeFilename(collectionName);
    return `${baseFilename}${this.PARTITION_SUFFIX}${partitionIndex}`;
  }

  /**
   * Extract collection name from filename
   * @param filename Safe filename
   * @returns Original collection name (best effort)
   */
  static extractCollectionName(filename: string): string {
    if (!filename.startsWith(this.INDEX_PREFIX)) {
      return filename;
    }

    let extracted = filename.substring(this.INDEX_PREFIX.length);
    
    // Handle partition suffix
    const partitionIndex = extracted.indexOf(this.PARTITION_SUFFIX);
    if (partitionIndex !== -1) {
      extracted = extracted.substring(0, partitionIndex);
    }

    // Convert underscores back to something more readable (limited recovery)
    return extracted.replace(/_/g, '-');
  }

  /**
   * Check if browser supports IndexedDB and required features
   * @returns Storage support information
   */
  static async checkIndexedDbSupport(): Promise<StorageInfo> {
    const result: StorageInfo = { supported: false };

    try {
      // Check basic IndexedDB support
      if (typeof indexedDB === 'undefined') {
        logger.systemWarn('IndexedDB not supported in this environment', 'IndexedDbUtils');
        return result;
      }

      // Check if we can estimate storage
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        try {
          const estimate = await navigator.storage.estimate();
          result.quota = estimate.quota;
          result.usage = estimate.usage;
          result.available = (estimate.quota || 0) - (estimate.usage || 0);
          result.percentUsed = estimate.quota ? (estimate.usage || 0) / estimate.quota * 100 : 0;
        } catch (error) {
          logger.systemWarn(
            `Storage estimation failed: ${error instanceof Error ? error.message : String(error)}`,
            'IndexedDbUtils'
          );
        }
      }

      result.supported = true;
      return result;
    } catch (error) {
      logger.systemError(
        new Error(`IndexedDB support check failed: ${error instanceof Error ? error.message : String(error)}`),
        'IndexedDbUtils'
      );
      return result;
    }
  }

  /**
   * Validate storage quota before operations
   * @param requiredSpace Estimated space needed in bytes
   * @returns True if sufficient space is likely available
   */
  static async validateStorageQuota(requiredSpace: number): Promise<boolean> {
    try {
      const storageInfo = await this.checkIndexedDbSupport();
      
      if (!storageInfo.supported) {
        logger.systemWarn('IndexedDB not supported, cannot validate quota', 'IndexedDbUtils');
        return false;
      }

      if (storageInfo.available !== undefined) {
        const hasSpace = storageInfo.available >= requiredSpace;
        if (!hasSpace) {
          logger.systemWarn(
            `Insufficient storage: need ${requiredSpace} bytes, have ${storageInfo.available} bytes`,
            'IndexedDbUtils'
          );
        }
        return hasSpace;
      }

      // If we can't determine space, assume it's available
      logger.systemLog(
        'Storage quota validation skipped - quota information unavailable',
        'IndexedDbUtils'
      );
      return true;
    } catch (error) {
      logger.systemError(
        new Error(`Storage quota validation failed: ${error instanceof Error ? error.message : String(error)}`),
        'IndexedDbUtils'
      );
      return false; // Err on the side of caution
    }
  }

  /**
   * Estimate index size based on item count and dimension
   * @param itemCount Number of items in index
   * @param dimension Embedding dimension
   * @param isPartitioned Whether index is partitioned
   * @returns Estimated size in bytes
   */
  static estimateIndexSize(itemCount: number, dimension: number, isPartitioned = false): number {
    // Rough estimates based on HNSW structure
    const bytesPerFloat = 4;
    const embeddingSize = dimension * bytesPerFloat;
    const graphOverhead = itemCount * 64; // Approximate graph structure overhead
    const baseSize = (itemCount * embeddingSize) + graphOverhead;
    
    // Partitioned indexes have some additional overhead
    const partitionOverhead = isPartitioned ? baseSize * 0.1 : 0;
    
    return Math.ceil(baseSize + partitionOverhead);
  }

  /**
   * Generate simple hash for filename collision resolution
   * @param input String to hash
   * @returns Simple hash string
   */
  private static generateSimpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  /**
   * Get formatted storage usage information
   * @returns Formatted storage info for logging
   */
  static async getStorageUsageInfo(): Promise<string> {
    try {
      const info = await this.checkIndexedDbSupport();
      
      if (!info.supported) {
        return 'IndexedDB not supported';
      }

      if (info.quota && info.usage !== undefined) {
        const quotaMB = (info.quota / 1024 / 1024).toFixed(1);
        const usageMB = (info.usage / 1024 / 1024).toFixed(1);
        const availableMB = (info.available || 0) / 1024 / 1024;
        const percentUsed = info.percentUsed?.toFixed(1) || '0';
        
        return `Storage: ${usageMB}MB / ${quotaMB}MB used (${percentUsed}%), ${availableMB.toFixed(1)}MB available`;
      }

      return 'Storage quota information unavailable';
    } catch (error) {
      return `Storage info error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Validate filename is safe for hnswlib-wasm
   * @param filename Filename to validate
   * @returns True if filename is safe
   */
  static validateFilename(filename: string): boolean {
    if (!filename || typeof filename !== 'string') {
      return false;
    }

    // Check length
    if (filename.length > this.MAX_FILENAME_LENGTH) {
      return false;
    }

    // Check for dangerous characters
    if (this.SAFE_FILENAME_REGEX.test(filename)) {
      return false;
    }

    // Check for reserved names or patterns
    const reservedPatterns = ['.', '..', 'CON', 'PRN', 'AUX', 'NUL'];
    const upperFilename = filename.toUpperCase();
    
    for (const pattern of reservedPatterns) {
      if (upperFilename === pattern || upperFilename.startsWith(pattern + '.')) {
        return false;
      }
    }

    return true;
  }

  /**
   * Create diagnostic information for troubleshooting
   * @returns Diagnostic information object
   */
  static async createDiagnosticInfo(): Promise<{
    indexedDbSupported: boolean;
    storageInfo: StorageInfo;
    userAgent: string;
    timestamp: number;
  }> {
    const storageInfo = await this.checkIndexedDbSupport();
    
    return {
      indexedDbSupported: storageInfo.supported,
      storageInfo,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      timestamp: Date.now(),
    };
  }

  /**
   * Log storage diagnostics for debugging
   */
  static async logStorageDiagnostics(): Promise<void> {
    try {
      const diagnostics = await this.createDiagnosticInfo();
      const usageInfo = await this.getStorageUsageInfo();
      
      logger.systemLog(
        `IndexedDB Diagnostics: ${JSON.stringify(diagnostics, null, 2)}`,
        'IndexedDbUtils'
      );
      
      logger.systemLog(usageInfo, 'IndexedDbUtils');
    } catch (error) {
      logger.systemError(
        new Error(`Failed to log storage diagnostics: ${error instanceof Error ? error.message : String(error)}`),
        'IndexedDbUtils'
      );
    }
  }
}