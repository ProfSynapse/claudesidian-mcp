import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { DeleteFolderArgs, DeleteFolderResult } from '../types';
import { FileOperations } from '../utils/FileOperations';

/**
 * Tool for deleting a folder
 */
export class DeleteFolderTool extends BaseTool<DeleteFolderArgs, DeleteFolderResult> {
  private app: App;
  
  /**
   * Create a new DeleteFolderTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'deleteFolder',
      'Delete a folder',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the result of deleting the folder
   */
  async execute(args: DeleteFolderArgs): Promise<DeleteFolderResult> {
    const { path, recursive } = args;
    
    try {
      await FileOperations.deleteFolder(this.app, path, recursive);
      
      return {
        path,
        success: true
      };
    } catch (error) {
      console.error('Failed to delete folder:', error);
      
      return {
        path,
        success: false,
        error: error.message
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
        recursive: {
          type: 'boolean',
          description: 'Whether to delete recursively'
        }
      },
      required: ['path'],
      description: 'Delete a folder'
    };
  }
}