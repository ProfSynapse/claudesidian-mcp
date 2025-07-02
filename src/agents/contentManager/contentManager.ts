import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { ContentManagerConfig } from './config';
import {
  ReadContentMode,
  CreateContentMode,
  AppendContentMode,
  PrependContentMode,
  ReplaceContentMode,
  ReplaceByLineMode,
  DeleteContentMode,
  FindReplaceContentMode,
  BatchContentMode
} from './modes';
// import { AgentManager } from '../../services/AgentManager';
import ClaudesidianPlugin from '../../main';
import { WorkspaceService } from '../../database/services/WorkspaceService';
import { MemoryService } from '../../database/services/MemoryService';

/**
 * Agent for content operations in the vault
 * Consolidates functionality from noteEditor and noteReader
 * Embedding updates are handled automatically by FileEventManager
 */
export class ContentManagerAgent extends BaseAgent {
  protected app: App;
  protected plugin: ClaudesidianPlugin | null = null;
  
  // ChromaDB services
  private workspaceService: WorkspaceService | null = null;
  private memoryService: MemoryService | null = null;

  /**
   * Create a new ContentManagerAgent
   * @param app Obsidian app instance
   * @param plugin Claudesidian plugin instance
   */
  constructor(app: App, plugin?: ClaudesidianPlugin) {
    super(
      ContentManagerConfig.name,
      ContentManagerConfig.description,
      ContentManagerConfig.version
    );
    
    this.app = app;
    
    // Store plugin reference if provided
    if (plugin) {
      this.plugin = plugin;
      
      // Get ChromaDB services if available
      if (plugin.services) {
        
        if (plugin.services.workspaceService) {
          this.workspaceService = plugin.services.workspaceService;
        }
        
        if (plugin.services.memoryService) {
          this.memoryService = plugin.services.memoryService;
        }
      }
    }
    
    // Register modes with access to ChromaDB services
    this.registerMode(new ReadContentMode(app, this.memoryService));
    this.registerMode(new CreateContentMode(app));
    this.registerMode(new AppendContentMode(app));
    this.registerMode(new PrependContentMode(app));
    this.registerMode(new ReplaceContentMode(app));
    this.registerMode(new ReplaceByLineMode(app));
    this.registerMode(new DeleteContentMode(app));
    this.registerMode(new FindReplaceContentMode(app));
    this.registerMode(new BatchContentMode(app, this.memoryService));
  }
  
  
  /**
   * Gets the ChromaDB workspace service
   * @returns WorkspaceService instance or null
   */
  public getWorkspaceService(): WorkspaceService | null {
    return this.workspaceService;
  }
  
  /**
   * Gets the ChromaDB memory service
   * @returns MemoryService instance or null
   */
  public getMemoryService(): MemoryService | null {
    return this.memoryService;
  }
  
}