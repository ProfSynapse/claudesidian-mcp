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
  BatchContentMode
} from './modes';
import { AgentManager } from '../../services/AgentManager';

/**
 * Agent for content operations in the vault
 * Consolidates functionality from noteEditor and noteReader
 */
export class ContentManagerAgent extends BaseAgent {
  private app: App;
  protected agentManager: AgentManager;

  /**
   * Create a new ContentManagerAgent
   * @param app Obsidian app instance
   * @param agentManager Agent manager for cross-agent operations
   */
  constructor(app: App, agentManager: AgentManager) {
    super(
      ContentManagerConfig.name,
      ContentManagerConfig.description,
      ContentManagerConfig.version
    );
    
    this.app = app;
    this.agentManager = agentManager;
    
    // Register modes
    this.registerMode(new ReadContentMode(app));
    this.registerMode(new CreateContentMode(app));
    this.registerMode(new AppendContentMode(app));
    this.registerMode(new PrependContentMode(app));
    this.registerMode(new ReplaceContentMode(app));
    this.registerMode(new ReplaceByLineMode(app));
    this.registerMode(new DeleteContentMode(app));
    this.registerMode(new BatchContentMode(app));
    
    // Set agent manager reference for handoff capability
    this.setAgentManager(agentManager);
  }
}