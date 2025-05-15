import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ListFolderArgs, ListFolderResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Mode for listing files and folders in a folder
 */
export class ListFolderMode extends BaseMode<ListFolderArgs, ListFolderResult> {
  private app: App;
  
  /**
   * Create a new ListFolderMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listFolder',
      'List Folder',
      'List files and folders in a folder',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the list of files and folders
   */
  async execute(params: ListFolderArgs): Promise<ListFolderResult> {
    const { path, includeFiles = true, includeFolders = true, includeHidden = false } = params;
    
    try {
      const result = SearchOperations.listFolder(
        this.app,
        path,
        includeFiles,
        includeFolders,
        includeHidden
      );
      
      return {
        success: true,
        path,
        files: result.files,
        folders: result.folders
      };
    } catch (error) {
      console.error('Failed to list folder:', error);
      
      return {
        success: false,
        path,
        files: [],
        folders: []
      };
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
          description: 'Path to the folder'
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
      description: 'List files and folders in a folder'
    };
  }
}