import { App, TFile, TFolder } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ListRecursiveArgs, ListRecursiveResult } from '../types';

/**
 * Mode for recursively listing files and folders in a folder and its subfolders
 */
export class ListRecursiveMode extends BaseMode<ListRecursiveArgs, ListRecursiveResult> {
  private app: App;
  
  /**
   * Create a new ListRecursiveMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listRecursive',
      'List Recursive',
      'Recursively list files and folders in a folder and its subfolders',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the list of files and folders
   */
  async execute(params: ListRecursiveArgs): Promise<ListRecursiveResult> {
    const { path, includeFiles = true, includeFolders = true, includeHidden = false } = params;
    
    try {
      const result = this.listFolderRecursive(
        path,
        includeFiles,
        includeFolders,
        includeHidden
      );
      
      return {
        path,
        files: result.files,
        folders: result.folders
      };
    } catch (error) {
      console.error('Failed to list folder recursively:', error);
      
      return {
        path,
        files: [],
        folders: []
      };
    }
  }
  
  /**
   * Recursively list files and folders in a folder
   * @param path Path to the folder
   * @param includeFiles Whether to include files
   * @param includeFolders Whether to include folders
   * @param includeHidden Whether to include hidden files
   * @returns Object with files and folders
   */
  private listFolderRecursive(
    path: string,
    includeFiles: boolean,
    includeFolders: boolean,
    includeHidden: boolean
  ): { files: string[]; folders: string[] } {
    const files: string[] = [];
    const folders: string[] = [];
    
    // Get the folder
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!folder || !(folder instanceof TFolder)) {
      return { files, folders };
    }
    
    // Add the current folder to the list if includeFolders is true
    if (includeFolders) {
      folders.push(folder.path);
    }
    
    // Process each child
    this.processFolder(folder, files, folders, includeFiles, includeFolders, includeHidden);
    
    return { files, folders };
  }
  
  /**
   * Process a folder and its children recursively
   * @param folder Folder to process
   * @param files Array to add files to
   * @param folders Array to add folders to
   * @param includeFiles Whether to include files
   * @param includeFolders Whether to include folders
   * @param includeHidden Whether to include hidden files
   */
  private processFolder(
    folder: TFolder,
    files: string[],
    folders: string[],
    includeFiles: boolean,
    includeFolders: boolean,
    includeHidden: boolean
  ): void {
    for (const child of folder.children) {
      // Skip hidden files
      if (!includeHidden && child.name.startsWith('.')) {
        continue;
      }
      
      if (child instanceof TFile && includeFiles) {
        files.push(child.path);
      } else if (child instanceof TFolder) {
        // Add the folder to the list if includeFolders is true
        if (includeFolders) {
          folders.push(child.path);
        }
        
        // Recursively process the subfolder
        this.processFolder(child, files, folders, includeFiles, includeFolders, includeHidden);
      }
    }
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the folder. Use an empty string "" or "/" to access the root folder. Do not use "."'
        },
        includeFiles: {
          type: 'boolean',
          description: 'Whether to include files (default: true)'
        },
        includeFolders: {
          type: 'boolean',
          description: 'Whether to include folders (default: true)'
        },
        includeHidden: {
          type: 'boolean',
          description: 'Whether to include hidden files (default: false)'
        }
      },
      required: ['path'],
      description: 'Recursively list files and folders in a folder and its subfolders'
    };
  }
}