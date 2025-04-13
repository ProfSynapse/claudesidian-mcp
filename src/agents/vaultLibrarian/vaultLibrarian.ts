import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { VaultLibrarianConfig } from './config';
import {
  SearchContentMode,
  SearchTagMode,
  SearchPropertyMode,
  ListFolderMode,
  ListNoteMode,
  ListTagMode,
  ListPropertiesMode,
  ListRecursiveMode
} from './modes';

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
    
    // Register modes
    this.registerMode(new SearchContentMode(app));
    this.registerMode(new SearchTagMode(app));
    this.registerMode(new SearchPropertyMode(app));
    this.registerMode(new ListFolderMode(app));
    this.registerMode(new ListNoteMode(app));
    this.registerMode(new ListTagMode(app));
    this.registerMode(new ListPropertiesMode(app));
    this.registerMode(new ListRecursiveMode(app));
  }
}