import { App, TFolder } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CommonParameters, CommonResult } from '../../../types';
import { createErrorMessage } from '../../../utils/errorUtils';
import { filterByName, FILTER_DESCRIPTION } from '../../../utils/filterUtils';

import { extractContextFromParams, parseWorkspaceContext } from '../../../utils/contextUtils';
/**
 * Parameters for list folders mode
 */
interface ListFoldersParameters extends CommonParameters {
  /**
   * Directory path to list folders from (empty string, "/", or "." for root)
   */
  path?: string;
  
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
   * Normalize path by removing leading slash and handling special cases
   * @param path Path to normalize
   * @returns Normalized path
   */
  private normalizePath(path: string): string {
    // Handle special cases for root directory
    if (!path || path === '/' || path === '.') {
      return '';
    }
    // Remove leading slash if present
    return path.startsWith('/') ? path.slice(1) : path;
  }

  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: ListFoldersParameters): Promise<ListFoldersResult> {
    try {
      // Default to root path if not provided or empty
      const path = params.path || '/';
      
      // Normalize the path to remove any leading slash
      const normalizedPath = this.normalizePath(path);
      
      // Get the folder - for root path, use the vault's root folder
      let parentFolder;
      if (normalizedPath === '') {
        parentFolder = this.app.vault.getRoot();
      } else {
        parentFolder = this.app.vault.getAbstractFileByPath(normalizedPath);
      }
      
      if (!parentFolder || !(parentFolder instanceof TFolder)) {
        return this.prepareResult(false, undefined, `Folder not found at path: ${normalizedPath}`);
      }
      
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
      
      return this.prepareResult(true, { folders: folderData }, undefined, extractContextFromParams(params), parseWorkspaceContext(params.workspaceContext) || undefined);
      
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
        path: {
          type: 'string',
          description: 'Directory path to list folders from (empty string, "/", or "." for root directory)',
          default: '/'
        },
        filter: {
          type: 'string',
          description: FILTER_DESCRIPTION
        },
        ...commonSchema
      },
      required: []
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