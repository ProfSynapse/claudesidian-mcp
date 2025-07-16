/**
 * ServiceInitializer - Handles service initialization and dependency management
 * Follows Single Responsibility Principle by focusing only on service initialization
 */

import { Plugin } from 'obsidian';
import { HnswSearchService } from '../../../../../../database/services/hnsw/HnswSearchService';
import { MetadataSearchService } from '../../../../../../database/services/MetadataSearchService';
import { HybridSearchService } from '../../../../../../database/services/search';
import { EmbeddingService } from '../../../../../../database/services/EmbeddingService';
import { MemoryService } from '../../../../../../database/services/MemoryService';
import { WorkspaceService } from '../../../../../../database/services/WorkspaceService';

export interface ServiceInitializationResult {
  success: boolean;
  error?: string;
  services?: {
    metadataSearchService: MetadataSearchService;
    hnswSearchService?: HnswSearchService;
    hybridSearchService?: HybridSearchService;
    embeddingService?: EmbeddingService;
    memoryService?: MemoryService;
    workspaceService?: WorkspaceService;
  };
}

export interface ServiceAvailability {
  metadataSearch: boolean;
  hnswSearch: boolean;
  hybridSearch: boolean;
  embedding: boolean;
  memory: boolean;
  workspace: boolean;
}

/**
 * Service responsible for initializing and managing search services
 * Follows SRP by focusing only on service initialization operations
 */
export class ServiceInitializer {
  private services: {
    metadataSearchService?: MetadataSearchService;
    hnswSearchService?: HnswSearchService;
    hybridSearchService?: HybridSearchService;
    embeddingService?: EmbeddingService;
    memoryService?: MemoryService;
    workspaceService?: WorkspaceService;
  } = {};

  constructor(private plugin: Plugin) {}

