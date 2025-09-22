import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { VaultLibrarianConfig } from '../../config/agents';
import {
  SearchContentMode,
  SearchDirectoryMode,
  SearchMemoryMode,
  BatchMode
} from './modes';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';
import { MemoryService } from "../memoryManager/services/MemoryService";
import { WorkspaceService } from "../memoryManager/services/WorkspaceService";
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Agent for searching and navigating the vault
 * Provides comprehensive search capabilities across vault content
 */
export class VaultLibrarianAgent extends BaseAgent {
  public app: App;
  private memoryService: MemoryService | null = null;
  private workspaceService: WorkspaceService | null = null;
  private settings: MemorySettings;
  
  /**
   * Create a new VaultLibrarianAgent
   * @param app Obsidian app instance
   * @param enableVectorModes Whether to enable vector-based modes (legacy parameter)
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
          if (memorySettings) {
            this.settings = memorySettings;
          }
          
          // Access services from ServiceContainer (new pattern)
          try {
            // Use ServiceContainer getIfReady to avoid waiting for initialization
            if (pluginAny.serviceContainer) {
              this.memoryService = pluginAny.serviceContainer.getIfReady('memoryService');
              this.workspaceService = pluginAny.serviceContainer.getIfReady('workspaceService');
                        }
          } catch (error) {
            console.warn('[VaultLibrarian] Failed to access services:', error);
          }
        }
      }
    } catch (error) {
      console.warn('[VaultLibrarian] Failed to access plugin services:', error);
    }
    
    // Register ContentSearchMode (fuzzy + keyword search using native Obsidian APIs)
    this.registerMode(new SearchContentMode(
      plugin || ({ app } as any) // Fallback to minimal plugin interface if not found
    ));
    
    // Register focused search modes with enhanced validation and service integration
    this.registerMode(new SearchDirectoryMode(
      plugin || ({ app } as any),
      this.workspaceService || undefined
    ));
    
    
    this.registerMode(new SearchMemoryMode(
      plugin || ({ app } as any),
      this.memoryService || undefined,
      this.workspaceService || undefined
    ));
    
    // Always register BatchMode (supports both semantic and non-semantic users)
    this.registerMode(new BatchMode(
      plugin || ({ app } as any), // Fallback to minimal plugin interface if not found
      this.memoryService || undefined,
      this.workspaceService || undefined
    ));
    
    
  }
  
  
  /**
   * Update the agent settings
   * @param settings New memory settings
   */
  async updateSettings(settings: MemorySettings): Promise<void> {
    this.settings = settings;
  }
  
  /**
   * Initialize the VaultLibrarianAgent
   * This is called after the agent is registered with the agent manager
   */
  async initialize(): Promise<void> {
    await super.initialize();
    
    // Initialize search service in background - non-blocking
    this.initializeSearchService().catch(error => {
    });
  }
  
  /**
   * Initialize the search service
   */
  async initializeSearchService(): Promise<void> {
    // Search service initialization for JSON-based storage
  }

  
  /**
   * Clean up resources when the agent is unloaded
   */
  onunload(): void {
    try {
      // Call parent class onunload if it exists
      super.onunload?.();
    } catch (error) {
    }
  }
}