import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { MoveFolderArgs, MoveFolderResult } from '../types';
import { FileOperations } from '../utils/FileOperations';

/**
 * Mode for moving a folder
 */
export class MoveFolderMode extends BaseMode<MoveFolderArgs, MoveFolderResult> {
  private app: App;
  
  /**
   * Create a new MoveFolderMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'moveFolder',
      'Move Folder',
      'Move a folder to a new location',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of moving the folder
   */
  async execute(params: MoveFolderArgs): Promise<MoveFolderResult> {
    const { path, newPath, overwrite } = params;
    
    try {
      await FileOperations.moveFolder(this.app, path, newPath, overwrite);
      
      return {
        path,
        newPath,
        success: true
      };
    } catch (error) {
      console.error('Failed to move folder:', error);
      
      return {
        path,
        newPath,
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
        newPath: {
          type: 'string',
          description: 'New path for the folder'
        },
        overwrite: {
          type: 'boolean',
          description: 'Whether to overwrite if a folder already exists at the new path'
        }
      },
      required: ['path', 'newPath'],
      description: 'Move a folder to a new location'
    };
  }
}