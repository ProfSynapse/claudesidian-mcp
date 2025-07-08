/**
 * HnswPersistenceFactory - Factory for creating and wiring HNSW persistence services
 * Follows Dependency Inversion Principle by injecting dependencies
 * Boy Scout Rule: Replaces complex service instantiation with clean factory pattern
 */

import { HnswConfig } from '../config/HnswConfig';
import { PersistenceManager } from '../../../providers/chroma/services/PersistenceManager';
import { CacheManager } from '../../CacheManager';
// HnswDiscoveryService removed - using HnswMetadataManager directly
import { DiagnosticsService } from '../../../providers/chroma/services/DiagnosticsService';
import { ContentHashService } from '../../embedding/ContentHashService';
import { HnswPersistenceOrchestrator } from './HnswPersistenceOrchestrator';
import { HnswMetadataManager } from './HnswMetadataManager';
import { HnswIndexOperations } from './HnswIndexOperations';

/**
 * Factory for creating properly wired HNSW persistence services
 * Follows SOLID principles by managing dependencies correctly
 */
export class HnswPersistenceFactory {
  /**
   * Create a fully wired HnswPersistenceOrchestrator with all dependencies
   */
  static create(
    config: HnswConfig,
    hnswLib: any,
    persistenceManager: PersistenceManager,
    cacheManager: CacheManager,
    diagnosticsService: DiagnosticsService,
    contentHashService: ContentHashService,
    baseDataPath: string
  ): HnswPersistenceOrchestrator {
    // Create specialized services
    const metadataManager = new HnswMetadataManager(
      persistenceManager,
      baseDataPath
    );

    const indexOperations = new HnswIndexOperations(
      config,
      hnswLib
    );

    // Create orchestrator with all dependencies (discoveryService removed)
    const orchestrator = new HnswPersistenceOrchestrator(
      config,
      hnswLib,
      metadataManager,
      indexOperations,
      diagnosticsService,
      contentHashService
    );

    return orchestrator;
  }

  /**
   * Create just the metadata manager (for testing or specialized use)
   */
  static createMetadataManager(
    persistenceManager: PersistenceManager,
    baseDataPath: string
  ): HnswMetadataManager {
    return new HnswMetadataManager(
      persistenceManager,
      baseDataPath
    );
  }

  /**
   * Create just the index operations (for testing or specialized use)
   */
  static createIndexOperations(
    config: HnswConfig,
    hnswLib: any
  ): HnswIndexOperations {
    return new HnswIndexOperations(config, hnswLib);
  }
}