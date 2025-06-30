import { App, TFile, TFolder } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CommonParameters, CommonResult } from '../../../types';
import { createErrorMessage } from '../../../utils/errorUtils';
import { filterByName, FILTER_DESCRIPTION } from '../../../utils/filterUtils';

import { extractContextFromParams, parseWorkspaceContext } from '../../../utils/contextUtils';
/**
 * Parameters for list files mode
 */
interface ListFilesParameters extends CommonParameters {
  /**
   * Directory path to list files from (optional, defaults to root)
   */
  path?: string;
  
  /**
   * Optional filter pattern for files
   */
  filter?: string;
}

/**
 * Result for list files mode
 */
interface ListFilesResult extends CommonResult {
  data?: {
    files: Array<{
      name: string;
      path: string;
      size: number;
      created: number;
      modified: number;
    }>;
  };
}

/**
 * Mode to list files in a directory
 */
export class ListFilesMode extends BaseMode<ListFilesParameters, ListFilesResult> {
  private app: App;
  
  /**
   * Create a new ListFilesMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listFiles',
      'List Files',
      'List files in a specified directory',
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
  async execute(params: ListFilesParameters): Promise<ListFilesResult> {
    try {
      // Default to empty string for root if path not provided
      const path = params.path ?? '';
      
      // Normalize the path to remove any leading slash
      const normalizedPath = this.normalizePath(path);
      
      // Get the folder - handle root folder case
      let parentFolder;
      if (normalizedPath === '') {
        // Root folder case
        parentFolder = this.app.vault.getRoot();
      } else {
        parentFolder = this.app.vault.getAbstractFileByPath(normalizedPath);
        if (!parentFolder || !(parentFolder instanceof TFolder)) {
          return this.prepareResult(false, undefined, `Folder not found at path: ${normalizedPath}`);
        }
      }
      
      // Get all children
      const children = parentFolder.children || [];
      
      // Filter for files only
      let files = children.filter(child => child instanceof TFile) as TFile[];
      
      // Apply additional filter if provided
      if (params.filter) {
        files = filterByName(files, params.filter);
      }
      
      // Map files to required format
      const fileData = files.map(file => ({
        name: file.name,
        path: file.path,
        size: file.stat.size,
        created: file.stat.ctime,
        modified: file.stat.mtime
      }));
      
      // Sort files by modified date (newest first)
      fileData.sort((a, b) => b.modified - a.modified);
      
      // Add helpful message for root directory listing
      const message = normalizedPath === '' 
        ? 'Listing files in root directory only. This may not include all notes in the vault - many notes may be organized in subfolders. Use listFolders mode to explore the full vault structure.'
        : undefined;
      
      return this.prepareResult(true, { files: fileData }, message, extractContextFromParams(params), parseWorkspaceContext(params.workspaceContext) || undefined);
      
    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Failed to list files: ', error));
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
          description: 'Directory path to list files from (optional, empty string for root directory)',
          default: ''
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
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              path: { type: 'string' },
              size: { type: 'number' },
              created: { type: 'number' },
              modified: { type: 'number' }
            }
          }
        }
      }
    };
    
    return baseSchema;
  }
}