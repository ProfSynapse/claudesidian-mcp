/**
 * CollectionPersistence - Handles collection save/load operations
 * Follows Single Responsibility Principle by focusing only on persistence operations
 */

import { PersistenceManager } from '../../services/PersistenceManager';
import { CollectionRepository } from '../../services/CollectionRepository';

export interface PersistenceResult {
  success: boolean;
  error?: string;
}

export interface PersistenceData {
  items: any[];
  metadata: Record<string, any>;
}

/**
 * Service responsible for collection persistence operations
 * Follows SRP by focusing only on save/load operations
 */
export class CollectionPersistence {
  private dataFilePath: string;
  private metaFilePath: string;

  constructor(
    private collectionName: string,
    private storageDir: string,
    private persistenceManager: PersistenceManager,
    private repository: CollectionRepository
  ) {
    this.dataFilePath = `${storageDir}/${collectionName}/items.json`;
    this.metaFilePath = `${storageDir}/${collectionName}/metadata.json`;
  }

  /**
   * Save collection data to disk
   */
  async saveCollectionToDisk(): Promise<PersistenceResult> {
    try {
      const collectionData = this.repository.getCollectionData();
      const persistenceData: PersistenceData = {
        items: Array.from(collectionData.items.values()),
        metadata: {
          ...collectionData.metadata,
          collectionName: this.collectionName
        }
      };

      await this.persistenceManager.saveToFile(this.dataFilePath, this.metaFilePath, persistenceData);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to save collection to disk: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Load collection data from disk
   */
  async loadFromDisk(): Promise<PersistenceResult> {
    try {
      const persistenceData = await this.persistenceManager.loadFromFile(this.dataFilePath);

      if (persistenceData) {
        this.repository.loadCollectionData({
          items: persistenceData.items as any, // Will be converted to Map in loadCollectionData
          metadata: persistenceData.metadata
        });
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to load collection from disk: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Check if collection exists on disk
   */
  async existsOnDisk(): Promise<boolean> {
    try {
      const data = await this.persistenceManager.loadFromFile(this.dataFilePath);
      return data !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get collection file paths
   */
  getFilePaths(): {
    dataFile: string;
    metaFile: string;
  } {
    return {
      dataFile: this.dataFilePath,
      metaFile: this.metaFilePath
    };
  }

  /**
   * Get collection directory path
   */
  getCollectionDirectory(): string {
    return `${this.storageDir}/${this.collectionName}`;
  }

  /**
   * Ensure collection directory exists
   */
  async ensureDirectoryExists(): Promise<PersistenceResult> {
    try {
      const collectionDir = this.getCollectionDirectory();
      this.persistenceManager.ensureDirectory(collectionDir);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to ensure directory exists: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get collection size information
   */
  async getCollectionSize(): Promise<{
    itemCount: number;
    diskSize?: number;
    error?: string;
  }> {
    try {
      const itemCount = this.repository.count();
      
      // Try to get disk size if possible
      let diskSize: number | undefined;
      try {
        const data = await this.persistenceManager.loadFromFile(this.dataFilePath);
        if (data) {
          diskSize = JSON.stringify(data).length;
        }
      } catch (error) {
        // Disk size is optional, continue without it
      }

      return {
        itemCount,
        diskSize
      };
    } catch (error) {
      return {
        itemCount: 0,
        error: `Failed to get collection size: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}