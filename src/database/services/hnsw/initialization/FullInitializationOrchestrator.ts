/**
 * Full Initialization Orchestrator for HNSW Search Service
 * Coordinates the complex phased initialization process following SRP
 */

import { App } from 'obsidian';
import { HnswConfig } from '../config/HnswConfig';
import { IndexDiscoveryService } from '../discovery/IndexDiscoveryService';
import { CollectionProcessingService } from '../discovery/CollectionProcessingService';
import { DataConversionService } from '../conversion/DataConversionService';
import { HnswPersistenceOrchestrator } from '../persistence/HnswPersistenceOrchestrator';
import { HnswIndexManager } from '../index/HnswIndexManager';
import { logger } from '../../../../utils/logger';

/**
 * Full initialization result
 */
export interface FullInitializationResult {
  success: boolean;
  phase: 'discovery' | 'collection-processing' | 'completed' | 'error';
  discoveryResult?: {
    discovered: number;
    recovered: number;
    failed: number;
  };
  processingResult?: {
    processed: number;
    built: number;
    loaded: number;
    skipped: number;
  };
  errors: string[];
  duration: number;
}

/**
 * Service responsible for orchestrating the full initialization process
 * Follows SRP by focusing only on initialization coordination
 */
export class FullInitializationOrchestrator {
  private config: HnswConfig;
  private app?: App;
  private persistenceService: HnswPersistenceOrchestrator;
  private indexManager: HnswIndexManager;
  private discoveryService: IndexDiscoveryService;
  private processingService: CollectionProcessingService;
  private conversionService: DataConversionService;

  constructor(
    config: HnswConfig,
    persistenceService: HnswPersistenceOrchestrator,
    indexManager: HnswIndexManager,
    app?: App
  ) {
    this.config = config;
    this.app = app;
    this.persistenceService = persistenceService;
    this.indexManager = indexManager;
    
    // Initialize supporting services
    this.conversionService = new DataConversionService();
    this.discoveryService = new IndexDiscoveryService(
      config,
      persistenceService,
      indexManager,
      this.conversionService
    );
    this.processingService = new CollectionProcessingService(
      config,
      indexManager,
      this.conversionService
    );
  }

  /**
   * Execute full initialization with error boundaries and recovery
   */
  async executeFullInitialization(): Promise<FullInitializationResult> {
    const startTime = Date.now();
    const result: FullInitializationResult = {
      success: false,
      phase: 'discovery',
      errors: [],
      duration: 0
    };

    logger.systemLog('[FULL-INIT] Beginning HNSW full initialization...', 'FullInitializationOrchestrator');

    try {
      // Phase 1: Index Discovery and Recovery
      result.phase = 'discovery';
      const discoveryResult = await this.executeDiscoveryPhase();
      result.discoveryResult = {
        discovered: discoveryResult.discovered,
        recovered: discoveryResult.recovered,
        failed: discoveryResult.failed
      };

      // Log discovery results
      if (discoveryResult.errors.length > 0) {
        result.errors.push(...discoveryResult.errors.map(e => `Discovery: ${e.collection} - ${e.error}`));
      }

      // Phase 2: Collection Processing
      result.phase = 'collection-processing';
      const processingResult = await this.executeCollectionProcessingPhase();
      result.processingResult = {
        processed: processingResult.processed,
        built: processingResult.built,
        loaded: processingResult.loaded,
        skipped: processingResult.skipped
      };

      // Log processing results
      if (processingResult.errors.length > 0) {
        result.errors.push(...processingResult.errors.map(e => `Processing: ${e.collection} - ${e.error}`));
      }

      // Mark as completed
      result.phase = 'completed';
      result.success = true;
      result.duration = Date.now() - startTime;

      // Log final summary
      this.logInitializationSummary(result);

    } catch (criticalError) {
      result.phase = 'error';
      result.success = false;
      result.duration = Date.now() - startTime;
      
      const errorMessage = criticalError instanceof Error ? criticalError.message : String(criticalError);
      result.errors.push(`Critical error: ${errorMessage}`);
      
      logger.systemError(
        new Error(`[FULL-INIT] Critical initialization error: ${errorMessage}`),
        'FullInitializationOrchestrator'
      );
      
      // Even critical errors shouldn't prevent the service from being marked as initialized
      logger.systemLog('[FULL-INIT] Service marked as initialized despite errors - search will work with available indexes', 'FullInitializationOrchestrator');
    }

    return result;
  }

