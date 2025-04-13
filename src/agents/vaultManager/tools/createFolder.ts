import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { CreateFolderArgs, CreateFolderResult } from '../types';
import { FileOperations } from '../utils/FileOperations';

/**
 * Tool for creating a folder
 */
export class CreateFolderTool extends BaseTool<CreateFolderArgs, CreateFolderResult> {
  private app: App;
  
  /**
   * Create a new CreateFolderTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'createFolder',
      'Create a new folder',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the result of creating the folder
   */
  async execute(args: CreateFolderArgs): Promise<CreateFolderResult> {
    const { path } = args;
    
    try {
      const existed = await FileOperations.createFolder(this.app, path);
      
      return {
        path,
        success: true,
        existed
      };
    } catch (error) {
      console.error('Failed to create folder:', error);
      
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
        }
      },
      required: ['path'],
      description: 'Create a new folder'
    };
  }
}