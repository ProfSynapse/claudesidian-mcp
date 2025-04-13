import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { VaultManagerConfig } from './config';
import {
  CreateNoteMode,
  CreateFolderMode,
  DeleteNoteMode,
  DeleteFolderMode,
  MoveNoteMode,
  MoveFolderMode
} from './modes';

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
    
    // Register modes
    this.registerMode(new CreateNoteMode(app));
    this.registerMode(new CreateFolderMode(app));
    this.registerMode(new DeleteNoteMode(app));
    this.registerMode(new DeleteFolderMode(app));
    this.registerMode(new MoveNoteMode(app));
    this.registerMode(new MoveFolderMode(app));
  }
}