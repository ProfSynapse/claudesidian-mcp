import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { VaultManagerConfig } from './config';
import {
  CreateNoteTool,
  CreateFolderTool,
  DeleteNoteTool,
  DeleteFolderTool,
  MoveNoteTool,
  MoveFolderTool
} from './tools';

/**
 * Agent for managing files and folders in the vault
 */
export class VaultManagerAgent extends BaseAgent {
  /**
   * Create a new VaultManagerAgent
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      VaultManagerConfig.name,
      VaultManagerConfig.description,
      VaultManagerConfig.version
    );
    
    // Register tools
    this.registerTool(new CreateNoteTool(app));
    this.registerTool(new CreateFolderTool(app));
    this.registerTool(new DeleteNoteTool(app));
    this.registerTool(new DeleteFolderTool(app));
    this.registerTool(new MoveNoteTool(app));
    this.registerTool(new MoveFolderTool(app));
  }
}