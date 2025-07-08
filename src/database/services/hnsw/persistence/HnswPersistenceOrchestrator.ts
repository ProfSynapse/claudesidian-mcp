/**
 * HnswPersistenceOrchestrator - Coordinates HNSW persistence operations
 * Follows Single Responsibility Principle by orchestrating existing services
 * Boy Scout Rule: Replaces the 986-line monolithic HnswPersistenceService with clean coordination
 */

import { logger } from '../../../../utils/logger';
import { DatabaseItem } from '../../../providers/chroma/services/FilterEngine';
import { HnswConfig } from '../config/HnswConfig';
import { PersistenceManager } from '../../../providers/chroma/services/PersistenceManager';
import { CacheManager } from '../../CacheManager';
// HnswDiscoveryService removed - using HnswMetadataManager directly
import { DiagnosticsService } from '../../../providers/chroma/services/DiagnosticsService';
import { ContentHashService } from '../../embedding/ContentHashService';
import { IndexedDbUtils } from './IndexedDbUtils';
import { HnswMetadataManager } from './HnswMetadataManager';
import { HnswIndexOperations } from './HnswIndexOperations';

// Re-export types from original service for backwards compatibility
export interface IndexMetadata {
  collectionName: string;
  itemCount: number;
  dimension: number;
  lastModified: number;
  contentHash: string;
  isPartitioned: boolean;
  partitionCount?: number;
  version: string;
  indexFilename: string;
  estimatedSize: number;
}

export interface IndexLoadResult {
  success: boolean;
  index?: any;
  metadata?: IndexMetadata;
  loadTime?: number;
  errorReason?: string;
}

export interface IndexSaveResult {
  success: boolean;
  filename: string;
  saveTime?: number;
  syncTime?: number;
  estimatedSize?: number;
  errorReason?: string;
}

export interface PersistenceValidationResult {
  isValid: boolean;
  reason?: string;
  itemCountDiff?: number;
  contentChanged?: boolean;
  versionMismatch?: boolean;
}

/**
 * Orchestrates HNSW persistence operations by coordinating existing services
 * Follows SOLID principles - single responsibility for coordination
 */
export class HnswPersistenceOrchestrator {
  private config: HnswConfig;
  private hnswLib: any;
  private metadataManager: HnswMetadataManager;
  private indexOperations: HnswIndexOperations;
  private diagnosticsService: DiagnosticsService;
  private contentHashService: ContentHashService;

  constructor(
    config: HnswConfig,
    hnswLib: any,
    metadataManager: HnswMetadataManager,
    indexOperations: HnswIndexOperations,
    diagnosticsService: DiagnosticsService,
    contentHashService: ContentHashService
  ) {
    this.config = config;
    this.hnswLib = hnswLib;
    this.metadataManager = metadataManager;
    this.indexOperations = indexOperations;
    this.diagnosticsService = diagnosticsService;
    this.contentHashService = contentHashService;

    // Enable debug logging for better troubleshooting
    this.enableDebugLogging();
  }

  /**
   * Enable debug logging for better troubleshooting
   */
  private enableDebugLogging(): void {
    if (this.hnswLib?.EmscriptenFileSystemManager) {
      try {
        this.hnswLib.EmscriptenFileSystemManager.setDebugLogs(true);
        logger.systemLog('Enabled debug logging for EmscriptenFileSystemManager', 'HnswPersistenceOrchestrator');
      } catch (error) {
        logger.systemWarn('Could not enable debug logging for EmscriptenFileSystemManager', 'HnswPersistenceOrchestrator');
      }
    }
  }

  /**
   * Check if we can load a persisted index for a collection
   * Delegates to existing discovery service and validation
   */
  async canLoadPersistedIndex(collectionName: string, currentItems: DatabaseItem[]): Promise<boolean> {
    if (!this.config.persistence.enabled) {
      return false;
    }

    try {
      // Use metadata manager directly instead of problematic discovery service
      const hasMetadata = await this.metadataManager.hasMetadata(collectionName);
      
      if (!hasMetadata) {
        logger.systemLog(
          `No persisted index found for collection: ${collectionName}`,
          'HnswPersistenceOrchestrator'
        );
        return false;
      }

      // Load metadata from cache (managed by CacheManager)
      const metadata = await this.loadIndexMetadata(collectionName);
      if (!metadata) {
        logger.systemLog(
          `No persisted metadata found for collection: ${collectionName}`,
          'HnswPersistenceOrchestrator'
        );
        return false;
      }

      // Validate using existing validation patterns
      const validationResult = this.validateIndexMetadata(metadata, currentItems);
      if (!validationResult.isValid) {
        logger.systemLog(
          `Persisted index is outdated for collection ${collectionName}: ${validationResult.reason}`,
          'HnswPersistenceOrchestrator'
        );
        await this.cleanupPersistedIndex(collectionName);
        return false;
      }

      return true;
    } catch (error) {
      logger.systemWarn(
        `Error checking persisted index for ${collectionName}: ${error instanceof Error ? error.message : String(error)}`,
        'HnswPersistenceOrchestrator'
      );
      return false;
    }
  }

