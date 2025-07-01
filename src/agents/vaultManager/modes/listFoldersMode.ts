import { App, TFolder } from 'obsidian';
import { BaseDirectoryMode } from './baseDirectoryMode';
import { CommonParameters, CommonResult } from '../../../types';
import { createErrorMessage } from '../../../utils/errorUtils';
import { filterByName, FILTER_DESCRIPTION } from '../../../utils/filterUtils';
import { extractContextFromParams, parseWorkspaceContext } from '../../../utils/contextUtils';

/**
 * Parameters for list folders mode
 */
interface ListFoldersParameters extends CommonParameters {
  /**
   * Directory path to list folders from (required)
   * Use empty string (""), "/" or "." for root directory
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
export class ListFoldersMode extends BaseDirectoryMode<ListFoldersParameters, ListFoldersResult> {
  
  /**
   * Create a new ListFoldersMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listFolders',
      'List Folders',
      'List folders in a specified directory',
      '1.0.0',
      app
    );
  }

  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: ListFoldersParameters): Promise<ListFoldersResult> {
    try {
      // Get the folder using base class method
      const parentFolder = await this.getFolder(params.path);
      const normalizedPath = this.normalizeDirectoryPath(params.path);
      
      // Get all children
      const children = parentFolder.children || [];
      
      // Filter for folders only
      let folders = children.filter(child => child instanceof TFolder) as TFolder[];
      
      // Apply additional filter if provided
      if (params.filter) {
        folders = filterByName(folders, params.filter);
      }
      
      // Map folders to required format
      const folderData = folders.map(folder => ({
        name: folder.name,
        path: folder.path
      }));
      
      // Sort folders alphabetically
      folderData.sort((a, b) => a.name.localeCompare(b.name));
      
      // Generate helpful message for root directory (but folders don't need the same warning as files)
      const message = this.getRootDirectoryMessage(normalizedPath, 'Listing folders');
      
      return this.prepareResult(
        true, 
        { folders: folderData }, 
        message, 
        extractContextFromParams(params), 
        parseWorkspaceContext(params.workspaceContext) || undefined
      );
      
    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Failed to list folders: ', error));
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
        path: this.getDirectoryPathSchema(),
        filter: {
          type: 'string',
          description: FILTER_DESCRIPTION
        },
        ...commonSchema
      },
      required: ['path']
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
