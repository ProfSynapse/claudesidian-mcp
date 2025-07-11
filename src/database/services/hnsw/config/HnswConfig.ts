/**
 * HnswConfig - Configuration management for HNSW search service
 * Follows Single Responsibility Principle by centralizing all HNSW configuration
 * Applies existing configuration patterns from VectorStoreConfig
 */

import { validateParams, ValidationError } from '../../../../utils/validationUtils';

export interface HnswConfigOptions {
  partitioning?: {
    enabled?: boolean;
    maxItemsPerPartition?: number;
    minItemsForPartitioning?: number;
  };
  persistence?: {
    enabled?: boolean;
    metadataCacheEnabled?: boolean;
    migrationEnabled?: boolean;
  };
  indexedDb?: {
    storageQuotaWarningThreshold?: number; // Percentage (0-100)
    autoCleanupEnabled?: boolean;
    maxCacheAge?: number; // Milliseconds
    compressionEnabled?: boolean;
    syncTimeoutMs?: number;
  };
  index?: {
    efConstruction?: number;
    m?: number;
    defaultCapacityMultiplier?: number;
    minCapacity?: number;
  };
  search?: {
    defaultEfSearch?: number;
    efSearchMultiplier?: number;
    resultsMultiplier?: number;
  };
  validation?: {
    strictEmbeddingValidation?: boolean;
    allowPartialMatches?: boolean;
  };
}

export class HnswConfig {
  // Partitioning configuration
  public readonly partitioning: {
    enabled: boolean;
    maxItemsPerPartition: number;
    minItemsForPartitioning: number;
  };

  // Persistence configuration
  public readonly persistence: {
    enabled: boolean;
    metadataCacheEnabled: boolean;
    migrationEnabled: boolean;
  };

  // IndexedDB configuration
  public readonly indexedDb: {
    storageQuotaWarningThreshold: number; // Percentage (0-100)
    autoCleanupEnabled: boolean;
    maxCacheAge: number; // Milliseconds
    compressionEnabled: boolean;
    syncTimeoutMs: number;
  };

  // Index construction parameters
  public readonly index: {
    efConstruction: number; // Controls index quality vs build time
    m: number; // Max connections per node
    defaultCapacityMultiplier: number; // Safety buffer for capacity
    minCapacity: number; // Minimum index capacity
  };

  // Search parameters
  public readonly search: {
    defaultEfSearch: number; // Default search parameter
    efSearchMultiplier: number; // Multiplier for efSearch based on nResults
    resultsMultiplier: number; // How many extra results to fetch per partition
  };

  // Validation settings
  public readonly validation: {
    strictEmbeddingValidation: boolean;
    allowPartialMatches: boolean;
  };

