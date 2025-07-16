/**
 * MetadataManager - Handles collection metadata operations
 * Follows Single Responsibility Principle by focusing only on metadata management
 */

import { CollectionRepository } from '../../services/CollectionRepository';

export interface MetadataResult {
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface MetadataUpdate {
  key: string;
  value: any;
}

/**
 * Service responsible for collection metadata operations
 * Follows SRP by focusing only on metadata management
 */
export class MetadataManager {
  constructor(
    private repository: CollectionRepository,
    private collectionName: string
  ) {}

  /**
   * Get collection metadata
   */
  async getMetadata(): Promise<MetadataResult> {
    try {
      const metadata = this.repository.getMetadata();
      return {
        success: true,
        metadata: {
          ...metadata,
          collectionName: this.collectionName
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get metadata: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Update collection metadata
   */
  async updateMetadata(updates: MetadataUpdate[]): Promise<MetadataResult> {
    try {
      const currentMetadata = this.repository.getMetadata();
      const updatedMetadata = { ...currentMetadata };

      // Apply updates
      for (const update of updates) {
        updatedMetadata[update.key] = update.value;
      }

      // Update last modified timestamp
      updatedMetadata.lastModified = new Date().toISOString();

      // Save back to repository
      this.repository.updateMetadata(updatedMetadata);

      return {
        success: true,
        metadata: updatedMetadata
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update metadata: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Set specific metadata value
   */
  async setMetadata(key: string, value: any): Promise<MetadataResult> {
    return this.updateMetadata([{ key, value }]);
  }

  /**
   * Get specific metadata value
   */
  async getMetadataValue(key: string): Promise<{
    success: boolean;
    error?: string;
    value?: any;
  }> {
    try {
      const metadata = this.repository.getMetadata();
      return {
        success: true,
        value: metadata[key]
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get metadata value: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Remove metadata key
   */
  async removeMetadata(key: string): Promise<MetadataResult> {
    try {
      const currentMetadata = this.repository.getMetadata();
      const updatedMetadata = { ...currentMetadata };

      // Remove the key
      delete updatedMetadata[key];

      // Update last modified timestamp
      updatedMetadata.lastModified = new Date().toISOString();

      // Save back to repository
      this.repository.updateMetadata(updatedMetadata);

      return {
        success: true,
        metadata: updatedMetadata
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to remove metadata: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Check if metadata key exists
   */
  async hasMetadata(key: string): Promise<{
    success: boolean;
    error?: string;
    exists?: boolean;
  }> {
    try {
      const metadata = this.repository.getMetadata();
      return {
        success: true,
        exists: key in metadata
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to check metadata: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get collection statistics
   */
  async getStatistics(): Promise<{
    success: boolean;
    error?: string;
    statistics?: {
      itemCount: number;
      createdAt?: string;
      lastModified?: string;
      metadataKeys: string[];
    };
  }> {
    try {
      const metadata = this.repository.getMetadata();
      const itemCount = this.repository.count();

      return {
        success: true,
        statistics: {
          itemCount,
          createdAt: metadata.createdAt,
          lastModified: metadata.lastModified,
          metadataKeys: Object.keys(metadata)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get statistics: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Initialize default metadata
   */
  async initializeDefaultMetadata(): Promise<MetadataResult> {
    const defaultMetadata = {
      collectionName: this.collectionName,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      version: '1.0.0'
    };

    try {
      this.repository.updateMetadata(defaultMetadata);
      return {
        success: true,
        metadata: defaultMetadata
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to initialize metadata: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}