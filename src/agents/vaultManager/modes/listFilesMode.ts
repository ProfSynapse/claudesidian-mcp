import { App, TFile, TFolder } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CommonParameters, CommonResult } from '../../../types';
import { createErrorMessage } from '../../../utils/errorUtils';
import { filterByName, FILTER_DESCRIPTION } from '../../../utils/filterUtils';

/**
 * Parameters for list files mode
 */
interface ListFilesParameters extends CommonParameters {
  /**
   * Directory path to list files from
   */
  path: string;
  
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
   * Normalize path by removing leading slash
   * @param path Path to normalize
   * @returns Normalized path
   */
  private normalizePath(path: string): string {
    return path.startsWith('/') ? path.slice(1) : path;
  }

  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: ListFilesParameters): Promise<ListFilesResult> {
    try {
      // Validate parameters
      if (!params.path) {
        return this.prepareResult(false, undefined, 'Path is required');
      }
      
      // Normalize the path to remove any leading slash
      const normalizedPath = this.normalizePath(params.path);
      
      // Get the folder
      const parentFolder = this.app.vault.getAbstractFileByPath(normalizedPath);
      if (!parentFolder || !(parentFolder instanceof TFolder)) {
        return this.prepareResult(false, undefined, `Folder not found at path: ${normalizedPath}`);
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
      
      return this.prepareResult(true, { files: fileData }, undefined, params.workspaceContext);
      
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
          description: 'Directory path to list files from'
        },
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