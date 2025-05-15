import { App, TFile } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CommonParameters, CommonResult } from '../../../types';

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
      
      // Get all files in the vault
      const allFiles = this.app.vault.getFiles();
      
      // Filter files by path
      const normalizedPath = params.path.endsWith('/') ? params.path : `${params.path}/`;
      let files = allFiles.filter(file => 
        file.path.startsWith(normalizedPath) &&
        file.path.substring(normalizedPath.length).indexOf('/') === -1
      );
      
      // Apply additional filter if provided
      if (params.filter) {
        const filterRegex = new RegExp(params.filter, 'i');
        files = files.filter(file => filterRegex.test(file.name));
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
      return this.prepareResult(false, undefined, `Failed to list files: ${error.message}`);
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
          description: 'Optional filter pattern for files'
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