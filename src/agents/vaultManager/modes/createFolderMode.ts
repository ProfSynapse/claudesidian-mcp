import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CreateFolderArgs, CreateFolderResult } from '../types';
import { FileOperations } from '../utils/FileOperations';

/**
 * Mode for creating a folder
 */
export class CreateFolderMode extends BaseMode<CreateFolderArgs, CreateFolderResult> {
  private app: App;
  
  /**
   * Create a new CreateFolderMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'createFolder',
      'Create Folder',
      'Create a new folder',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of creating the folder
   */
  async execute(params: CreateFolderArgs): Promise<CreateFolderResult> {
    const { path } = params;
    
    try {
      const existed = await FileOperations.createFolder(this.app, path);
      
      return {
        path,
        success: true,
        existed
      };
    } catch (error) {
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
        }
      },
      required: ['path'],
      description: 'Create a new folder'
    };
  }
}
