import { Plugin } from 'obsidian';
import { VectorStoreConfig } from '../../models/VectorStoreConfig';
import { ObsidianPathManager } from '../../../core/ObsidianPathManager';
// FileSystemInterface removed - now using Obsidian API directly

// Consolidated service imports
import { ChromaClientFactory } from './services/ChromaClientFactory';
import { CollectionManager } from './services/CollectionManager';
import { PersistenceManager } from './services/PersistenceManager'; // Now includes DirectoryService functionality
import { CollectionRepository } from './services/CollectionRepository'; // Now includes SizeCalculatorService functionality
import { ChromaVectorStoreDiagnosticsService } from '../../services/monitoring/ChromaVectorStoreDiagnosticsService'; // Moved to monitoring layer

// Consolidated service interfaces
import type { 
  IChromaClientFactory, 
  ICollectionManager,
  IDirectoryService,
  IDiagnosticsService,
  ISizeCalculatorService
} from './types/ChromaTypes';

import { ChromaClient } from './PersistentChromaClient';

/**
 * Location: src/database/providers/chroma/ServiceCoordinator.ts
 * 
 * ServiceCoordinator handles service coordination and management logic for ChromaVectorStoreModular.
 * This service manages:
 * - Service lifecycle coordination
 * - Dependency injection and resolution
 * - Service initialization order
 * - Cross-service communication setup
 * - Service state management
 * 
 * Used by ChromaVectorStoreModular to separate service coordination concerns from core vector operations.
 * Coordinates with VectorStoreInitializer for proper initialization sequence.
 */
export interface ServiceCoordinatorInterface {
  initializeServices(plugin: Plugin): ServiceRegistry;
  initializeClientDependentServices(
    client: InstanceType<typeof ChromaClient>,
    services: ServiceRegistry,
    config: VectorStoreConfig
  ): ClientDependentServices;
  setupServiceCommunication(
    services: ServiceRegistry,
    clientDependentServices: ClientDependentServices,
    plugin: Plugin
  ): void;
  shutdownServices(services: ServiceRegistry): Promise<void>;
  validateServiceDependencies(services: ServiceRegistry): boolean;
}

export interface ServiceRegistry {
  directoryService: IDirectoryService;
  clientFactory: IChromaClientFactory;
  collectionManager?: ICollectionManager;
  diagnosticsService?: IDiagnosticsService;
  sizeCalculatorService?: ISizeCalculatorService;
}

export interface ClientDependentServices {
  collectionManager: ICollectionManager;
  diagnosticsService: IDiagnosticsService;
  sizeCalculatorService: ISizeCalculatorService;
}

/**
 * Coordinates service initialization, dependency injection, and lifecycle management
 * for the ChromaVectorStoreModular system. Follows Dependency Inversion Principle
 * and ensures proper service initialization order.
 */
export class ServiceCoordinator implements ServiceCoordinatorInterface {
  constructor() {
    console.log('[ServiceCoordinator] Initialized without Node.js filesystem dependencies');
  }

