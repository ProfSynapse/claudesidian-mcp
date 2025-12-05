import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { MoveFolderParams, MoveFolderResult } from '../types';
import { FileOperations } from '../utils/FileOperations';
import { createErrorMessage } from '../../../utils/errorUtils';

/**
 * Mode for moving a folder
 */
export class MoveFolderMode extends BaseMode<MoveFolderParams, MoveFolderResult> {
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
  async execute(params: MoveFolderParams): Promise<MoveFolderResult> {
    const { path, newPath, overwrite } = params;

    try {
      await FileOperations.moveFolder(this.app, path, newPath, overwrite);

      return this.prepareResult(true, { path, newPath });
    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Failed to move folder: ', error));
    }
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    const modeSchema = {
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
    
    // Merge with common schema (sessionId and context)
    return this.getMergedSchema(modeSchema);
  }
}
