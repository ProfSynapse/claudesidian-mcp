/**
 * ServiceInitializer - Handles service initialization and dependency management
 * Follows Single Responsibility Principle by focusing only on service initialization
 */

import { Plugin } from 'obsidian';
// Search services removed in simplified architecture
type MetadataSearchService = any;
type HybridSearchService = any;
import { MemoryService } from "../../../../../memoryManager/services/MemoryService";
import { WorkspaceService } from "../../../../../memoryManager/services/WorkspaceService";

export interface ServiceInitializationResult {
  success: boolean;
  error?: string;
  services?: {
    metadataSearchService: MetadataSearchService;
    hybridSearchService?: HybridSearchService;
    memoryService?: MemoryService;
    workspaceService?: WorkspaceService;
  };
}

export interface ServiceAvailability {
  metadataSearch: boolean;
  hybridSearch: boolean;
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
    hybridSearchService?: HybridSearchService;
    memoryService?: MemoryService;
    workspaceService?: WorkspaceService;
  } = {};

  constructor(private plugin: Plugin) {}

  /**
   * Initialize all available services
   */
  async initializeServices(
    providedServices?: {
      memoryService?: MemoryService;
      workspaceService?: WorkspaceService;
    }
  ): Promise<ServiceInitializationResult> {
    try {
      
      // MetadataSearchService removed in simplified architecture
      this.services.metadataSearchService = null;

      // Initialize provided services
      if (providedServices) {
        this.services.memoryService = providedServices.memoryService;
        this.services.workspaceService = providedServices.workspaceService;
      }

      // Try to get services from plugin if not provided
      await this.tryGetServicesFromPlugin();

      // Initialize search service
      await this.initializeSearchService();

      const availability = this.getServiceAvailability();

      return {
        success: true,
        services: {
          metadataSearchService: this.services.metadataSearchService!,
          hybridSearchService: this.services.hybridSearchService,
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
    }
  }

  /**
   * Try to get services from service manager
   */
  private async tryGetServicesFromServiceManager(serviceManager: any): Promise<void> {
    try {


      // Get memory service
      if (!this.services.memoryService) {
        try {
          this.services.memoryService = await serviceManager.get('memoryService');
        } catch (error) {
        }
      }

      // Get workspace service
      if (!this.services.workspaceService) {
        try {
          this.services.workspaceService = await serviceManager.get('workspaceService');
        } catch (error) {
        }
      }
    } catch (error) {
    }
  }

  /**
   * Try to get services from direct access
   */
  private async tryGetServicesFromDirectAccess(services: any): Promise<void> {
    try {


      // Get memory service
      if (!this.services.memoryService && services.memoryService) {
        this.services.memoryService = services.memoryService;
      }

      // Get workspace service
      if (!this.services.workspaceService && services.workspaceService) {
        this.services.workspaceService = services.workspaceService;
      }
    } catch (error) {
    }
  }

  /**
   * Initialize search service
   */
  private async initializeSearchService(): Promise<void> {
    try {
      if (!this.services.hybridSearchService) {
        
        // Initialize with simplified JSON-based storage
        this.services.hybridSearchService = null; // Search service removed in simplified architecture
      } else {
      }
    } catch (error) {
    }
  }

  /**
   * Get service availability
   */
  getServiceAvailability(): ServiceAvailability {
    return {
      metadataSearch: !!this.services.metadataSearchService,
      hybridSearch: !!this.services.hybridSearchService,
      memory: !!this.services.memoryService,
      workspace: !!this.services.workspaceService
    };
  }

  /**
   * Get initialized services
   */
  getServices(): {
    metadataSearchService?: MetadataSearchService;
    hybridSearchService?: HybridSearchService;
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
    return !!this.services.hybridSearchService && this.services.hybridSearchService.isSemanticSearchAvailable();
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

      // Populate search indexes if available
      if (this.services.hybridSearchService) {
        try {
          // Hybrid search doesn't need explicit population - it uses underlying services
          indexesPopulated.push('Hybrid');
        } catch (error) {
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
      // Get search status
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
    }

    return diagnostics;
  }
}