import { Collection, ChromaClient } from '../providers/chroma/PersistentChromaClient';
import { IDirectoryService } from '../providers/chroma/services/interfaces/IDirectoryService';
import { ObsidianPathManager } from '../../core/ObsidianPathManager';
import { StructuredLogger } from '../../core/StructuredLogger';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Location: src/database/services/CollectionValidator.ts
 * 
 * Summary: Handles validation logic for ChromaDB collections including cache validation,
 * filesystem validation, metadata verification, and collection integrity checks.
 * Extracted from CollectionManager to follow Single Responsibility Principle.
 * 
 * Used by: CollectionManager for all collection validation operations
 * Dependencies: ChromaClient, IDirectoryService, ObsidianPathManager, StructuredLogger
 */
export class CollectionValidator {
  private logger: StructuredLogger;

  constructor(
    private client: InstanceType<typeof ChromaClient>,
    private directoryService: IDirectoryService,
    private pathManager: ObsidianPathManager | null = null,
    logger?: StructuredLogger
  ) {
    // Use provided logger or create a simple console logger
    this.logger = logger || {
      debug: (msg: string, ctx?: any, source?: string) => console.debug(`[${source || 'CollectionValidator'}] ${msg}`, ctx),
      info: (msg: string, ctx?: any, source?: string) => console.info(`[${source || 'CollectionValidator'}] ${msg}`, ctx),
      warn: (msg: string, error?: Error, source?: string) => console.warn(`[${source || 'CollectionValidator'}] ${msg}`, error),
      error: (msg: string, error?: Error, source?: string) => console.error(`[${source || 'CollectionValidator'}] ${msg}`, error)
    } as StructuredLogger;
  }

  /**
   * Set path manager for consistent path handling
   */
  setPathManager(pathManager: ObsidianPathManager): void {
    this.pathManager = pathManager;
  }

  /**
   * Validate that a cached collection is still functional
   */
  async validateCachedCollection(collection: Collection): Promise<boolean> {
    try {
      if (typeof collection.count === 'function') {
        await collection.count();
        return true;
      }
      return false;
    } catch (error) {
      this.logger.warn('Cached collection validation failed', error as Error, 'CollectionValidator');
      return false;
    }
  }

  /**
   * Validate that a cached collection entry is still valid by checking filesystem
   */
  async validateCacheEntry(collectionName: string, persistentPath: string | null): Promise<boolean> {
    if (!persistentPath) {
      return true; // Can't validate without filesystem access
    }
    
    try {
      const collectionPath = this.getCollectionPath(collectionName, persistentPath);
      const metadataPath = this.pathManager ? 
        this.pathManager.joinPath(collectionPath, 'metadata.json') :
        `${collectionPath}/metadata.json`;
      
      if (!await this.directoryService.fileExists(metadataPath)) {
        return false; // Collection disappeared from filesystem
      }
      
      // Basic validation - could be enhanced with timestamp checks
      return true;
    } catch (error) {
      this.logger.warn(`Cache validation failed for ${collectionName}`, error as Error, 'CollectionValidator');
      return false;
    }
  }

  /**
   * Validate a collection by performing basic operations
   */
  async validateCollection(collectionName: string): Promise<boolean> {
    try {
      const collection = await this.client.getCollection(collectionName);
      
      // Try to perform a basic operation
      await collection.count();
      return true;
    } catch (error) {
      this.logger.warn(`Collection validation failed for ${collectionName}`, error as Error, 'CollectionValidator');
      return false;
    }
  }

  /**
   * Validate collection metadata from filesystem
   */
  async validateCollectionMetadata(collectionPath: string, expectedName: string): Promise<{
    isValid: boolean;
    metadata?: any;
    error?: string;
  }> {
    try {
      const metadataPath = this.pathManager ? 
        this.pathManager.joinPath(collectionPath, 'metadata.json') :
        `${collectionPath}/metadata.json`;

      if (!await this.directoryService.fileExists(metadataPath)) {
        return { isValid: false, error: 'Metadata file not found' };
      }

      const metadataContent = await this.directoryService.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      // Validate required fields
      if (metadata.collectionName !== expectedName) {
        return { 
          isValid: false, 
          error: `Collection name mismatch: expected ${expectedName}, got ${metadata.collectionName}`,
          metadata 
        };
      }

      if (!metadata.version) {
        return { 
          isValid: false, 
          error: 'Missing version field',
          metadata 
        };
      }

      return { isValid: true, metadata };
    } catch (error) {
      return { 
        isValid: false, 
        error: `Failed to parse metadata: ${getErrorMessage(error)}` 
      };
    }
  }

