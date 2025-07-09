/**
 * HnswMetadataManager - Manages HNSW metadata persistence to/from ChromaDB
 * Follows Single Responsibility Principle by focusing only on metadata operations
 * Boy Scout Rule: Replaces custom metadata file handling with proper ChromaDB integration
 */

import { logger } from '../../../../utils/logger';
import { PersistenceManager } from '../../../providers/chroma/services/PersistenceManager';
import { IndexMetadata } from './HnswPersistenceOrchestrator';

/**
 * Manages HNSW metadata persistence using ChromaDB infrastructure
 * Bridges the gap between HNSW operations and ChromaDB data storage
 */
export class HnswMetadataManager {
  private persistenceManager: PersistenceManager;
  private cache: Map<string, IndexMetadata> = new Map();
  private readonly metadataDirectory: string;

  constructor(
    persistenceManager: PersistenceManager,
    baseDataPath: string
  ) {
    this.persistenceManager = persistenceManager;
    // Normalize path separators to use the system's native separator
    const path = require('path');
    this.metadataDirectory = path.join(baseDataPath, 'collections', 'hnsw-indexes');
  }

  /**
   * Load metadata from ChromaDB data folder
   * Uses existing PersistenceManager instead of custom file operations
   */
  async loadMetadata(collectionName: string): Promise<IndexMetadata | undefined> {
    const cacheKey = `hnsw_metadata_${collectionName}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.systemLog(
        `Loaded metadata from cache for collection: ${collectionName}`,
        'HnswMetadataManager'
      );
      return cached;
    }

    try {
      // Load from ChromaDB data folder using existing PersistenceManager
      const path = require('path');
      const metadataPath = path.join(this.metadataDirectory, `${collectionName}-metadata.json`);
      
      // Check if file exists using PersistenceManager
      const result = await this.persistenceManager.loadFromFile(metadataPath);
      if (!result) {
        logger.systemLog(
          `No metadata file found for collection: ${collectionName}`,
          'HnswMetadataManager'
        );
        return undefined;
      }

      // The PersistenceManager returns PersistenceData, so we need to extract the metadata
      const metadata = result.metadata as IndexMetadata;

      // Cache the loaded metadata
      this.cache.set(cacheKey, metadata);
      
      logger.systemLog(
        `Loaded metadata from file for collection: ${collectionName}`,
        'HnswMetadataManager'
      );
      
      return metadata;
    } catch (error) {
      logger.systemWarn(
        `Failed to load metadata for collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`,
        'HnswMetadataManager'
      );
      return undefined;
    }
  }

  /**
   * Save metadata to ChromaDB data folder
   * Uses existing PersistenceManager for reliable file operations
   */
  async saveMetadata(collectionName: string, metadata: IndexMetadata): Promise<void> {
    const cacheKey = `hnsw_metadata_${collectionName}`;
    
    try {
      // Ensure metadata directory exists
      this.persistenceManager.ensureDirectory(this.metadataDirectory);
      
      // Save to file using existing PersistenceManager (atomic operations)
      const path = require('path');
      const dataPath = path.join(this.metadataDirectory, `${collectionName}-metadata.json`);
      const metaPath = path.join(this.metadataDirectory, `${collectionName}-metadata.meta.json`);
      
      // PersistenceManager expects PersistenceData format
      const persistenceData = {
        items: [], // No items for metadata-only persistence
        metadata: metadata
      };
      
      await this.persistenceManager.saveToFile(dataPath, metaPath, persistenceData);
      
      // Cache the saved metadata
      this.cache.set(cacheKey, metadata);
      
      logger.systemLog(
        `Saved metadata for collection: ${collectionName}`,
        'HnswMetadataManager'
      );
    } catch (error) {
      logger.systemError(
        new Error(`Failed to save metadata for collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
        'HnswMetadataManager'
      );
      throw error;
    }
  }

  /**
   * Check if metadata exists for a collection
   */
  async hasMetadata(collectionName: string): Promise<boolean> {
    const cacheKey = `hnsw_metadata_${collectionName}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return true;
    }

    // Check file existence by trying to load it
    const path = require('path');
    const metadataPath = path.join(this.metadataDirectory, `${collectionName}-metadata.json`);
    try {
      const content = await this.persistenceManager.loadFromFile(metadataPath);
      return !!content;
    } catch {
      return false;
    }
  }

  /**
   * Delete metadata for a collection
   */
  async deleteMetadata(collectionName: string): Promise<void> {
    const cacheKey = `hnsw_metadata_${collectionName}`;
    
    try {
      // Remove from cache
      this.cache.delete(cacheKey);
      
      // Remove from file system
      const path = require('path');
      const metadataPath = path.join(this.metadataDirectory, `${collectionName}-metadata.json`);
      
      try {
        // PersistenceManager doesn't have removeFile, use the filesystem directly
        const fs = require('fs');
        if (fs.existsSync(metadataPath)) {
          fs.unlinkSync(metadataPath);
        }
        
        // Also remove the meta file if it exists
        const metaPath = path.join(this.metadataDirectory, `${collectionName}-metadata.meta.json`);
        if (fs.existsSync(metaPath)) {
          fs.unlinkSync(metaPath);
        }
      } catch (error) {
        // File might not exist, which is okay
        logger.systemLog(
          `Metadata file may not exist for collection: ${collectionName}`,
          'HnswMetadataManager'
        );
      }
      
      logger.systemLog(
        `Deleted metadata for collection: ${collectionName}`,
        'HnswMetadataManager'
      );
    } catch (error) {
      logger.systemError(
        new Error(`Failed to delete metadata for collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
        'HnswMetadataManager'
      );
      throw error;
    }
  }

  /**
   * List all collections with metadata
   */
  async listCollectionsWithMetadata(): Promise<string[]> {
    try {
      // Use filesystem directly since PersistenceManager.listSubdirectories returns subdirectories, not files
      const fs = require('fs');
      if (!fs.existsSync(this.metadataDirectory)) {
        return [];
      }
      
      const files = fs.readdirSync(this.metadataDirectory);
      
      // Extract collection names from metadata files
      const collections = files
        .filter((file: string) => file.endsWith('-metadata.json'))
        .map((file: string) => file.replace('-metadata.json', ''));
      
      logger.systemLog(
        `Found ${collections.length} collections with metadata: ${collections.join(', ')}`,
        'HnswMetadataManager'
      );
      
      return collections;
    } catch (error) {
      logger.systemWarn(
        `Failed to list collections with metadata: ${error instanceof Error ? error.message : String(error)}`,
        'HnswMetadataManager'
      );
      return [];
    }
  }

  /**
   * Clear all cached metadata
   */
  clearCache(): void {
    this.cache.clear();
    logger.systemLog('Cleared all HNSW metadata cache', 'HnswMetadataManager');
  }

  /**
   * Get metadata statistics
   */
  getStatistics(): {
    cachedMetadataCount: number;
    cacheHitRatio: number;
  } {
    return {
      cachedMetadataCount: this.cache.size,
      cacheHitRatio: 0, // Simple cache doesn't track hit ratio
    };
  }

  /**
   * Validate metadata structure
   */
  validateMetadata(metadata: any): metadata is IndexMetadata {
    return (
      typeof metadata === 'object' &&
      typeof metadata.collectionName === 'string' &&
      typeof metadata.itemCount === 'number' &&
      typeof metadata.dimension === 'number' &&
      typeof metadata.lastModified === 'number' &&
      typeof metadata.contentHash === 'string' &&
      typeof metadata.isPartitioned === 'boolean' &&
      typeof metadata.version === 'string' &&
      typeof metadata.indexFilename === 'string' &&
      typeof metadata.estimatedSize === 'number'
    );
  }

  /**
   * Get cached metadata without loading from disk
   */
  getCachedMetadata(collectionName: string): IndexMetadata | undefined {
    const cacheKey = `hnsw_metadata_${collectionName}`;
    return this.cache.get(cacheKey);
  }

  /**
   * Create default metadata for a collection
   */
  createDefaultMetadata(collectionName: string): IndexMetadata {
    return {
      collectionName,
      itemCount: 0,
      dimension: 0,
      lastModified: Date.now(),
      contentHash: '',
      isPartitioned: false,
      version: '3.0.0',
      indexFilename: `hnsw_${collectionName}`,
      estimatedSize: 0,
    };
  }
}