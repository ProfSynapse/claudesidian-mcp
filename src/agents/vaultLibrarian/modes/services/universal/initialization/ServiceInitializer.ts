/**
 * ServiceInitializer - Handles service initialization and dependency management
 * Follows Single Responsibility Principle by focusing only on service initialization
 */

import { Plugin } from 'obsidian';
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
    hybridSearchService?: HybridSearchService;
    embeddingService?: EmbeddingService;
    memoryService?: MemoryService;
    workspaceService?: WorkspaceService;
  };
}

export interface ServiceAvailability {
  metadataSearch: boolean;
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
      embeddingService?: EmbeddingService;
      memoryService?: MemoryService;
      workspaceService?: WorkspaceService;
    }
  ): Promise<ServiceInitializationResult> {
    try {
      console.log('[SERVICE_INIT] 🚀 Starting service initialization for UniversalSearchService...');
      
      // Initialize metadata search service (always available)
      console.log('[SERVICE_INIT] 🔄 Initializing MetadataSearchService...');
      this.services.metadataSearchService = new MetadataSearchService(this.plugin.app);
      console.log('[SERVICE_INIT] ✅ MetadataSearchService initialized');

      // Initialize provided services
      if (providedServices) {
        console.log('[SERVICE_INIT] 📦 Using provided services:', {
          embeddingService: !!providedServices.embeddingService,
          memoryService: !!providedServices.memoryService,
          workspaceService: !!providedServices.workspaceService
        });
        this.services.embeddingService = providedServices.embeddingService;
        this.services.memoryService = providedServices.memoryService;
        this.services.workspaceService = providedServices.workspaceService;
      }

      // Try to get services from plugin if not provided
      console.log('[SERVICE_INIT] 🔄 Attempting to get services from plugin...');
      await this.tryGetServicesFromPlugin();

      // Initialize hybrid search service with ChromaDB integration
      console.log('[SERVICE_INIT] 🔄 Initializing HybridSearchService...');
      await this.initializeHybridSearchService();

      const availability = this.getServiceAvailability();
      console.log('[SERVICE_INIT] ✅ Service initialization completed successfully:');
      console.log('[SERVICE_INIT] - MetadataSearch:', availability.metadataSearch ? '✅' : '❌');
      console.log('[SERVICE_INIT] - HybridSearch:', availability.hybridSearch ? '✅' : '❌');
      console.log('[SERVICE_INIT] - Embedding:', availability.embedding ? '✅' : '❌');
      console.log('[SERVICE_INIT] - Memory:', availability.memory ? '✅' : '❌');
      console.log('[SERVICE_INIT] - Workspace:', availability.workspace ? '✅' : '❌');

      return {
        success: true,
        services: {
          metadataSearchService: this.services.metadataSearchService!,
          hybridSearchService: this.services.hybridSearchService,
          embeddingService: this.services.embeddingService,
          memoryService: this.services.memoryService,
          workspaceService: this.services.workspaceService
        }
      };
    } catch (error) {
      console.error('[SERVICE_INIT] ❌ Service initialization failed:', error);
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
      // HNSW service removed

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
      // HNSW service removed

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
   * Initialize hybrid search service with ChromaDB integration
   */
  private async initializeHybridSearchService(): Promise<void> {
    try {
      if (!this.services.hybridSearchService) {
        console.log('[SERVICE_INIT] 🔄 Attempting to initialize HybridSearchService...');
        
        // Try to get vectorStore and embeddingService from plugin
        let vectorStore: any = undefined;
        let embeddingService: any = undefined;
        
        try {
          console.log('[SERVICE_INIT] 🔍 Looking for vectorStore and embeddingService in plugin...');
          const plugin = this.plugin as any;
          if (plugin.services) {
            vectorStore = plugin.services.vectorStore;
            embeddingService = this.services.embeddingService || plugin.services.embeddingService;
            console.log('[SERVICE_INIT] 📦 Found plugin services:', {
              hasServices: !!plugin.services,
              hasVectorStore: !!vectorStore,
              hasEmbeddingService: !!embeddingService
            });
          } else {
            console.log('[SERVICE_INIT] ❌ Plugin.services not available');
          }
        } catch (error) {
          console.warn('[SERVICE_INIT] ❌ Could not get vectorStore/embeddingService from plugin:', error);
        }

        // Initialize with direct ChromaDB access (HNSW completely removed)
        console.log('[SERVICE_INIT] 🔧 Creating HybridSearchService with ChromaDB-only configuration...');
        this.services.hybridSearchService = new HybridSearchService(vectorStore, embeddingService);
        
        const semanticAvailable = this.services.hybridSearchService.isSemanticSearchAvailable();
        console.log('[SERVICE_INIT] ✅ HybridSearchService initialized:');
        console.log('[SERVICE_INIT] - ChromaDB vectorStore:', !!vectorStore ? '✅' : '❌');
        console.log('[SERVICE_INIT] - EmbeddingService:', !!embeddingService ? '✅' : '❌');
        console.log('[SERVICE_INIT] - Semantic search available:', semanticAvailable ? '✅' : '❌');
        console.log('[SERVICE_INIT] - Search modes: Keyword ✅, Fuzzy ✅, Semantic', semanticAvailable ? '✅' : '❌');
      } else {
        console.log('[SERVICE_INIT] ✅ HybridSearchService already initialized');
      }
    } catch (error) {
      console.error('[SERVICE_INIT] ❌ Failed to initialize HybridSearchService:', error);
    }
  }

  /**
   * Get service availability
   */
  getServiceAvailability(): ServiceAvailability {
    return {
      metadataSearch: !!this.services.metadataSearchService,
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
      // HNSW service removed
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

      // ChromaDB indexes are automatically populated through the vector store - no explicit action needed

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
      // ChromaDB semantic search status now handled through hybrid search service

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