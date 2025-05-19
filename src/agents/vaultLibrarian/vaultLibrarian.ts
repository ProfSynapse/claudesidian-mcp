import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { VaultLibrarianConfig } from './config';
import {
  SearchMode,
  VectorMode,
  BatchMode
} from './modes';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';
import { OpenAIProvider } from '../../database/providers/openai-provider';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { MemoryService } from '../../database/services/MemoryService';
import { ChromaSearchService } from '../../database/services/ChromaSearchService';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Agent for searching and navigating the vault
 */
export class VaultLibrarianAgent extends BaseAgent {
  public app: App;
  private embeddingProvider: OpenAIProvider | null = null;
  private embeddingService: EmbeddingService | null = null;
  private memoryService: MemoryService | null = null;
  private searchService: ChromaSearchService | null = null;
  private settings: MemorySettings;
  
  /**
   * Create a new VaultLibrarianAgent
   * @param app Obsidian app instance
   */
  constructor(app: App) {
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
          if (memorySettings?.embeddingsEnabled && memorySettings.openaiApiKey) {
            this.settings = memorySettings;
            this.embeddingProvider = new OpenAIProvider(this.settings);
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
    
    // Register all modes - only vector mode requires embeddings to be enabled
    this.registerMode(new SearchMode(app));
    this.registerMode(new BatchMode(
      app, 
      this.memoryService, 
      this.searchService, 
      this.embeddingService
    ));
    
    // Add vector mode - this mode depends on embeddings but will handle disabled state gracefully
    this.registerMode(new VectorMode(
      app, 
      this.memoryService, 
      this.searchService, 
      this.embeddingService
    ));
    
  }
  
  /**
   * Get the embedding provider
   * @returns The current embedding provider or null if embeddings are disabled
   */
  getProvider(): OpenAIProvider | null {
    return this.embeddingProvider;
  }
  
  /**
   * Update the agent settings
   * @param settings New memory settings
   */
  updateSettings(settings: MemorySettings): void {
    this.settings = settings;
    
    // Clean up existing provider
    if (this.embeddingProvider && typeof (this.embeddingProvider as any).close === 'function') {
      (this.embeddingProvider as any).close();
      this.embeddingProvider = null;
    }
    
    // Create new provider if enabled
    if (settings.embeddingsEnabled && settings.openaiApiKey) {
      try {
        this.embeddingProvider = new OpenAIProvider(settings);
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
    // No additional initialization needed - all ChromaDB services are initialized elsewhere
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