  /**
   * Load index metadata from ChromaDB (delegated to HnswMetadataManager)
   */
  async loadIndexMetadata(collectionName: string): Promise<IndexMetadata | undefined> {
    return this.metadataManager.loadMetadata(collectionName);
  }

  /**
   * Save index metadata to ChromaDB (delegated to HnswMetadataManager)
   */
  async saveIndexMetadata(collectionName: string, metadata: IndexMetadata): Promise<void> {
    return this.metadataManager.saveMetadata(collectionName, metadata);
  }

  /**
   * Clean up persisted index files and metadata (delegated to HnswMetadataManager)
   */
  async cleanupPersistedIndex(collectionName: string): Promise<void> {
    return this.metadataManager.deleteMetadata(collectionName);
  }

  /**
   * Validate if persisted metadata matches current data
   * Uses existing validation patterns instead of custom logic
   */
  private validateIndexMetadata(metadata: IndexMetadata, currentItems: DatabaseItem[]): PersistenceValidationResult {
    // Check basic item count (allow for minor differences for incremental updates)
    const itemCountDiff = Math.abs(metadata.itemCount - currentItems.length);
    const maxAllowedDiff = Math.max(10, metadata.itemCount * 0.1); // 10% difference or 10 items
    
    // If metadata has 0 items, it's likely a placeholder from discovery - be more lenient
    if (metadata.itemCount === 0) {
      logger.systemLog(
        `Placeholder metadata detected for ${metadata.collectionName}, allowing validation`,
        'HnswPersistenceOrchestrator'
      );
    } else if (itemCountDiff > maxAllowedDiff) {
      return {
        isValid: false,
        reason: `Item count mismatch: expected ~${metadata.itemCount}, got ${currentItems.length}`,
        itemCountDiff,
      };
    }

    // Check dimension consistency
    const currentDimension = this.extractDimension(currentItems);
    
    // If cached metadata has dimension 0, it's a placeholder from discovery - update it
    if (metadata.dimension === 0 && currentDimension > 0) {
      logger.systemLog(
        `Updating placeholder dimension from 0 to ${currentDimension} for ${metadata.collectionName}`,
        'HnswPersistenceOrchestrator'
      );
      metadata.dimension = currentDimension;
    } else if (currentDimension !== metadata.dimension && metadata.dimension !== 0) {
      return {
        isValid: false,
        reason: `Dimension mismatch: expected ${metadata.dimension}, got ${currentDimension}`,
      };
    }

    // Check version compatibility - be more lenient with version upgrades
    if (metadata.version && !metadata.version.startsWith('3.') && !metadata.version.startsWith('1.')) {
      return {
        isValid: false,
        reason: `Version mismatch: expected 3.x or 1.x, got ${metadata.version}`,
        versionMismatch: true,
      };
    }

    // If this is an old version (1.x), allow it but mark for upgrade
    if (metadata.version && metadata.version.startsWith('1.')) {
      logger.systemLog(
        `Found old version ${metadata.version} metadata for ${metadata.collectionName}, will upgrade after rebuild`,
        'HnswPersistenceOrchestrator'
      );
      return {
        isValid: false,
        reason: `Old version ${metadata.version} needs upgrade to 3.x`,
        versionMismatch: true,
      };
    }

    // Check content changes using existing ContentHashService
    const currentContentHash = this.calculateContentHash(currentItems);
    const contentChanged = metadata.contentHash !== currentContentHash;
    
    // Allow content changes if item count difference is small (incremental updates)
    if (contentChanged && itemCountDiff > 5) {
      return {
        isValid: false,
        reason: `Content changed significantly (${itemCountDiff} item difference)`,
        contentChanged: true,
        itemCountDiff,
      };
    }

    return { 
      isValid: true,
      contentChanged,
      itemCountDiff,
    };
  }

  /**
   * Extract dimension from items (reused from original)
   */
  private extractDimension(items: DatabaseItem[]): number {
    const firstEmbedding = items.find(item => item.embedding && item.embedding.length > 0)?.embedding;
    return firstEmbedding?.length || 0;
  }

  /**
   * Calculate content hash for change detection
   * Uses existing ContentHashService instead of custom implementation
   */
  private calculateContentHash(items: DatabaseItem[]): string {
    // Create a simple hash based on item IDs and document lengths
    const hashInput = items
      .map(item => `${item.id}:${item.document?.length || 0}`)
      .sort()
      .join('|');
    
    // Use existing ContentHashService instead of custom hash function
    return this.contentHashService.hashContent(hashInput);
  }

