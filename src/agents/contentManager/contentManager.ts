import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { ContentManagerConfig } from '../../config/agents';
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
import NexusPlugin from '../../main';
import { WorkspaceService } from '../../services/WorkspaceService';
import { MemoryService } from '../memoryManager/services/MemoryService';

/**
 * Agent for content operations in the vault
 * Consolidates functionality from noteEditor and noteReader
 */
export class ContentManagerAgent extends BaseAgent {
  protected app: App;
  protected plugin: NexusPlugin | null = null;
  
  private workspaceService: WorkspaceService | null = null;
  private memoryService: MemoryService | null = null;

  /**
   * Create a new ContentManagerAgent
   * @param app Obsidian app instance
 * @param plugin Nexus plugin instance
   * @param memoryService Optional injected memory service
   * @param workspaceService Optional injected workspace service
   */
  constructor(
    app: App,
    plugin?: NexusPlugin,
    memoryService?: MemoryService | null,
    workspaceService?: WorkspaceService | null
  ) {
    super(
      ContentManagerConfig.name,
      ContentManagerConfig.description,
      ContentManagerConfig.version
    );

    this.app = app;
    this.plugin = plugin || null;

    // Use injected services if provided, otherwise fall back to plugin services
    if (memoryService) {
      this.memoryService = memoryService;
    } else if (plugin?.services?.memoryService) {
        this.memoryService = plugin.services.memoryService;
    }

    if (workspaceService) {
      this.workspaceService = workspaceService;
    } else if (plugin?.services?.workspaceService) {
      this.workspaceService = plugin.services.workspaceService;
    }
    
    // Register modes with access to memory services
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
   * Gets the workspace service
   * @returns WorkspaceService instance or null
   */
  public getWorkspaceService(): WorkspaceService | null {
    return this.workspaceService;
  }
  
  /**
   * Gets the memory service
   * @returns MemoryService instance or null
   */
  public getMemoryService(): MemoryService | null {
    return this.memoryService;
  }
  
}
