import { App } from 'obsidian';
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

/**
 * Service responsible for initializing all HNSW specialized services
 * Follows SRP by focusing only on service initialization and dependency injection
 */
export class ServiceInitializer {
  private app?: App;
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
    app?: App,
    vectorStore?: IVectorStore,
    embeddingService?: EmbeddingService,
    persistentPath?: string,
    configOptions?: HnswConfigOptions
  ) {
    this.app = app;
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    this.persistentPath = persistentPath;
    this.config = configOptions ? new HnswConfig(configOptions) : HnswConfig.getProductionConfig();
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

      // Create persistence service with proper dependencies
      this.persistenceService = await this.createPersistenceService();

      // Result processor has no dependencies
      this.resultProcessor = new HnswResultProcessor();

      logger.systemLog('Basic HNSW services initialized successfully', 'ServiceInitializer');

      return {
        validationService: this.validationService,
        persistenceService: this.persistenceService,
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
   */
  async initializeWithHnswLib(hnswLib: any): Promise<{
    partitionManager: HnswPartitionManager;
    indexManager: HnswIndexManager;
    searchEngine: HnswSearchEngine;
  }> {
    if (!this.validationService || !this.persistenceService || !this.resultProcessor) {
      throw new Error('Basic services must be initialized first');
    }

    try {
      // Update persistence service with hnswLib
      this.persistenceService = await this.recreatePersistenceServiceWithHnswLib(hnswLib);

      // Initialize remaining services that depend on hnswLib
      this.partitionManager = new HnswPartitionManager(this.config, hnswLib);

      const contentHashService = new ContentHashService(this.app as any);
      
      this.indexManager = new HnswIndexManager(
        this.config,
        this.validationService,
        this.persistenceService,
        this.partitionManager,
        contentHashService,
        hnswLib
      );

      this.searchEngine = new HnswSearchEngine(
        this.config,
        this.validationService,
        this.indexManager
      );

      logger.systemLog('HNSW services with library initialized successfully', 'ServiceInitializer');

      return {
        partitionManager: this.partitionManager,
        indexManager: this.indexManager,
        searchEngine: this.searchEngine
      };
    } catch (error) {
      logger.systemError(
        new Error(`Failed to initialize HNSW services with library: ${error instanceof Error ? error.message : String(error)}`),
        'ServiceInitializer'
      );
      throw error;
    }
  }

  /**
   * Create persistence service with dependencies
   */
  private async createPersistenceService(): Promise<HnswPersistenceOrchestrator> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fsModule = require('fs');
    const fs: FileSystemInterface = {
      existsSync: fsModule.existsSync,
      mkdirSync: fsModule.mkdirSync,
      writeFileSync: fsModule.writeFileSync,
      readFileSync: fsModule.readFileSync,
      renameSync: fsModule.renameSync,
      unlinkSync: fsModule.unlinkSync,
      readdirSync: fsModule.readdirSync,
      statSync: fsModule.statSync,
      rmdirSync: fsModule.rmdirSync,
    };

    const persistenceManager = new PersistenceManager(fs);
    const contentHashService = new ContentHashService(this.app as any);
    
    // DiagnosticsService requires multiple dependencies, create a stub for now
    const diagnosticsService = null; // Will be properly initialized later when needed
    
    // Use factory to create the orchestrator with proper dependencies
    return HnswPersistenceFactory.create(
      this.config,
      null, // hnswLib will be set later in initialize()
      persistenceManager,
      {} as any, // CacheManager not needed anymore
      diagnosticsService as any,
      contentHashService,
      this.persistentPath || '/tmp/hnsw'
    );
  }

  /**
   * Recreate persistence service with HNSW library
   */
  private async recreatePersistenceServiceWithHnswLib(hnswLib: any): Promise<HnswPersistenceOrchestrator> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fsModule = require('fs');
    const fs: FileSystemInterface = {
      existsSync: fsModule.existsSync,
      mkdirSync: fsModule.mkdirSync,
      writeFileSync: fsModule.writeFileSync,
      readFileSync: fsModule.readFileSync,
      renameSync: fsModule.renameSync,
      unlinkSync: fsModule.unlinkSync,
      readdirSync: fsModule.readdirSync,
      statSync: fsModule.statSync,
      rmdirSync: fsModule.rmdirSync,
    };
    
    const persistenceManager = new PersistenceManager(fs);
    const contentHashService = new ContentHashService(this.app as any);
    
    // DiagnosticsService requires multiple dependencies, skip for now
    const diagnosticsService = null;
    
    return HnswPersistenceFactory.create(
      this.config,
      hnswLib,
      persistenceManager,
      {} as any, // CacheManager not needed
      diagnosticsService as any,
      contentHashService,
      this.persistentPath || '/tmp/hnsw'
    );
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