  /**
   * Initialize core services with proper dependency injection
   * Follows Dependency Inversion Principle - depends on abstractions
   */
  initializeServices(plugin: Plugin): ServiceRegistry {
    try {
      console.log('[ServiceCoordinator] Initializing services with Obsidian App instance');
      
      // Create directory service (requires app and plugin) - now using PersistenceManager with Obsidian API
      const directoryService = new PersistenceManager(plugin.app, 250, 5, plugin);
      
      // Create client factory (depends on directory service)
      const clientFactory = new ChromaClientFactory(directoryService, plugin);
      
      console.log('[ServiceCoordinator] Core services initialized successfully');
      
      return {
        directoryService,
        clientFactory
      };
      
    } catch (error) {
      console.error('[ServiceCoordinator] Failed to initialize core services:', error);
      throw new Error(`Service initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Initialize services that depend on the ChromaDB client
   * Ensures proper dependency resolution and injection
   */
  initializeClientDependentServices(
    client: InstanceType<typeof ChromaClient>,
    services: ServiceRegistry,
    config: VectorStoreConfig
  ): ClientDependentServices {
    try {
      if (!client) {
        throw new Error('Client must be initialized before dependent services');
      }

      if (!services.directoryService || !services.clientFactory) {
        throw new Error('Core services must be initialized before client-dependent services');
      }

      // Create collection manager (depends on client and directory service)
      const collectionManager = new CollectionManager(
        client,
        services.directoryService,
        config.persistentPath
      );
      
      // Inject ObsidianPathManager to prevent path duplication
      // Note: This requires the plugin instance - we may need to pass it through
      // For now, we'll handle this in the vector store itself
      
      // Create collection repository (provides size calculation functionality)
      const collectionRepository = new CollectionRepository(client);
      
      // Create diagnostics service (depends on all other services) 
      const diagnosticsService = new ChromaVectorStoreDiagnosticsService(
        client,
        services.directoryService,
        collectionRepository,
        config
      );

      // Client-dependent services initialized successfully

      return {
        collectionManager,
        diagnosticsService,
        sizeCalculatorService: collectionRepository // CollectionRepository provides size calculation functionality
      };
      
    } catch (error) {
      console.error('[ServiceCoordinator] Failed to initialize client-dependent services:', error);
      throw new Error(`Client-dependent service initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Setup cross-service dependencies and communication channels
   */
  setupServiceCommunication(
    services: ServiceRegistry,
    clientDependentServices: ClientDependentServices,
    plugin: Plugin
  ): void {
    try {
      // Inject ObsidianPathManager into CollectionManager
      const pathManager = new ObsidianPathManager(plugin.app.vault, plugin.manifest);
      clientDependentServices.collectionManager.setPathManager(pathManager);
      
      // Update service registry with client-dependent services
      services.collectionManager = clientDependentServices.collectionManager;
      services.diagnosticsService = clientDependentServices.diagnosticsService;
      services.sizeCalculatorService = clientDependentServices.sizeCalculatorService;
      
      // Service communication channels setup completed
      
    } catch (error) {
      console.error('[ServiceCoordinator] Failed to setup service communication:', error);
      throw new Error(`Service communication setup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate that all service dependencies are properly resolved
   */
  validateServiceDependencies(services: ServiceRegistry): boolean {
    try {
      // Check core services
      if (!services.directoryService) {
        console.error('[ServiceCoordinator] Missing directory service');
        return false;
      }
      
      if (!services.clientFactory) {
        console.error('[ServiceCoordinator] Missing client factory');
        return false;
      }
      
      // Check client-dependent services (if they should be initialized)
      if (services.collectionManager && services.diagnosticsService && services.sizeCalculatorService) {
        // All client-dependent services should be present together
        // All services validated successfully
        return true;
      } else if (!services.collectionManager && !services.diagnosticsService && !services.sizeCalculatorService) {
        // No client-dependent services yet - this is OK for partial initialization
        // Core services validated successfully
        return true;
      } else {
        // Partial client-dependent services - this indicates a problem
        console.error('[ServiceCoordinator] Inconsistent client-dependent service state');
        return false;
      }
      
    } catch (error) {
      console.error('[ServiceCoordinator] Service validation failed:', error);
      return false;
    }
  }

  /**
   * Perform graceful shutdown of all services
   */
  async shutdownServices(services: ServiceRegistry): Promise<void> {
    try {
      // Shutdown services in reverse order of dependencies
      
      // Shutdown diagnostics service first (depends on others)
      if (services.diagnosticsService) {
        try {
          // DiagnosticsService doesn't have explicit shutdown, but we can clear any resources
          // Diagnostics service shutdown completed
        } catch (error) {
          console.warn('[ServiceCoordinator] Error shutting down diagnostics service:', error);
        }
      }
      
      // Shutdown size calculator service
      if (services.sizeCalculatorService) {
        try {
          // SizeCalculatorService doesn't have explicit shutdown
          // Size calculator service shutdown completed
        } catch (error) {
          console.warn('[ServiceCoordinator] Error shutting down size calculator service:', error);
        }
      }
      
      // Clear collection manager cache
      if (services.collectionManager) {
        try {
          services.collectionManager.clearCache();
          // Collection manager shutdown completed
        } catch (error) {
          console.warn('[ServiceCoordinator] Error shutting down collection manager:', error);
        }
      }
      
      // Directory service and client factory don't need explicit shutdown
      
      // All services shutdown completed successfully
      
    } catch (error) {
      console.error('[ServiceCoordinator] Error during service shutdown:', error);
      throw error;
    }
  }

  /**
   * Get service health status for monitoring
   */
  getServiceHealthStatus(services: ServiceRegistry): ServiceHealthStatus {
    const status: ServiceHealthStatus = {
      directoryService: !!services.directoryService,
      clientFactory: !!services.clientFactory,
      collectionManager: !!services.collectionManager,
      diagnosticsService: !!services.diagnosticsService,
      sizeCalculatorService: !!services.sizeCalculatorService,
      overallHealth: false
    };
    
    // Determine overall health
    const coreServicesHealthy = status.directoryService && status.clientFactory;
    const clientDependentServicesConsistent = 
      (status.collectionManager && status.diagnosticsService && status.sizeCalculatorService) ||
      (!status.collectionManager && !status.diagnosticsService && !status.sizeCalculatorService);
    
    status.overallHealth = coreServicesHealthy && clientDependentServicesConsistent;
    
    return status;
  }

  /**
   * Perform service diagnostics and report issues
   */
  async performServiceDiagnostics(services: ServiceRegistry): Promise<ServiceDiagnosticsReport> {
    const report: ServiceDiagnosticsReport = {
      timestamp: new Date(),
      issues: [],
      recommendations: [],
      serviceStatus: this.getServiceHealthStatus(services)
    };
    
    try {
      // Check core services
      if (!services.directoryService) {
        report.issues.push('Directory service not initialized');
        report.recommendations.push('Reinitialize core services');
      }
      
      if (!services.clientFactory) {
        report.issues.push('Client factory not initialized');
        report.recommendations.push('Reinitialize core services');
      }
      
      // Check client-dependent services consistency
      const clientDepCount = [
        services.collectionManager,
        services.diagnosticsService,
        services.sizeCalculatorService
      ].filter(s => !!s).length;
      
      if (clientDepCount > 0 && clientDepCount < 3) {
        report.issues.push('Inconsistent client-dependent service initialization');
        report.recommendations.push('Reinitialize client-dependent services');
      }
      
      // Add success message if no issues
      if (report.issues.length === 0) {
        report.recommendations.push('All services are healthy');
      }
      
    } catch (error) {
      report.issues.push(`Service diagnostics failed: ${error instanceof Error ? error.message : String(error)}`);
      report.recommendations.push('Check service initialization sequence');
    }
    
    return report;
  }
}

export interface ServiceHealthStatus {
  directoryService: boolean;
  clientFactory: boolean;
  collectionManager: boolean;
  diagnosticsService: boolean;
  sizeCalculatorService: boolean;
  overallHealth: boolean;
}

export interface ServiceDiagnosticsReport {
  timestamp: Date;
  issues: string[];
  recommendations: string[];
  serviceStatus: ServiceHealthStatus;
}