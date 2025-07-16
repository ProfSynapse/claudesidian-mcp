/**
 * ResourceManager - Handles resource cleanup and management
 * Follows Single Responsibility Principle by focusing only on resource management
 */

import { StrictPersistentCollection } from '../../collection/StrictPersistentCollection';
import { PersistenceManager } from '../../services/PersistenceManager';

export interface CleanupResult {
  success: boolean;
  error?: string;
  cleanedResources?: string[];
}

/**
 * Service responsible for resource cleanup and management
 * Follows SRP by focusing only on resource management operations
 */
export class ResourceManager {
  private isCleanedUp = false;

  constructor(
    private persistenceManager: PersistenceManager | null,
    private collections: Map<string, StrictPersistentCollection>
  ) {}

  /**
   * Clean up all resources
   */
  async cleanup(): Promise<CleanupResult> {
    if (this.isCleanedUp) {
      return {
        success: true,
        cleanedResources: ['Already cleaned up']
      };
    }

    const cleanedResources: string[] = [];

    try {
      // Clean up collections
      const collectionCleanup = await this.cleanupCollections();
      if (collectionCleanup.success) {
        cleanedResources.push(...(collectionCleanup.cleanedResources || []));
      }

      // Clean up persistence manager
      const persistenceCleanup = this.cleanupPersistenceManager();
      if (persistenceCleanup.success) {
        cleanedResources.push(...(persistenceCleanup.cleanedResources || []));
      }

      this.isCleanedUp = true;

      return {
        success: true,
        cleanedResources
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to cleanup resources: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Clean up collections
   */
  private async cleanupCollections(): Promise<CleanupResult> {
    const cleanedResources: string[] = [];

    try {
      const collectionNames = Array.from(this.collections.keys());

      for (const collectionName of collectionNames) {
        try {
          const collection = this.collections.get(collectionName);
          if (collection) {
            // Clean up individual collection
            collection.cleanup();
            cleanedResources.push(`Collection: ${collectionName}`);
          }
        } catch (error) {
          console.error(`Failed to cleanup collection ${collectionName}:`, error);
          // Continue with other collections
        }
      }

      // Clear the collections map
      this.collections.clear();
      cleanedResources.push('Collections map cleared');

      return {
        success: true,
        cleanedResources
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to cleanup collections: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Clean up persistence manager
   */
  private cleanupPersistenceManager(): CleanupResult {
    const cleanedResources: string[] = [];

    try {
      if (this.persistenceManager) {
        this.persistenceManager.cleanup();
        cleanedResources.push('Persistence manager');
      }

      return {
        success: true,
        cleanedResources
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to cleanup persistence manager: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Force save all collections before cleanup
   */
  async saveAllCollectionsBeforeCleanup(): Promise<{
    success: boolean;
    error?: string;
    savedCollections?: string[];
  }> {
    const savedCollections: string[] = [];

    try {
      const collectionNames = Array.from(this.collections.keys());

      for (const collectionName of collectionNames) {
        try {
          const collection = this.collections.get(collectionName);
          if (collection) {
            await collection.forceSave();
            savedCollections.push(collectionName);
          }
        } catch (error) {
          console.error(`Failed to save collection ${collectionName} during cleanup:`, error);
          // Continue with other collections
        }
      }

      return {
        success: true,
        savedCollections
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to save collections before cleanup: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get resource usage statistics
   */
  getResourceUsage(): {
    collections: {
      count: number;
      names: string[];
    };
    persistenceManager: {
      available: boolean;
    };
    cleanupStatus: {
      isCleanedUp: boolean;
    };
  } {
    return {
      collections: {
        count: this.collections.size,
        names: Array.from(this.collections.keys())
      },
      persistenceManager: {
        available: this.persistenceManager !== null
      },
      cleanupStatus: {
        isCleanedUp: this.isCleanedUp
      }
    };
  }

  /**
   * Check if resources are cleaned up
   */
  isResourcesCleanedUp(): boolean {
    return this.isCleanedUp;
  }

  /**
   * Validate resource state
   */
  validateResourceState(): {
    valid: boolean;
    issues?: string[];
  } {
    const issues: string[] = [];

    if (this.isCleanedUp) {
      issues.push('Resources have been cleaned up');
    }

    if (!this.persistenceManager) {
      issues.push('Persistence manager is null');
    }

    if (this.collections.size === 0) {
      issues.push('No collections available');
    }

    return {
      valid: issues.length === 0,
      issues: issues.length > 0 ? issues : undefined
    };
  }

  /**
   * Get memory usage estimate
   */
  async getMemoryUsage(): Promise<{
    collections: Array<{
      name: string;
      itemCount: number;
      estimatedMemoryKB?: number;
    }>;
    totalEstimatedMemoryKB?: number;
  }> {
    const collections: Array<{
      name: string;
      itemCount: number;
      estimatedMemoryKB?: number;
    }> = [];

    let totalEstimatedMemoryKB = 0;

    for (const [name, collection] of this.collections) {
      try {
        const count = await collection.count();
        const size = await collection.getSize();
        
        const estimatedMemoryKB = size.diskSize ? Math.round(size.diskSize / 1024) : undefined;
        if (estimatedMemoryKB) {
          totalEstimatedMemoryKB += estimatedMemoryKB;
        }

        collections.push({
          name,
          itemCount: count,
          estimatedMemoryKB
        });
      } catch (error) {
        collections.push({
          name,
          itemCount: 0
        });
      }
    }

    return {
      collections,
      totalEstimatedMemoryKB: totalEstimatedMemoryKB > 0 ? totalEstimatedMemoryKB : undefined
    };
  }
}