  /**
   * Execute discovery phase with error boundaries
   */
  private async executeDiscoveryPhase() {
    try {
      logger.systemLog('[FULL-INIT-DISCOVERY] Starting index discovery phase', 'FullInitializationOrchestrator');
      const result = await this.discoveryService.discoverAndRecoverIndexes();
      
      logger.systemLog(
        `[FULL-INIT-DISCOVERY] Discovery phase completed: ${result.recovered} recovered, ${result.failed} failed`,
        'FullInitializationOrchestrator'
      );
      
      return result;
    } catch (discoveryError) {
      const errorMessage = discoveryError instanceof Error ? discoveryError.message : String(discoveryError);
      logger.systemWarn(
        `[FULL-INIT-DISCOVERY] Discovery phase failed but continuing: ${errorMessage}`,
        'FullInitializationOrchestrator'
      );
      
      return {
        discovered: 0,
        recovered: 0,
        failed: 1,
        collections: [],
        errors: [{ collection: 'discovery-phase', error: errorMessage }]
      };
    }
  }

  /**
   * Execute collection processing phase with error boundaries
   */
  private async executeCollectionProcessingPhase() {
    try {
      logger.systemLog('[FULL-INIT-PROCESSING] Starting collection processing phase', 'FullInitializationOrchestrator');
      const result = await this.processingService.ensureIndexesForExistingCollections(this.app);
      
      logger.systemLog(
        `[FULL-INIT-PROCESSING] Processing phase completed: ${result.built} built, ${result.skipped} skipped`,
        'FullInitializationOrchestrator'
      );
      
      return result;
    } catch (processingError) {
      const errorMessage = processingError instanceof Error ? processingError.message : String(processingError);
      logger.systemWarn(
        `[FULL-INIT-PROCESSING] Processing phase failed but continuing: ${errorMessage}`,
        'FullInitializationOrchestrator'
      );
      
      return {
        processed: 0,
        built: 0,
        loaded: 0,
        skipped: 1,
        errors: [{ collection: 'processing-phase', error: errorMessage }]
      };
    }
  }

  /**
   * Log comprehensive initialization summary
   */
  private logInitializationSummary(result: FullInitializationResult): void {
    const { discoveryResult, processingResult, duration, errors } = result;
    
    if (errors.length === 0) {
      logger.systemLog(
        `[FULL-INIT] HNSW initialization completed successfully in ${duration}ms`,
        'FullInitializationOrchestrator'
      );
    } else {
      logger.systemLog(
        `[FULL-INIT] HNSW initialization completed with ${errors.length} errors in ${duration}ms - service available`,
        'FullInitializationOrchestrator'
      );
    }

    // Log detailed statistics
    if (discoveryResult) {
      logger.systemLog(
        `[FULL-INIT-STATS] Discovery: ${discoveryResult.recovered}/${discoveryResult.discovered} collections recovered`,
        'FullInitializationOrchestrator'
      );
    }

    if (processingResult) {
      logger.systemLog(
        `[FULL-INIT-STATS] Processing: ${processingResult.built} built, ${processingResult.loaded} loaded, ${processingResult.skipped} skipped`,
        'FullInitializationOrchestrator'
      );
    }

    // Log errors if any
    if (errors.length > 0) {
      logger.systemWarn(
        `[FULL-INIT-ERRORS] Initialization errors (${errors.length}): ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}`,
        'FullInitializationOrchestrator'
      );
    }
  }

  /**
   * Get initialization health status
   */
  getInitializationHealth(): {
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check if basic services are available
    if (!this.persistenceService) {
      issues.push('Persistence service not available');
      recommendations.push('Restart the HNSW service');
    }

    if (!this.indexManager) {
      issues.push('Index manager not available');
      recommendations.push('Check service initialization');
    }

    // Check configuration
    if (!this.config.persistence.enabled) {
      issues.push('Persistence is disabled');
      recommendations.push('Enable persistence for better performance');
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * Execute lightweight health check
   */
  async performHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
    message: string;
  }> {
    const services = {
      persistence: !!this.persistenceService,
      indexManager: !!this.indexManager,
      discovery: !!this.discoveryService,
      processing: !!this.processingService,
      conversion: !!this.conversionService
    };

    const healthyServices = Object.values(services).filter(Boolean).length;
    const totalServices = Object.keys(services).length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    let message: string;

    if (healthyServices === totalServices) {
      status = 'healthy';
      message = 'All services operational';
    } else if (healthyServices >= totalServices * 0.7) {
      status = 'degraded';
      message = `${healthyServices}/${totalServices} services operational`;
    } else {
      status = 'unhealthy';
      message = `Only ${healthyServices}/${totalServices} services operational`;
    }

    return { status, services, message };
  }
}