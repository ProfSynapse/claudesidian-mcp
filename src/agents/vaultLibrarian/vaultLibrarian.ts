import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { VaultLibrarianConfig } from './config';
import {
  SearchMode,
  VectorMode,
  BatchMode
} from './modes';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';
import { VectorStoreFactory } from '../../database/factory/VectorStoreFactory';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { MemoryService } from '../../database/services/MemoryService';
import { ChromaSearchService } from '../../database/services/ChromaSearchService';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Agent for searching and navigating the vault
 */
export class VaultLibrarianAgent extends BaseAgent {
  public app: App;
  private embeddingProvider: any | null = null;
  private embeddingService: EmbeddingService | null = null;
  private memoryService: MemoryService | null = null;
  private searchService: ChromaSearchService | null = null;
  private settings: MemorySettings;
  
  /**
   * Create a new VaultLibrarianAgent
   * @param app Obsidian app instance
   * @param enableVectorModes Whether to enable vector-based modes (requires memory/embeddings)
   */
  constructor(app: App, enableVectorModes: boolean = false) {
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
    try {
      if (app.plugins) {
        const plugin = app.plugins.getPlugin('claudesidian-mcp');
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
            
            if (services.searchService) {
              this.searchService = services.searchService;
            }
          }
        }
      }
    } catch (error) {
      console.error("Error initializing services:", getErrorMessage(error));
      this.embeddingProvider = null;
    }
    
    // Always register SearchMode (no vector database dependency)
    this.registerMode(new SearchMode(app));
    
    // Conditionally register vector-dependent modes
    if (enableVectorModes) {
      console.log('Registering vector-dependent modes for VaultLibrarian');
      this.registerMode(new BatchMode(
        app, 
        this.memoryService, 
        this.searchService, 
        this.embeddingService
      ));
      
      this.registerMode(new VectorMode(
        app, 
        this.memoryService, 
        this.searchService, 
        this.embeddingService
      ));
    } else {
      console.log('Skipping vector-dependent modes for VaultLibrarian (memory disabled)');
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
    const currentProvider = settings.providerSettings[settings.apiProvider];
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
    
    // Ensure we have our search service initialized
    await this.initializeSearchService();
  }
  
  /**
   * Initialize the search service if it doesn't have a vector store
   */
  async initializeSearchService(): Promise<void> {
    if (!this.searchService) {
      console.warn('Search service not available in VaultLibrarian');
      return;
    }
    
    // Try to connect the vector store from the plugin if needed
    if (!this.searchService.vectorStore) {
      try {
        console.log('Attempting to get vector store from plugin');
        const plugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
        if (plugin && plugin.vectorStore) {
          console.log('Found vector store in plugin, connecting to search service');
          // Set the vector store property (public in ChromaSearchService)
          this.searchService.vectorStore = plugin.vectorStore;
          
          // Initialize collections if needed
          try {
            await this.searchService.initialize();
            console.log('Successfully initialized search service with plugin vector store');
          } catch (initError) {
            console.error('Error initializing search service collections:', initError);
          }
        } else {
          console.warn('Plugin or vector store not found on plugin');
        }
      } catch (error) {
        console.error('Error connecting vector store to search service:', error);
      }
    }
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