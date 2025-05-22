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
import { AgentManager } from '../../services/AgentManager';
import ClaudesidianPlugin from '../../main';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { WorkspaceService } from '../../database/services/WorkspaceService';
import { MemoryService } from '../../database/services/MemoryService';
import { ChromaSearchService } from '../../database/services/ChromaSearchService';

/**
 * Agent for content operations in the vault
 * Consolidates functionality from noteEditor and noteReader
 */
export class ContentManagerAgent extends BaseAgent {
  protected app: App;
  protected agentManager: AgentManager;
  protected plugin: ClaudesidianPlugin | null = null;
  
  // ChromaDB services
  private embeddingService: EmbeddingService | null = null;
  private workspaceService: WorkspaceService | null = null;
  private memoryService: MemoryService | null = null;
  private searchService: ChromaSearchService | null = null;

  /**
   * Create a new ContentManagerAgent
   * @param app Obsidian app instance
   * @param agentManager Agent manager for cross-agent operations
   * @param plugin Claudesidian plugin instance
   */
  constructor(app: App, agentManager: AgentManager, plugin?: ClaudesidianPlugin) {
    super(
      ContentManagerConfig.name,
      ContentManagerConfig.description,
      ContentManagerConfig.version
    );
    
    this.app = app;
    this.agentManager = agentManager;
    
    // Store plugin reference if provided
    if (plugin) {
      this.plugin = plugin;
      
      // Get ChromaDB services if available
      if (plugin.services) {
        if (plugin.services.embeddingService) {
          this.embeddingService = plugin.services.embeddingService;
        }
        
        if (plugin.services.workspaceService) {
          this.workspaceService = plugin.services.workspaceService;
        }
        
        if (plugin.services.memoryService) {
          this.memoryService = plugin.services.memoryService;
        }
        
        if (plugin.services.searchService) {
          this.searchService = plugin.services.searchService;
        }
      }
    }
    
    // Register modes with access to ChromaDB services
    this.registerMode(new ReadContentMode(app, this.memoryService));
    this.registerMode(new CreateContentMode(app, this.embeddingService, this.searchService));
    this.registerMode(new AppendContentMode(app, this.embeddingService, this.searchService));
    this.registerMode(new PrependContentMode(app, this.embeddingService, this.searchService));
    this.registerMode(new ReplaceContentMode(app, this.embeddingService, this.searchService));
    this.registerMode(new ReplaceByLineMode(app, this.embeddingService, this.searchService));
    this.registerMode(new DeleteContentMode(app, this.embeddingService, this.searchService));
    this.registerMode(new FindReplaceContentMode(app, this.embeddingService, this.searchService));
    this.registerMode(new BatchContentMode(app, this.embeddingService, this.searchService, this.memoryService));
    
    // Set agent manager reference for handoff capability
    this.setAgentManager(agentManager);
  }
  
  /**
   * Gets the ChromaDB embedding service
   * @returns EmbeddingService instance or null
   */
  public getEmbeddingService(): EmbeddingService | null {
    return this.embeddingService;
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
  
  /**
   * Gets the ChromaDB search service
   * @returns ChromaSearchService instance or null
   */
  public getSearchService(): ChromaSearchService | null {
    return this.searchService;
  }
}