  /**
   * Initialize all available services
   */
  async initializeServices(
    providedServices?: {
      hnswSearchService?: HnswSearchService;
      embeddingService?: EmbeddingService;
      memoryService?: MemoryService;
      workspaceService?: WorkspaceService;
    }
  ): Promise<ServiceInitializationResult> {
    try {
      // Initialize metadata search service (always available)
      this.services.metadataSearchService = new MetadataSearchService(this.plugin.app);

      // Initialize provided services
      if (providedServices) {
        this.services.hnswSearchService = providedServices.hnswSearchService;
        this.services.embeddingService = providedServices.embeddingService;
        this.services.memoryService = providedServices.memoryService;
        this.services.workspaceService = providedServices.workspaceService;
      }

      // Try to get services from plugin if not provided
      await this.tryGetServicesFromPlugin();

      // Initialize hybrid search service if HNSW is available
      await this.initializeHybridSearchService();

      return {
        success: true,
        services: {
          metadataSearchService: this.services.metadataSearchService!,
          hnswSearchService: this.services.hnswSearchService,
          hybridSearchService: this.services.hybridSearchService,
          embeddingService: this.services.embeddingService,
          memoryService: this.services.memoryService,
          workspaceService: this.services.workspaceService
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Service initialization failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Try to get services from plugin
   */
  private async tryGetServicesFromPlugin(): Promise<void> {
    try {
      const plugin = this.plugin as any;

      // Try lazy service manager first
      if (plugin.serviceManager) {
        await this.tryGetServicesFromServiceManager(plugin.serviceManager);
      }
      
      // Try direct services access
      if (plugin.services) {
        await this.tryGetServicesFromDirectAccess(plugin.services);
      }
    } catch (error) {
      console.warn('[ServiceInitializer] Failed to get services from plugin:', error);
    }
  }

  /**
   * Try to get services from service manager
   */
  private async tryGetServicesFromServiceManager(serviceManager: any): Promise<void> {
    try {
      // Get HNSW service
      if (!this.services.hnswSearchService) {
        try {
          this.services.hnswSearchService = await serviceManager.get('hnswSearchService');
        } catch (error) {
          console.warn('[ServiceInitializer] Failed to get HNSW service from service manager:', error);
        }
      }

      // Get embedding service
      if (!this.services.embeddingService) {
        try {
          this.services.embeddingService = await serviceManager.get('embeddingService');
        } catch (error) {
          console.warn('[ServiceInitializer] Failed to get embedding service from service manager:', error);
        }
      }

      // Get memory service
      if (!this.services.memoryService) {
        try {
          this.services.memoryService = await serviceManager.get('memoryService');
        } catch (error) {
          console.warn('[ServiceInitializer] Failed to get memory service from service manager:', error);
        }
      }

      // Get workspace service
      if (!this.services.workspaceService) {
        try {
          this.services.workspaceService = await serviceManager.get('workspaceService');
        } catch (error) {
          console.warn('[ServiceInitializer] Failed to get workspace service from service manager:', error);
        }
      }
    } catch (error) {
      console.warn('[ServiceInitializer] Error accessing service manager:', error);
    }
  }

  /**
   * Try to get services from direct access
   */
  private async tryGetServicesFromDirectAccess(services: any): Promise<void> {
    try {
      // Get HNSW service
      if (!this.services.hnswSearchService && services.hnswSearchService) {
        this.services.hnswSearchService = services.hnswSearchService;
      }

      // Get embedding service
      if (!this.services.embeddingService && services.embeddingService) {
        this.services.embeddingService = services.embeddingService;
      }

      // Get memory service
      if (!this.services.memoryService && services.memoryService) {
        this.services.memoryService = services.memoryService;
      }

      // Get workspace service
      if (!this.services.workspaceService && services.workspaceService) {
        this.services.workspaceService = services.workspaceService;
      }
    } catch (error) {
      console.warn('[ServiceInitializer] Error accessing direct services:', error);
    }
  }

  /**
   * Initialize hybrid search service
   */
  private async initializeHybridSearchService(): Promise<void> {
    try {
      if (this.services.hnswSearchService && !this.services.hybridSearchService) {
        this.services.hybridSearchService = new HybridSearchService(
          this.services.hnswSearchService
        );
      }
    } catch (error) {
      console.warn('[ServiceInitializer] Failed to initialize hybrid search service:', error);
    }
  }

  /**
   * Get service availability
   */
  getServiceAvailability(): ServiceAvailability {
    return {
      metadataSearch: !!this.services.metadataSearchService,
      hnswSearch: !!this.services.hnswSearchService,
      hybridSearch: !!this.services.hybridSearchService,
      embedding: !!this.services.embeddingService,
      memory: !!this.services.memoryService,
      workspace: !!this.services.workspaceService
    };
  }

  /**
   * Get initialized services
   */
  getServices(): {
    metadataSearchService?: MetadataSearchService;
    hnswSearchService?: HnswSearchService;
    hybridSearchService?: HybridSearchService;
    embeddingService?: EmbeddingService;
    memoryService?: MemoryService;
    workspaceService?: WorkspaceService;
  } {
    return { ...this.services };
  }

  /**
   * Update a specific service
   */
  updateService(serviceName: string, service: any): void {
    switch (serviceName) {
      case 'hnswSearchService':
        this.services.hnswSearchService = service;
        // Reinitialize hybrid search if HNSW changed
        this.initializeHybridSearchService();
        break;
      case 'embeddingService':
        this.services.embeddingService = service;
        break;
      case 'memoryService':
        this.services.memoryService = service;
        break;
      case 'workspaceService':
        this.services.workspaceService = service;
        break;
    }
  }

  /**
   * Check if semantic search is available
   */
  isSemanticSearchAvailable(): boolean {
    return !!this.services.hnswSearchService;
  }

  /**
   * Check if hybrid search is available
   */
  isHybridSearchAvailable(): boolean {
    return !!this.services.hybridSearchService;
  }

  /**
   * Populate hybrid search indexes
   */
  async populateHybridSearchIndexes(): Promise<{
    success: boolean;
    error?: string;
    indexesPopulated?: string[];
  }> {
    try {
      const indexesPopulated: string[] = [];

      // Populate HNSW indexes if available
      if (this.services.hnswSearchService) {
        try {
          // HNSW indexes are populated through the vector store
          indexesPopulated.push('HNSW');
        } catch (error) {
          console.warn('[ServiceInitializer] Failed to populate HNSW indexes:', error);
        }
      }

      // Populate hybrid search indexes if available
      if (this.services.hybridSearchService) {
        try {
          // Hybrid search doesn't need explicit population - it uses underlying services
          indexesPopulated.push('Hybrid');
        } catch (error) {
          console.warn('[ServiceInitializer] Failed to populate hybrid indexes:', error);
        }
      }

      return {
        success: true,
        indexesPopulated
      };
    } catch (error) {
      return {
        success: false,
        error: `Index population failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get service diagnostics
   */
  async getServiceDiagnostics(): Promise<{
    services: ServiceAvailability;
    hnswIndexStatus?: string;
    hybridIndexStatus?: string;
    metadataStats?: {
      totalTags: number;
      totalProperties: number;
    };
  }> {
    const diagnostics: any = {
      services: this.getServiceAvailability()
    };

    try {
      // Get HNSW status
      if (this.services.hnswSearchService) {
        try {
          const hnswStats = this.services.hnswSearchService.getIndexStats('file_embeddings');
          diagnostics.hnswIndexStatus = `${hnswStats?.itemCount || 0} items indexed`;
        } catch (error) {
          diagnostics.hnswIndexStatus = 'Error getting stats';
        }
      }

      // Get hybrid status
      if (this.services.hybridSearchService) {
        try {
          const hybridStats = this.services.hybridSearchService.getStats();
          diagnostics.hybridIndexStatus = `Ready with multiple indexes`;
        } catch (error) {
          diagnostics.hybridIndexStatus = 'Error getting stats';
        }
      }

      // Get metadata stats
      if (this.services.metadataSearchService) {
        try {
          const allTags = await this.services.metadataSearchService.getAllTags();
          const allProperties = await this.services.metadataSearchService.getAllPropertyKeys();
          diagnostics.metadataStats = {
            totalTags: allTags.length,
            totalProperties: allProperties.length
          };
        } catch (error) {
          diagnostics.metadataStats = { totalTags: 0, totalProperties: 0 };
        }
      }
    } catch (error) {
      console.warn('[ServiceInitializer] Error getting diagnostics:', error);
    }

    return diagnostics;
  }
}