  constructor(options?: HnswConfigOptions) {
    // Validate input options
    const validationErrors = this.validateOptions(options);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid HNSW configuration: ${validationErrors.map(e => e.message).join(', ')}`);
    }

    this.partitioning = {
      enabled: options?.partitioning?.enabled ?? true,
      maxItemsPerPartition: options?.partitioning?.maxItemsPerPartition ?? 500,
      minItemsForPartitioning: options?.partitioning?.minItemsForPartitioning ?? 500,
    };

    this.persistence = {
      enabled: options?.persistence?.enabled ?? true,
      metadataCacheEnabled: options?.persistence?.metadataCacheEnabled ?? true,
      migrationEnabled: options?.persistence?.migrationEnabled ?? true,
    };

    this.indexedDb = {
      storageQuotaWarningThreshold: options?.indexedDb?.storageQuotaWarningThreshold ?? 80,
      autoCleanupEnabled: options?.indexedDb?.autoCleanupEnabled ?? true,
      maxCacheAge: options?.indexedDb?.maxCacheAge ?? (7 * 24 * 60 * 60 * 1000), // 7 days
      compressionEnabled: options?.indexedDb?.compressionEnabled ?? false,
      syncTimeoutMs: options?.indexedDb?.syncTimeoutMs ?? 30000, // 30 seconds
    };

    this.index = {
      efConstruction: options?.index?.efConstruction ?? 200,
      m: options?.index?.m ?? 16,
      defaultCapacityMultiplier: options?.index?.defaultCapacityMultiplier ?? 3,
      minCapacity: options?.index?.minCapacity ?? 60000,
    };

    this.search = {
      defaultEfSearch: options?.search?.defaultEfSearch ?? 50,
      efSearchMultiplier: options?.search?.efSearchMultiplier ?? 2,
      resultsMultiplier: options?.search?.resultsMultiplier ?? 2,
    };

    this.validation = {
      strictEmbeddingValidation: options?.validation?.strictEmbeddingValidation ?? true,
      allowPartialMatches: options?.validation?.allowPartialMatches ?? false,
    };

    // Validate configuration consistency
    this.validateConfigurationConsistency();
  }

  /**
   * Calculate optimal capacity for an index
   * @param itemCount Number of items to index
   * @returns Recommended capacity
   */
  calculateOptimalCapacity(itemCount: number): number {
    const baseCapacity = Math.max(
      itemCount * this.index.defaultCapacityMultiplier,
      this.index.minCapacity
    );

    // Add buffer for partitioned indexes
    if (this.partitioning.enabled && itemCount > this.partitioning.minItemsForPartitioning) {
      return Math.max(baseCapacity, this.partitioning.maxItemsPerPartition + 5000);
    }

    return baseCapacity;
  }

  /**
   * Calculate number of partitions needed
   * @param itemCount Total number of items
   * @returns Number of partitions required
   */
  calculatePartitionCount(itemCount: number): number {
    if (!this.partitioning.enabled || itemCount <= this.partitioning.minItemsForPartitioning) {
      return 1;
    }

    return Math.ceil(itemCount / this.partitioning.maxItemsPerPartition);
  }

  /**
   * Calculate optimal efSearch parameter
   * @param nResults Number of results requested
   * @returns Optimal efSearch value
   */
  calculateOptimalEfSearch(nResults: number): number {
    return Math.max(
      nResults * this.search.efSearchMultiplier,
      this.search.defaultEfSearch
    );
  }

  /**
   * Calculate how many results to fetch per partition
   * @param nResults Final number of results needed
   * @param partitionCount Number of partitions
   * @returns Results per partition
   */
  calculateResultsPerPartition(nResults: number, partitionCount: number): number {
    if (partitionCount <= 1) {
      return nResults;
    }

    return Math.max(
      nResults * this.search.resultsMultiplier,
      100 // Minimum results per partition for good distribution
    );
  }

  /**
   * Check if partitioning should be used for given item count
   * @param itemCount Number of items
   * @returns True if partitioning should be used
   */
  shouldUsePartitioning(itemCount: number): boolean {
    return this.partitioning.enabled && itemCount > this.partitioning.minItemsForPartitioning;
  }

  /**
   * Get default configuration for production use
   * SUPERLATIVE ENHANCEMENT: Optimized for persistence and performance
   * @returns Production-optimized configuration
   */
  static getProductionConfig(): HnswConfig {
    return new HnswConfig({
      partitioning: {
        enabled: true,
        maxItemsPerPartition: 500,
        minItemsForPartitioning: 500,
      },
      persistence: {
        enabled: true, // ✅ CRITICAL: Always enabled for production
        metadataCacheEnabled: true, // ✅ Enhanced caching for faster startup
        migrationEnabled: true, // ✅ Support for index upgrades
      },
      indexedDb: {
        storageQuotaWarningThreshold: 80,
        autoCleanupEnabled: true,
        maxCacheAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        compressionEnabled: false, // Keep false for reliability
        syncTimeoutMs: 30000, // 30 seconds - adequate for most cases
      },
      index: {
        efConstruction: 200, // Good balance of quality and speed
        m: 16, // Standard value for most use cases
        defaultCapacityMultiplier: 3,
        minCapacity: 60000,
      },
      search: {
        defaultEfSearch: 50,
        efSearchMultiplier: 2,
        resultsMultiplier: 2,
      },
      validation: {
        strictEmbeddingValidation: true, // ✅ Prevent corrupted indexes
        allowPartialMatches: false, // ✅ Ensure data integrity
      },
    });
  }

  /**
   * Get configuration optimized for development/testing
   * @returns Development-optimized configuration
   */
  static getDevelopmentConfig(): HnswConfig {
    return new HnswConfig({
      partitioning: {
        enabled: true,
        maxItemsPerPartition: 100, // Smaller partitions for faster testing
        minItemsForPartitioning: 100,
      },
      persistence: {
        enabled: false, // Faster startup during development
        metadataCacheEnabled: false,
        migrationEnabled: false,
      },
      indexedDb: {
        storageQuotaWarningThreshold: 90, // More lenient for dev
        autoCleanupEnabled: false, // Manual control during development
        maxCacheAge: 24 * 60 * 60 * 1000, // 1 day for dev
        compressionEnabled: false,
        syncTimeoutMs: 10000, // Shorter timeout for dev
      },
      index: {
        efConstruction: 100, // Faster construction
        m: 8, // Smaller connections for speed
        defaultCapacityMultiplier: 2,
        minCapacity: 10000,
      },
      search: {
        defaultEfSearch: 20,
        efSearchMultiplier: 1.5,
        resultsMultiplier: 1.5,
      },
      validation: {
        strictEmbeddingValidation: false, // More lenient for testing
        allowPartialMatches: true,
      },
    });
  }

  /**
   * Validate configuration options using existing ValidationUtils
   * @param options Options to validate
   * @returns Array of validation errors
   */
  private validateOptions(options?: HnswConfigOptions): ValidationError[] {
    if (!options) {
      return [];
    }

    const schema = {
      type: 'object',
      properties: {
        partitioning: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            maxItemsPerPartition: { type: 'integer', minimum: 10, maximum: 10000 },
            minItemsForPartitioning: { type: 'integer', minimum: 10, maximum: 10000 },
          },
        },
        persistence: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            metadataCacheEnabled: { type: 'boolean' },
            migrationEnabled: { type: 'boolean' },
          },
        },
        indexedDb: {
          type: 'object',
          properties: {
            storageQuotaWarningThreshold: { type: 'number', minimum: 0, maximum: 100 },
            autoCleanupEnabled: { type: 'boolean' },
            maxCacheAge: { type: 'integer', minimum: 60000, maximum: 30 * 24 * 60 * 60 * 1000 }, // 1 min to 30 days
            compressionEnabled: { type: 'boolean' },
            syncTimeoutMs: { type: 'integer', minimum: 1000, maximum: 120000 }, // 1 sec to 2 minutes
          },
        },
        index: {
          type: 'object',
          properties: {
            efConstruction: { type: 'integer', minimum: 10, maximum: 1000 },
            m: { type: 'integer', minimum: 2, maximum: 100 },
            defaultCapacityMultiplier: { type: 'number', minimum: 1, maximum: 10 },
            minCapacity: { type: 'integer', minimum: 100, maximum: 1000000 },
          },
        },
        search: {
          type: 'object',
          properties: {
            defaultEfSearch: { type: 'integer', minimum: 1, maximum: 1000 },
            efSearchMultiplier: { type: 'number', minimum: 1, maximum: 10 },
            resultsMultiplier: { type: 'number', minimum: 1, maximum: 10 },
          },
        },
        validation: {
          type: 'object',
          properties: {
            strictEmbeddingValidation: { type: 'boolean' },
            allowPartialMatches: { type: 'boolean' },
          },
        },
      },
    };

    return validateParams(options, schema);
  }

  /**
   * Validate configuration consistency after construction
   * @throws Error if configuration is inconsistent
   */
  private validateConfigurationConsistency(): void {
    // Ensure partitioning settings are consistent
    if (this.partitioning.minItemsForPartitioning > this.partitioning.maxItemsPerPartition) {
      throw new Error('minItemsForPartitioning cannot be greater than maxItemsPerPartition');
    }

    // Ensure index parameters are reasonable
    if (this.index.efConstruction < this.index.m) {
      throw new Error('efConstruction should be at least as large as m for optimal performance');
    }

    // Ensure search parameters are reasonable
    if (this.search.efSearchMultiplier < 1) {
      throw new Error('efSearchMultiplier must be at least 1');
    }

    if (this.search.resultsMultiplier < 1) {
      throw new Error('resultsMultiplier must be at least 1');
    }
  }

  /**
   * Create a copy of this configuration with overrides
   * @param overrides Partial configuration to override
   * @returns New configuration instance
   */
  withOverrides(overrides: Partial<HnswConfigOptions>): HnswConfig {
    const currentOptions: HnswConfigOptions = {
      partitioning: { ...this.partitioning },
      persistence: { ...this.persistence },
      indexedDb: { ...this.indexedDb },
      index: { ...this.index },
      search: { ...this.search },
      validation: { ...this.validation },
    };

    // Deep merge overrides
    const mergedOptions: HnswConfigOptions = {
      partitioning: { ...currentOptions.partitioning, ...overrides.partitioning },
      persistence: { ...currentOptions.persistence, ...overrides.persistence },
      indexedDb: { ...currentOptions.indexedDb, ...overrides.indexedDb },
      index: { ...currentOptions.index, ...overrides.index },
      search: { ...currentOptions.search, ...overrides.search },
      validation: { ...currentOptions.validation, ...overrides.validation },
    };

    return new HnswConfig(mergedOptions);
  }

  /**
   * Export configuration as JSON for serialization
   * @returns Configuration as plain object
   */
  toJSON(): HnswConfigOptions {
    return {
      partitioning: { ...this.partitioning },
      persistence: { ...this.persistence },
      indexedDb: { ...this.indexedDb },
      index: { ...this.index },
      search: { ...this.search },
      validation: { ...this.validation },
    };
  }
}