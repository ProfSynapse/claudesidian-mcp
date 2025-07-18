import { App, TFile, TFolder } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { VaultManagerConfig } from './config';
import { 
  ListDirectoryMode, 
  CreateFolderMode, 
  EditFolderMode,
  DeleteFolderMode,
  MoveFolderMode,
  DuplicateNoteMode,
  OpenNoteMode
} from './modes';
import { MoveNoteMode } from './modes/moveNoteMode';
import { sanitizeVaultName } from '../../utils/vaultUtils';

/**
 * Agent for file system operations in the Obsidian vault
 */
export class VaultManagerAgent extends BaseAgent {
  private app: App;
  private vaultName: string;
  private isGettingDescription = false;

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
    
    this.app = app;
    this.vaultName = sanitizeVaultName(app.vault.getName());
    
    // Register modes
    this.registerMode(new ListDirectoryMode(app));
    this.registerMode(new CreateFolderMode(app));
    this.registerMode(new EditFolderMode(app));
    this.registerMode(new DeleteFolderMode(app));
    this.registerMode(new MoveNoteMode(app));
    this.registerMode(new MoveFolderMode(app));
    this.registerMode(new DuplicateNoteMode(app));
    this.registerMode(new OpenNoteMode(app));
  }

  /**
   * Dynamic description that includes current vault structure
   */
  get description(): string {
    const baseDescription = VaultManagerConfig.description;
    
    // Prevent infinite recursion
    if (this.isGettingDescription) {
      return `[${this.vaultName}] ${baseDescription}`;
    }
    
    this.isGettingDescription = true;
    try {
      const vaultContext = this.getVaultStructureSummary();
      return `[${this.vaultName}] ${baseDescription}\n\n${vaultContext}`;
    } finally {
      this.isGettingDescription = false;
    }
  }

  /**
   * Get a summary of the vault structure
   * @returns Formatted string with vault structure information
   * @private
   */
  private getVaultStructureSummary(): string {
    try {
      const markdownFiles = this.app.vault.getMarkdownFiles();
      const rootFolder = this.app.vault.getRoot();
      
      // Get root folders (folders directly in vault root)
      const rootFolders = rootFolder.children
        .filter(child => child instanceof TFolder)
        .map(folder => folder.name)
        .sort(); // Sort alphabetically for consistent display

      // Count files in each root folder
      const folderStructure: string[] = [];

      for (const folderName of rootFolders) {
        const filesInFolder = markdownFiles.filter(file => 
          file.path.startsWith(folderName + '/')
        ).length;
        folderStructure.push(`   └── ${folderName}/ (${filesInFolder} files)`);
      }

      // Count files in root
      const rootFiles = markdownFiles.filter(file => 
        !file.path.includes('/')
      ).length;

      const summary = [
        `📁 Vault Structure: ${markdownFiles.length} files, ${rootFolders.length} root folders`
      ];

      if (rootFiles > 0) {
        summary.push(`   └── / (${rootFiles} files in root)`);
      }

      summary.push(...folderStructure);

      return summary.join('\n');
    } catch (error) {
      return `📁 Vault Structure: Unable to load vault information (${error})`;
    }
  }
}
