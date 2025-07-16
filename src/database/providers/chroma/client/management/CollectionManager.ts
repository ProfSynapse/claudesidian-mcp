/**
 * CollectionManager - Handles collection CRUD operations
 * Follows Single Responsibility Principle by focusing only on collection management
 */

import { StrictPersistentCollection } from '../../collection/StrictPersistentCollection';
import { CollectionMetadata, ChromaCollectionOptions } from '../../PersistentChromaClient';
import { FileSystemInterface } from '../../services';

export interface CollectionManagementResult {
  success: boolean;
  error?: string;
  collection?: StrictPersistentCollection;
}

export interface CollectionListResult {
  success: boolean;
  error?: string;
  collections?: CollectionMetadata[];
}

/**
 * Service responsible for collection management operations
 * Follows SRP by focusing only on collection CRUD operations
 */
export class CollectionManager {
  constructor(
    private collections: Map<string, StrictPersistentCollection>,
    private storagePath: string,
    private fs: FileSystemInterface,
    private clientInstance: any
  ) {}

  /**
   * Create or get a collection
   */
  async createOrGetCollection(options: ChromaCollectionOptions): Promise<CollectionManagementResult> {
    try {
      const { name, metadata = {}, embeddingFunction } = options;

      // Validate collection name
      const validation = this.validateCollectionName(name);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // Check if collection already exists
      if (this.collections.has(name)) {
        return {
          success: true,
          collection: this.collections.get(name)
        };
      }

      // Create new collection
      const collection = new StrictPersistentCollection(
        name,
        `${this.storagePath}/collections`,
        this.fs,
        {
          ...metadata,
          createdAt: new Date().toISOString()
        },
        this.clientInstance,
        embeddingFunction
      );

      // Store in collections map
      this.collections.set(name, collection);

      return {
        success: true,
        collection
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create or get collection: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get an existing collection
   */
  async getCollection(name: string): Promise<CollectionManagementResult> {
    try {
      const collection = this.collections.get(name);
      if (!collection) {
        return {
          success: false,
          error: `Collection '${name}' not found`
        };
      }

      return {
        success: true,
        collection
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get collection: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Delete a collection
   */
  async deleteCollection(name: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const collection = this.collections.get(name);
      if (!collection) {
        return {
          success: false,
          error: `Collection '${name}' not found`
        };
      }

      // Clean up collection resources
      collection.cleanup();

      // Remove from collections map
      this.collections.delete(name);

      // TODO: Could add physical deletion of files here if needed
      // For now, we just remove from memory and let the files remain

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete collection: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<CollectionListResult> {
    try {
      const collections: CollectionMetadata[] = [];

      for (const [name, collection] of this.collections) {
        try {
          const metadata = await collection.metadata();
          collections.push({
            name,
            metadata
          });
        } catch (error) {
          console.error(`Failed to get metadata for collection ${name}:`, error);
          // Add collection with minimal metadata
          collections.push({
            name,
            metadata: { error: 'Failed to load metadata' }
          });
        }
      }

      return {
        success: true,
        collections
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list collections: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Check if collection exists
   */
  hasCollection(name: string): boolean {
    return this.collections.has(name);
  }

  /**
   * Get collection count
   */
  getCollectionCount(): number {
    return this.collections.size;
  }

  /**
   * Get collection names
   */
  getCollectionNames(): string[] {
    return Array.from(this.collections.keys());
  }

  /**
   * Validate collection name
   */
  private validateCollectionName(name: string): {
    valid: boolean;
    error?: string;
  } {
    if (!name || typeof name !== 'string') {
      return {
        valid: false,
        error: 'Collection name must be a non-empty string'
      };
    }

    if (name.trim().length === 0) {
      return {
        valid: false,
        error: 'Collection name cannot be empty'
      };
    }

    if (name.length > 255) {
      return {
        valid: false,
        error: 'Collection name cannot exceed 255 characters'
      };
    }

    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (invalidChars.test(name)) {
      return {
        valid: false,
        error: 'Collection name contains invalid characters'
      };
    }

    // Check for reserved names
    const reservedNames = ['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'];
    if (reservedNames.includes(name.toLowerCase())) {
      return {
        valid: false,
        error: 'Collection name is reserved'
      };
    }

    return { valid: true };
  }

  /**
   * Get collection statistics
   */
  async getCollectionStatistics(): Promise<{
    totalCollections: number;
    collections: Array<{
      name: string;
      itemCount: number;
      hasMetadata: boolean;
      error?: string;
    }>;
  }> {
    const collections: Array<{
      name: string;
      itemCount: number;
      hasMetadata: boolean;
      error?: string;
    }> = [];

    for (const [name, collection] of this.collections) {
      try {
        const itemCount = await collection.count();
        const metadata = await collection.metadata();
        
        collections.push({
          name,
          itemCount,
          hasMetadata: metadata && Object.keys(metadata).length > 0
        });
      } catch (error) {
        collections.push({
          name,
          itemCount: 0,
          hasMetadata: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      totalCollections: this.collections.size,
      collections
    };
  }

  /**
   * Force save all collections
   */
  async saveAllCollections(): Promise<{
    success: boolean;
    savedCollections: string[];
    errors: string[];
  }> {
    const savedCollections: string[] = [];
    const errors: string[] = [];

    for (const [name, collection] of this.collections) {
      try {
        await collection.forceSave();
        savedCollections.push(name);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to save collection ${name}: ${errorMsg}`);
      }
    }

    return {
      success: errors.length === 0,
      savedCollections,
      errors
    };
  }

  /**
   * Reload all collections from disk
   */
  async reloadAllCollections(): Promise<{
    success: boolean;
    reloadedCollections: string[];
    errors: string[];
  }> {
    const reloadedCollections: string[] = [];
    const errors: string[] = [];

    for (const [name, collection] of this.collections) {
      try {
        await collection.loadFromDisk();
        reloadedCollections.push(name);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to reload collection ${name}: ${errorMsg}`);
      }
    }

    return {
      success: errors.length === 0,
      reloadedCollections,
      errors
    };
  }
}