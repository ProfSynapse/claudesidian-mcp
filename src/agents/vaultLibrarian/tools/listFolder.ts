import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { ListFolderArgs, ListFolderResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Tool for listing files and folders in a folder
 */
export class ListFolderTool extends BaseTool<ListFolderArgs, ListFolderResult> {
  private app: App;
  
  /**
   * Create a new ListFolderTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listFolder',
      'List files and folders in a folder',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the list of files and folders
   */
  async execute(args: ListFolderArgs): Promise<ListFolderResult> {
    const { path, includeFiles = true, includeFolders = true, includeHidden = false } = args;
    
    try {
      const result = SearchOperations.listFolder(
        this.app,
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
      console.error('Failed to list folder:', error);
      
      return {
        path,
        files: [],
        folders: []
      };
    }
  }
  
  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any {
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