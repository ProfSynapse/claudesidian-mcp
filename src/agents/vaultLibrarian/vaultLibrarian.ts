import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { VaultLibrarianConfig } from './config';
import {
  SearchMode,
  SearchFilesMode,
  SearchFoldersMode,
  SearchMemoryMode,
  BatchMode
} from './modes';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';
import { VectorStoreFactory } from '../../database/factory/VectorStoreFactory';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { MemoryService } from '../../database/services/MemoryService';
import { HnswSearchService } from '../../database/services/hnsw/HnswSearchService';
import { WorkspaceService } from '../../database/services/WorkspaceService';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Agent for searching and navigating the vault
 * Updated to use HnswSearchService for semantic search
 */
export class VaultLibrarianAgent extends BaseAgent {
  public app: App;
  private embeddingProvider: any | null = null;
  private embeddingService: EmbeddingService | null = null;
  private memoryService: MemoryService | null = null;
  private hnswSearchService: HnswSearchService | null = null;
  private workspaceService: WorkspaceService | null = null;
  private settings: MemorySettings;
  
  /**
   * Create a new VaultLibrarianAgent
   * @param app Obsidian app instance
   * @param enableVectorModes Whether to enable vector-based modes (requires memory/embeddings)
   */
  constructor(app: App, enableVectorModes = false) {
    super(
      VaultLibrarianConfig.name,
      VaultLibrarianConfig.description,
      VaultLibrarianConfig.version
    );
    
    this.app = app;
    
    // Initialize with default settings
    this.settings = { ...DEFAULT_MEMORY_SETTINGS };
    
    // Override some settings for the vault librarian specifically
    this.settings.embeddingsEnabled = false; // Disable by default until API key is provided
    
    // Define plugin using safe type check
    let plugin: any = null;
    try {
      if (app.plugins) {
        plugin = app.plugins.getPlugin('claudesidian-mcp');
        if (plugin) {
          // Plugin instance found
          // Safely access settings
          const pluginAny = plugin as any;
          const memorySettings = pluginAny.settings?.settings?.memory;
          if (memorySettings?.embeddingsEnabled) {
            const currentProvider = memorySettings.providerSettings[memorySettings.apiProvider];
            if (currentProvider?.apiKey) {
              this.settings = memorySettings;
              // Provider will be initialized in updateSettings if needed
            }
          }
          
          // Safely access services
          const services = pluginAny.services;
          if (services) {
            // Access services safely
            if (services.embeddingService) {
              this.embeddingService = services.embeddingService;
            }
            
            
            if (services.memoryService) {
              this.memoryService = services.memoryService;
            }
            
            if (services.hnswSearchService) {
              this.hnswSearchService = services.hnswSearchService;
            }
            
            if (services.workspaceService) {
              this.workspaceService = services.workspaceService;
            }
          }
        }
      }
    } catch (error) {
      console.error("Error initializing services:", getErrorMessage(error));
      this.embeddingProvider = null;
    }
    
    // Always register SearchMode (universal search with intelligent fallbacks)
    this.registerMode(new SearchMode(
      plugin || ({ app } as any), // Fallback to minimal plugin interface if not found
      this.hnswSearchService || undefined,
      this.embeddingService || undefined, 
      this.memoryService || undefined,
      this.workspaceService || undefined
    ));
    
    // Register specific search modes
    this.registerMode(new SearchFilesMode(
      plugin || ({ app } as any),
      this.hnswSearchService || undefined,
      this.embeddingService || undefined, 
      this.memoryService || undefined,
      this.workspaceService || undefined
    ));
    
    this.registerMode(new SearchFoldersMode(
      plugin || ({ app } as any),
      this.hnswSearchService || undefined,
      this.embeddingService || undefined, 
      this.memoryService || undefined,
      this.workspaceService || undefined
    ));
    
    this.registerMode(new SearchMemoryMode(
      plugin || ({ app } as any),
      this.memoryService || undefined,
      this.workspaceService || undefined,
      this.embeddingService || undefined
    ));
    
    // Always register BatchMode (supports both semantic and non-semantic users)
    this.registerMode(new BatchMode(
      plugin || ({ app } as any), // Fallback to minimal plugin interface if not found
      this.hnswSearchService || undefined,
      this.embeddingService || undefined,
      this.memoryService || undefined,
      this.workspaceService || undefined
    ));
    
    if (enableVectorModes) {
    } else {
      console.log('VaultLibrarian initialized with traditional search (memory disabled)');
    }
    
  }
  
  /**
   * Get the embedding provider
   * @returns The current embedding provider or null if embeddings are disabled
   */
  getProvider(): any | null {
    return this.embeddingProvider;
  }
  
  /**
   * Update the agent settings
   * @param settings New memory settings
   */
  async updateSettings(settings: MemorySettings): Promise<void> {
    this.settings = settings;
    
    // Clean up existing provider
    if (this.embeddingProvider && typeof (this.embeddingProvider as any).close === 'function') {
      (this.embeddingProvider as any).close();
      this.embeddingProvider = null;
    }
    
    // Create new provider if enabled
    const currentProvider = settings.providerSettings?.[settings.apiProvider];
    if (settings.embeddingsEnabled && currentProvider?.apiKey) {
      try {
        // Use VectorStoreFactory to create provider with new architecture
        this.embeddingProvider = await VectorStoreFactory.createEmbeddingProvider(settings);
      } catch (error) {
        console.error('Error initializing embedding provider:', getErrorMessage(error));
        this.embeddingProvider = null;
      }
    }
  }
  
  /**
   * Initialize the VaultLibrarianAgent
   * This is called after the agent is registered with the agent manager
   */
  async initialize(): Promise<void> {
    await super.initialize();
    
    // Initialize search service - HNSW will be available since agents load after services
    await this.initializeSearchService();
  }
  
  /**
   * Initialize the search service
   * HNSW service should be available since agents load after services in background
   */
  async initializeSearchService(): Promise<void> {
    // If we already have the service, we're done
    if (this.hnswSearchService) {
      console.log('HNSW search service already available in VaultLibrarian');
      return;
    }

    // Try to get the HNSW service from the service manager
    try {
      const plugin = this.app.plugins.getPlugin('claudesidian-mcp') as any;
      if (plugin?.serviceManager) {
        this.hnswSearchService = await plugin.serviceManager.get('hnswSearchService');
        console.log('✅ Successfully loaded HNSW search service in VaultLibrarian');
        return;
      }
    } catch (error) {
      console.warn('Failed to load HNSW search service:', error);
    }

    console.warn('⚠️  Semantic search service not available in VaultLibrarian');
  }
  
  /**
   * Clean up resources when the agent is unloaded
   */
  onunload(): void {
    try {
      // Clean up embedding provider
      if (this.embeddingProvider && typeof (this.embeddingProvider as any).close === 'function') {
        (this.embeddingProvider as any).close();
        this.embeddingProvider = null;
      }
      
      // Call parent class onunload if it exists
      super.onunload?.();
      
      console.log('VaultLibrarian agent unloaded successfully');
    } catch (error) {
      console.error('Error unloading VaultLibrarian agent:', getErrorMessage(error));
    }
  }
}