import { App, TFolder } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CommonParameters, CommonResult } from '../../../types';

/**
 * Parameters for list folders mode
 */
interface ListFoldersParameters extends CommonParameters {
  /**
   * Directory path to list folders from
   */
  path: string;
  
  /**
   * Optional filter pattern for folders
   */
  filter?: string;
}

/**
 * Result for list folders mode
 */
interface ListFoldersResult extends CommonResult {
  data?: {
    folders: Array<{
      name: string;
      path: string;
    }>;
  };
}

/**
 * Mode to list folders in a directory
 */
export class ListFoldersMode extends BaseMode<ListFoldersParameters, ListFoldersResult> {
  private app: App;
  
  /**
   * Create a new ListFoldersMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listFolders',
      'List Folders',
      'List folders in a specified directory',
      '1.0.0'
    );
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: ListFoldersParameters): Promise<ListFoldersResult> {
    try {
      // Validate parameters
      if (!params.path) {
        return this.prepareResult(false, undefined, 'Path is required');
      }
      
      // Get the folder
      const parentFolder = this.app.vault.getAbstractFileByPath(params.path);
      if (!parentFolder || !(parentFolder instanceof TFolder)) {
        return this.prepareResult(false, undefined, `Folder not found at path: ${params.path}`);
      }
      
      // Get all children
      const children = parentFolder.children || [];
      
      // Filter for folders only
      let folders = children.filter(child => child instanceof TFolder) as TFolder[];
      
      // Apply additional filter if provided
      if (params.filter) {
        const filterRegex = new RegExp(params.filter, 'i');
        folders = folders.filter(folder => filterRegex.test(folder.name));
      }
      
      // Map folders to required format
      const folderData = folders.map(folder => ({
        name: folder.name,
        path: folder.path
      }));
      
      // Sort folders alphabetically
      folderData.sort((a, b) => a.name.localeCompare(b.name));
      
      return this.prepareResult(true, { folders: folderData }, undefined, params.workspaceContext);
      
    } catch (error) {
      return this.prepareResult(false, undefined, `Failed to list folders: ${error.message}`);
    }
  }
  
  /**
   * Get the parameter schema
   */
  getParameterSchema(): any {
    const commonSchema = this.getCommonParameterSchema();
    
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list folders from (REQUIRED)'
        },
        filter: {
          type: 'string',
          description: 'Optional filter pattern for folders'
        },
        ...commonSchema
      },
      required: ['path', 'sessionId', 'context']
    };
  }
  
  /**
   * Get the result schema
   */
  getResultSchema(): any {
    const baseSchema = super.getResultSchema();
    
    // Extend the base schema to include our specific data
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        folders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              path: { type: 'string' }
            }
          }
        }
      }
    };
    
    return baseSchema;
  }
}