/**
 * CollectionLoader - Handles collection loading from disk
 * Follows Single Responsibility Principle by focusing only on collection loading
 */

import { PersistenceManager } from '../../services/PersistenceManager';
import { FileSystemInterface } from '../../services';
import { StrictPersistentCollection } from '../../collection/StrictPersistentCollection';

export interface LoadResult {
  success: boolean;
  error?: string;
  loadedCollections?: Map<string, StrictPersistentCollection>;
}

/**
 * Service responsible for loading collections from disk
 * Follows SRP by focusing only on collection loading operations
 */
export class CollectionLoader {
  constructor(
    private storagePath: string,
    private fs: FileSystemInterface,
    private persistenceManager: PersistenceManager
  ) {}

  /**
   * Load all collections from disk
   */
  async loadCollectionsFromDisk(): Promise<LoadResult> {
    try {
      const collectionsDir = `${this.storagePath}/collections`;
      const collections = new Map<string, StrictPersistentCollection>();

      // Read the collections directory
      const collectionDirs = this.persistenceManager.listSubdirectories(collectionsDir);

      // Load each collection
      for (const collectionName of collectionDirs) {
        const loadResult = await this.loadSingleCollection(collectionName, collectionsDir);
        
        if (loadResult.success && loadResult.collection) {
          collections.set(collectionName, loadResult.collection);
        } else {
          console.error(`Failed to load collection ${collectionName}:`, loadResult.error);
          // Continue with other collections instead of failing entirely
        }
      }

      return {
        success: true,
        loadedCollections: collections
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to load collections from disk: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Load a single collection from disk
   */
  private async loadSingleCollection(
    collectionName: string, 
    collectionsDir: string
  ): Promise<{
    success: boolean;
    error?: string;
    collection?: StrictPersistentCollection;
  }> {
    try {
      // Skip system directories
      if (this.shouldSkipCollection(collectionName)) {
        return { success: false, error: 'System directory skipped' };
      }

      // Create collection instance
      const collection = new StrictPersistentCollection(
        collectionName,
        collectionsDir,
        this.fs,
        { createdAt: new Date().toISOString() },
        null // parent reference
      );

      // Load collection data from disk
      await collection.loadFromDisk();

      return {
        success: true,
        collection
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to load collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Check if a collection should be skipped during loading
   */
  private shouldSkipCollection(collectionName: string): boolean {
    // Skip system directories
    const systemDirectories = ['hnsw-indexes', '.git', 'node_modules', '.tmp'];
    return systemDirectories.includes(collectionName);
  }

  /**
   * Get collection directories
   */
  getCollectionDirectories(): string[] {
    try {
      const collectionsDir = `${this.storagePath}/collections`;
      const collectionDirs = this.persistenceManager.listSubdirectories(collectionsDir);
      return collectionDirs.filter(dir => !this.shouldSkipCollection(dir));
    } catch (error) {
      console.error('Failed to get collection directories:', error);
      return [];
    }
  }

  /**
   * Check if a collection exists on disk
   */
  async collectionExistsOnDisk(collectionName: string): Promise<boolean> {
    try {
      const collectionsDir = `${this.storagePath}/collections`;
      const collectionPath = `${collectionsDir}/${collectionName}`;
      const itemsPath = `${collectionPath}/items.json`;
      
      const data = await this.persistenceManager.loadFromFile(itemsPath);
      return data !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionLoadStatistics(): Promise<{
    totalDirectories: number;
    validCollections: number;
    skippedDirectories: number;
    errors: string[];
  }> {
    const statistics = {
      totalDirectories: 0,
      validCollections: 0,
      skippedDirectories: 0,
      errors: [] as string[]
    };

    try {
      const collectionsDir = `${this.storagePath}/collections`;
      const allDirs = this.persistenceManager.listSubdirectories(collectionsDir);
      
      statistics.totalDirectories = allDirs.length;

      for (const dir of allDirs) {
        if (this.shouldSkipCollection(dir)) {
          statistics.skippedDirectories++;
        } else {
          const exists = await this.collectionExistsOnDisk(dir);
          if (exists) {
            statistics.validCollections++;
          } else {
            statistics.errors.push(`Collection ${dir} directory exists but no valid data found`);
          }
        }
      }
    } catch (error) {
      statistics.errors.push(`Failed to get statistics: ${error instanceof Error ? error.message : String(error)}`);
    }

    return statistics;
  }

  /**
   * Verify collection integrity
   */
  async verifyCollectionIntegrity(collectionName: string): Promise<{
    valid: boolean;
    error?: string;
    issues?: string[];
  }> {
    try {
      const collectionsDir = `${this.storagePath}/collections`;
      const collectionPath = `${collectionsDir}/${collectionName}`;
      const itemsPath = `${collectionPath}/items.json`;
      const metaPath = `${collectionPath}/metadata.json`;

      const issues: string[] = [];

      // Check if items file exists and is valid
      try {
        const itemsData = await this.persistenceManager.loadFromFile(itemsPath);
        if (!itemsData) {
          issues.push('Items file missing or empty');
        } else if (!itemsData.items || !Array.isArray(itemsData.items)) {
          issues.push('Items file structure invalid');
        }
      } catch (error) {
        issues.push(`Items file error: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Check metadata file (optional)
      try {
        const metaData = await this.persistenceManager.loadFromFile(metaPath);
        if (metaData && typeof metaData.metadata !== 'object') {
          issues.push('Metadata file structure invalid');
        }
      } catch (error) {
        // Metadata file is optional, so this is not a critical error
      }

      return {
        valid: issues.length === 0,
        issues: issues.length > 0 ? issues : undefined
      };
    } catch (error) {
      return {
        valid: false,
        error: `Failed to verify collection integrity: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}