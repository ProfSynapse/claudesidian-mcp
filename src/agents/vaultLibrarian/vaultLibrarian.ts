import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { VaultLibrarianConfig } from './config';
import {
  SearchContentTool,
  SearchTagTool,
  SearchPropertyTool,
  ListFolderTool,
  ListNoteTool,
  ListTagTool,
  ListPropertiesTool
} from './tools';

/**
 * Agent for searching and navigating the vault
 */
export class VaultLibrarianAgent extends BaseAgent {
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
    
    // Register tools
    this.registerTool(new SearchContentTool(app));
    this.registerTool(new SearchTagTool(app));
    this.registerTool(new SearchPropertyTool(app));
    this.registerTool(new ListFolderTool(app));
    this.registerTool(new ListNoteTool(app));
    this.registerTool(new ListTagTool(app));
    this.registerTool(new ListPropertiesTool(app));
  }
}