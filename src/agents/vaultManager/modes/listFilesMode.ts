import { App, TFile } from 'obsidian';
import { BaseDirectoryMode } from './baseDirectoryMode';
import { CommonParameters, CommonResult } from '../../../types';
import { createErrorMessage } from '../../../utils/errorUtils';
import { filterByName, FILTER_DESCRIPTION } from '../../../utils/filterUtils';
import { extractContextFromParams, parseWorkspaceContext } from '../../../utils/contextUtils';

/**
 * Parameters for list files mode
 */
interface ListFilesParameters extends CommonParameters {
  /**
   * Directory path to list files from (required)
   * Use empty string (""), "/" or "." for root directory
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
export class ListFilesMode extends BaseDirectoryMode<ListFilesParameters, ListFilesResult> {
  
  /**
   * Create a new ListFilesMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listFiles',
      'List Files',
      'List files in a specified directory',
      '1.0.0',
      app
    );
  }

  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: ListFilesParameters): Promise<ListFilesResult> {
    try {
      // Get the folder using base class method
      const parentFolder = await this.getFolder(params.path);
      const normalizedPath = this.normalizeDirectoryPath(params.path);
      
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
      
      // Generate helpful message for root directory
      const message = this.getRootDirectoryMessage(normalizedPath, 'Listing files');
      
      return this.prepareResult(
        true, 
        { files: fileData }, 
        message, 
        extractContextFromParams(params), 
        parseWorkspaceContext(params.workspaceContext) || undefined
      );
      
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