  /**
   * Force rebuild by clearing persisted metadata
   */
  async forceRebuild(collectionName: string): Promise<void> {
    logger.systemLog(
      `Force rebuilding index for collection: ${collectionName}`,
      'HnswPersistenceOrchestrator'
    );
    await this.cleanupPersistedIndex(collectionName);
  }

  /**
   * Load HNSW index (delegated to HnswIndexOperations)
   */
  async loadIndex(collectionName: string, metadata?: IndexMetadata): Promise<IndexLoadResult> {
    return this.indexOperations.loadIndex(collectionName, metadata);
  }

  /**
   * Save HNSW index (delegated to HnswIndexOperations)
   */
  async saveIndex(
    collectionName: string,
    hnswIndex: any,
    items: DatabaseItem[],
    isPartitioned: boolean,
    partitionCount?: number
  ): Promise<IndexSaveResult> {
    return this.indexOperations.saveIndex(collectionName, hnswIndex, items, isPartitioned, partitionCount);
  }

  /**
   * Save partitioned HNSW index (delegated to HnswIndexOperations)
   */
  async savePartitionedIndex(
    collectionName: string,
    partitions: Array<{ index: any; itemCount: number }>,
    items: DatabaseItem[]
  ): Promise<IndexSaveResult> {
    return this.indexOperations.savePartitionedIndex(collectionName, partitions, items);
  }

  /**
   * Load partitioned HNSW index (delegated to HnswIndexOperations)
   */
  async loadPartitionedIndex(
    collectionName: string,
    metadata: IndexMetadata
  ): Promise<IndexLoadResult & { partitions?: any[] }> {
    return this.indexOperations.loadPartitionedIndex(collectionName, metadata);
  }

  /**
   * Get cached metadata if available
   */
  getCachedMetadata(collectionName: string): IndexMetadata | undefined {
    if (!this.config.persistence.metadataCacheEnabled) {
      return undefined;
    }
    return this.metadataManager.getCachedMetadata(collectionName);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: HnswConfig): void {
    this.config = newConfig;
    
    // Clear cache if metadata caching is disabled
    if (!newConfig.persistence.metadataCacheEnabled) {
      // Clear all HNSW metadata from cache
      this.metadataManager.clearCache();
    }
    
    // Update index operations config
    this.indexOperations.updateConfig(newConfig);
  }

  /**
   * Get persistence statistics using existing services
   */
  async getStatistics(): Promise<{
    cachedMetadataCount: number;
    persistenceEnabled: boolean;
    cacheEnabled: boolean;
    indexedDbSupported: boolean;
  }> {
    const metadataStats = this.metadataManager.getStatistics();
    
    return {
      cachedMetadataCount: metadataStats.cachedMetadataCount,
      persistenceEnabled: this.config.persistence.enabled,
      cacheEnabled: this.config.persistence.metadataCacheEnabled,
      indexedDbSupported: await this.checkIndexedDbSupport(),
    };
  }

  /**
   * Check IndexedDB support using existing utilities
   */
  private async checkIndexedDbSupport(): Promise<boolean> {
    try {
      const storageInfo = await IndexedDbUtils.checkIndexedDbSupport();
      return storageInfo.supported;
    } catch (error) {
      return false;
    }
  }

  /**
   * Perform comprehensive diagnostics using existing DiagnosticsService patterns
   */
  async diagnose(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    issues: string[];
    recommendations: string[];
    details: any;
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check IndexedDB support
    const indexedDbSupported = await this.checkIndexedDbSupport();
    if (!indexedDbSupported) {
      issues.push('IndexedDB not supported');
      recommendations.push('Use a modern browser with IndexedDB support');
    }

    // Check if hnswLib is properly initialized
    if (!this.hnswLib?.EmscriptenFileSystemManager) {
      issues.push('EmscriptenFileSystemManager not available');
      recommendations.push('Ensure hnswlib-wasm is properly loaded');
    }

    const status = issues.length === 0 ? 'healthy' : (issues.length < 3 ? 'warning' : 'error');

    return {
      status,
      issues,
      recommendations,
      details: {
        statistics: await this.getStatistics(),
        storageUsage: await IndexedDbUtils.getStorageUsageInfo(),
      },
    };
  }

  /**
   * Discover existing indexes using metadata manager directly
   * Eliminates problematic WASM filesystem dependency
   */
  async discoverExistingIndexes(): Promise<string[]> {
    try {
      // Use metadata manager directly instead of problematic discovery service
      return await this.metadataManager.listCollectionsWithMetadata();
    } catch (error) {
      logger.systemError(
        new Error(`Metadata discovery failed: ${error instanceof Error ? error.message : String(error)}`),
        'HnswPersistenceOrchestrator'
      );
      // Re-throw to let the caller handle the failure
      throw error;
    }
  }
}