import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { VaultManagerConfig } from './config';
import { 
  ListFilesMode, 
  ListFoldersMode, 
  CreateFolderMode, 
  EditFolderMode,
  DeleteFolderMode,
  MoveFileMode,
  MoveFolderMode
} from './modes';

/**
 * Agent for file system operations in the Obsidian vault
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
    this.registerMode(new ListFilesMode(app));
    this.registerMode(new ListFoldersMode(app));
    this.registerMode(new CreateFolderMode(app));
    this.registerMode(new EditFolderMode(app));
    this.registerMode(new DeleteFolderMode(app));
    this.registerMode(new MoveFileMode(app));
    this.registerMode(new MoveFolderMode(app));
  }
}
