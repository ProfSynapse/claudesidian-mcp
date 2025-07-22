import { App, Plugin } from 'obsidian';
import { IVectorStore } from '../../../interfaces/IVectorStore';
import { EmbeddingService } from '../../EmbeddingService';
import { logger } from '../../../../utils/logger';

// Import configuration and services
import { HnswConfig, HnswConfigOptions } from '../config/HnswConfig';
import { HnswValidationService } from '../validation/HnswValidationService';
import { HnswPersistenceOrchestrator } from '../persistence/HnswPersistenceOrchestrator';
import { HnswPersistenceFactory } from '../persistence/HnswPersistenceFactory';
import { HnswPartitionManager } from '../partitioning/HnswPartitionManager';
import { HnswIndexManager } from '../index/HnswIndexManager';
import { HnswSearchEngine } from '../search/HnswSearchEngine';
import { HnswResultProcessor } from '../results/HnswResultProcessor';

// Import existing services for dependency injection
import { PersistenceManager, FileSystemInterface } from '../../../providers/chroma/services/PersistenceManager';
import { ContentHashService } from '../../embedding/ContentHashService';
import { ProcessedFilesStateManager } from '../../state/ProcessedFilesStateManager';

/**
 * Service responsible for initializing all HNSW specialized services
 * Follows SRP by focusing only on service initialization and dependency injection
 */
export class ServiceInitializer {
  private app?: App;
  private plugin: Plugin;
  private vectorStore?: IVectorStore;
  private embeddingService?: EmbeddingService;
  private persistentPath?: string;
  private config: HnswConfig;

  // Initialized services
  private validationService?: HnswValidationService;
  private persistenceService?: HnswPersistenceOrchestrator;
  private partitionManager?: HnswPartitionManager;
  private indexManager?: HnswIndexManager;
  private searchEngine?: HnswSearchEngine;
  private resultProcessor?: HnswResultProcessor;

  constructor(
    plugin: Plugin,
    app?: App,
    vectorStore?: IVectorStore,
    embeddingService?: EmbeddingService,
    persistentPath?: string,
    configOptions?: HnswConfigOptions
  ) {
    this.plugin = plugin;
    this.app = app;
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    this.persistentPath = persistentPath;
    this.config = configOptions ? new HnswConfig(configOptions) : HnswConfig.getProductionConfig();
    
    console.log('[StateManager] ServiceInitializer initialized with plugin instance:', {
      hasPlugin: !!plugin,
      hasApp: !!app,
      pluginType: plugin?.constructor?.name
    });
  }

  /**
   * Initialize all specialized services following dependency injection patterns
   */
  async initializeServices(): Promise<{
    validationService: HnswValidationService;
    persistenceService: HnswPersistenceOrchestrator;
    partitionManager: HnswPartitionManager;
    indexManager: HnswIndexManager;
    searchEngine: HnswSearchEngine;
    resultProcessor: HnswResultProcessor;
  }> {
    try {
      // Create validation service
      this.validationService = new HnswValidationService(this.config);

      // Result processor has no dependencies
      this.resultProcessor = new HnswResultProcessor();

      console.log('[StateManager] ❌ WARNING: ServiceInitializer cannot create persistence service for IndexedDB/WASM');
      console.log('[StateManager] ❌ HNSW services should be created directly without ServiceInitializer');
      console.log('[StateManager] ❌ Only basic services (validation, result processor) initialized');

      logger.systemLog('Basic HNSW services initialized (persistence service NOT created)', 'ServiceInitializer');

      return {
        validationService: this.validationService,
        persistenceService: this.persistenceService!, // Will be null - this is wrong architecture
        partitionManager: this.partitionManager!, // Will be initialized in initializeWithHnswLib
        indexManager: this.indexManager!,
        searchEngine: this.searchEngine!,
        resultProcessor: this.resultProcessor
      };
    } catch (error) {
      logger.systemError(
        new Error(`Failed to initialize HNSW services: ${error instanceof Error ? error.message : String(error)}`),
        'ServiceInitializer'
      );
      throw error;
    }
  }

  /**
   * Complete initialization with HNSW library after it's loaded
   * NOTE: This method is incompatible with IndexedDB/WASM persistence
   */
  async initializeWithHnswLib(hnswLib: any): Promise<{
    partitionManager: HnswPartitionManager;
    indexManager: HnswIndexManager;
    searchEngine: HnswSearchEngine;
  }> {
    console.log('[StateManager] ❌ CRITICAL: ServiceInitializer.initializeWithHnswLib is incompatible with IndexedDB/WASM persistence');
    console.log('[StateManager] ❌ ARCHITECTURE ISSUE: HNSW services should be created directly without ServiceInitializer');
    console.log('[StateManager] ❌ SOLUTION: Use WasmFilesystemManager and HnswIndexOperations for proper IndexedDB persistence');
    
    throw new Error('ServiceInitializer.initializeWithHnswLib is incompatible with IndexedDB/WASM persistence. HNSW services should NOT use ServiceInitializer for IndexedDB systems.');
  }

  /**
   * Create persistence service with dependencies
   * NOTE: This method should not be used for HNSW index persistence
   * HNSW indexes use IndexedDB via WasmFilesystemManager, not file system operations
   */
  private async createPersistenceService(): Promise<HnswPersistenceOrchestrator> {
    console.log('[StateManager] ❌ WARNING: ServiceInitializer.createPersistenceService should not be used for HNSW indexes');
    console.log('[StateManager] ❌ HNSW indexes use IndexedDB via WasmFilesystemManager, not file system operations');
    console.log('[StateManager] ❌ This method is incompatible with IndexedDB/WASM persistence');
    
    throw new Error('ServiceInitializer.createPersistenceService is incompatible with IndexedDB/WASM persistence. HNSW indexes should use WasmFilesystemManager.');
  }

  /**
   * Recreate persistence service with HNSW library
   * NOTE: This method should not be used for HNSW index persistence
   * HNSW indexes use IndexedDB via WasmFilesystemManager, not file system operations
   */
  private async recreatePersistenceServiceWithHnswLib(hnswLib: any): Promise<HnswPersistenceOrchestrator> {
    console.log('[StateManager] ❌ WARNING: recreatePersistenceServiceWithHnswLib should not be used for HNSW indexes');
    console.log('[StateManager] ❌ HNSW indexes use IndexedDB via WasmFilesystemManager, not file system operations');
    console.log('[StateManager] ❌ This method is incompatible with IndexedDB/WASM persistence');
    
    throw new Error('ServiceInitializer.recreatePersistenceServiceWithHnswLib is incompatible with IndexedDB/WASM persistence. HNSW indexes should use WasmFilesystemManager.');
  }

  /**
   * Update configuration for all services
   */
  updateConfiguration(configOptions: Partial<HnswConfigOptions>): void {
    const newConfig = this.config.withOverrides(configOptions);
    this.config = newConfig;
    
    // Propagate configuration changes to all services
    if (this.indexManager) {
      this.indexManager.updateConfig(newConfig);
    }
  }

  /**
   * Get current configuration
   */
  getConfiguration(): HnswConfig {
    return this.config;
  }

  /**
   * Check if services are initialized
   */
  isInitialized(): boolean {
    return !!(this.validationService && this.persistenceService && this.resultProcessor);
  }

  /**
   * Check if services are fully initialized (with HNSW library)
   */
  isFullyInitialized(): boolean {
    return this.isInitialized() && !!(this.partitionManager && this.indexManager && this.searchEngine);
  }
}