  /**
   * Validate collection directory structure
   */
  async validateCollectionStructure(collectionPath: string): Promise<{
    isValid: boolean;
    hasMetadata: boolean;
    hasItems: boolean;
    error?: string;
  }> {
    try {
      if (!await this.directoryService.directoryExists(collectionPath)) {
        return { 
          isValid: false, 
          hasMetadata: false, 
          hasItems: false, 
          error: 'Collection directory does not exist' 
        };
      }

      const metadataPath = this.pathManager ? 
        this.pathManager.joinPath(collectionPath, 'metadata.json') :
        `${collectionPath}/metadata.json`;
      
      const itemsPath = this.pathManager ? 
        this.pathManager.joinPath(collectionPath, 'items.json') :
        `${collectionPath}/items.json`;

      const hasMetadata = await this.directoryService.fileExists(metadataPath);
      const hasItems = await this.directoryService.fileExists(itemsPath);

      return {
        isValid: hasMetadata, // At minimum, metadata must exist
        hasMetadata,
        hasItems
      };
    } catch (error) {
      return { 
        isValid: false, 
        hasMetadata: false, 
        hasItems: false, 
        error: `Structure validation failed: ${getErrorMessage(error)}` 
      };
    }
  }

  /**
   * Batch validate multiple collections
   */
  async batchValidateCollections(collectionNames: string[]): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    const validationPromises = collectionNames.map(async (name) => {
      const isValid = await this.validateCollection(name);
      results[name] = isValid;
      return { name, isValid };
    });
    
    await Promise.all(validationPromises);
    return results;
  }

  /**
   * Validate collection items data format
   */
  async validateCollectionItems(itemsPath: string): Promise<{
    isValid: boolean;
    itemCount: number;
    error?: string;
  }> {
    try {
      if (!await this.directoryService.fileExists(itemsPath)) {
        return { isValid: true, itemCount: 0 }; // Empty collection is valid
      }

      const itemsContent = await this.directoryService.readFile(itemsPath, 'utf8');
      const items = JSON.parse(itemsContent);
      
      if (!Array.isArray(items)) {
        return { 
          isValid: false, 
          itemCount: 0, 
          error: 'Items data is not an array' 
        };
      }

      // Validate item structure
      for (let i = 0; i < Math.min(items.length, 5); i++) { // Sample first 5 items
        const item = items[i];
        if (!item.id || !item.embedding || !Array.isArray(item.embedding)) {
          return { 
            isValid: false, 
            itemCount: items.length, 
            error: `Invalid item structure at index ${i}` 
          };
        }
      }

      return { isValid: true, itemCount: items.length };
    } catch (error) {
      return { 
        isValid: false, 
        itemCount: 0, 
        error: `Items validation failed: ${getErrorMessage(error)}` 
      };
    }
  }

  /**
   * Check if a directory should be skipped during collection discovery
   */
  shouldSkipSystemDirectory(name: string): boolean {
    const systemDirectories = ['hnsw-indexes', '.git', 'node_modules', '.tmp'];
    return systemDirectories.includes(name);
  }

  /**
   * Get collection path using path manager or fallback
   */
  private getCollectionPath(collectionName: string, persistentPath: string): string {
    if (this.pathManager) {
      return this.pathManager.getCollectionPath(collectionName);
    }
    
    // Fallback to string concatenation if ObsidianPathManager not available
    if (persistentPath) {
      return `${persistentPath}/collections/${collectionName}`;
    }
    
    // Ultimate fallback - use correct path structure to match PersistentChromaClient
    return `data/chroma-db/collections/${collectionName}`;
  }
}