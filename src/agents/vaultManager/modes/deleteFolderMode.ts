import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { DeleteFolderArgs, DeleteFolderResult } from '../types';
import { FileOperations } from '../utils/FileOperations';

/**
 * Mode for deleting a folder
 */
export class DeleteFolderMode extends BaseMode<DeleteFolderArgs, DeleteFolderResult> {
  private app: App;
  
  /**
   * Create a new DeleteFolderMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'deleteFolder',
      'Delete Folder',
      'Delete a folder',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of deleting the folder
   */
  async execute(params: DeleteFolderArgs): Promise<DeleteFolderResult> {
    const { path, recursive } = params;
    
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