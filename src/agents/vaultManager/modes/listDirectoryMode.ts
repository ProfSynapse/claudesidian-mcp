import { App, TFile, TFolder } from 'obsidian';
import { BaseDirectoryMode } from './baseDirectoryMode';
import { CommonParameters, CommonResult } from '../../../types';
import { createErrorMessage } from '../../../utils/errorUtils';
import { filterByName, FILTER_DESCRIPTION } from '../../../utils/filterUtils';
import { parseWorkspaceContext } from '../../../utils/contextUtils';

/**
 * Parameters for list directory mode
 */
interface ListDirectoryParameters extends CommonParameters {
  /**
   * Directory path to list contents from (required)
   * Use empty string (""), "/" or "." for root directory
   */
  path: string;
  
  /**
   * Optional filter pattern for files and folders
   */
  filter?: string;
  
  /**
   * Recursive depth for directory traversal (optional)
   * 0 = only current directory (default)
   * 1 = current directory + immediate subdirectories
   * 2 = current directory + subdirectories + their subdirectories
   * etc.
   */
  depth?: number;
  
  /**
   * Whether to include files in the results (default: true)
   */
  includeFiles?: boolean;
  
  /**
   * Whether to include folders in the results (default: true)
   */
  includeFolders?: boolean;
  
  /**
   * Shortcut to only return files (sets includeFiles=true, includeFolders=false)
   */
  filesOnly?: boolean;
  
  /**
   * Shortcut to only return folders (sets includeFiles=false, includeFolders=true)
   */
  foldersOnly?: boolean;
}

/**
 * Result for list directory mode
 */
interface ListDirectoryResult extends CommonResult {
  data?: {
    files?: Array<{
      name: string;
      path: string;
      size: number;
      created: number;
      modified: number;
    }>;
    folders?: Array<{
      name: string;
      path: string;
    }>;
    summary?: {
      fileCount: number;
      folderCount: number;
      totalItems: number;
    };
  };
}

/**
 * Mode to list files and/or folders in a directory
 */
export class ListDirectoryMode extends BaseDirectoryMode<ListDirectoryParameters, ListDirectoryResult> {
  
  /**
   * Create a new ListDirectoryMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listDirectory',
      'List Directory',
      'List files and/or folders in a directory with optional recursive depth',
      '1.0.0',
      app
    );
  }

  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: ListDirectoryParameters): Promise<ListDirectoryResult> {
    try {
      // Get the folder using base class method
      const parentFolder = await this.getFolder(params.path);
      const normalizedPath = this.normalizeDirectoryPath(params.path);
      
      // Resolve what to include based on parameters
      const { includeFiles, includeFolders } = this.resolveIncludeOptions(params);
      
      // Get contents recursively based on depth
      const depth = params.depth ?? 0;
      const allFiles = includeFiles ? this.getFilesRecursively(parentFolder, depth) : [];
      const allFolders = includeFolders ? this.getFoldersRecursively(parentFolder, depth) : [];
      
      // Apply filter if provided
      let filteredFiles = allFiles;
      let filteredFolders = allFolders;
      
      if (params.filter) {
        filteredFiles = filterByName(allFiles, params.filter);
        filteredFolders = filterByName(allFolders, params.filter);
      }
      
      // Prepare result data
      const result: any = {};
      
      if (includeFiles) {
        // Map files to required format
        const fileData = filteredFiles.map(file => ({
          name: file.name,
          path: file.path,
          size: file.stat.size,
          created: file.stat.ctime,
          modified: file.stat.mtime
        }));
        
        // Sort files by modified date (newest first)
        fileData.sort((a, b) => b.modified - a.modified);
        result.files = fileData;
      }
      
      if (includeFolders) {
        // Map folders to required format
        const folderData = filteredFolders.map(folder => ({
          name: folder.name,
          path: folder.path
        }));
        
        // Sort folders alphabetically
        folderData.sort((a, b) => a.name.localeCompare(b.name));
        result.folders = folderData;
      }
      
      // Add summary
      result.summary = {
        fileCount: filteredFiles.length,
        folderCount: filteredFolders.length,
        totalItems: filteredFiles.length + filteredFolders.length
      };
      
      // Generate helpful message
      const depthMessage = depth > 0 ? ` (depth: ${depth})` : '';
      const typeMessage = this.getTypeMessage(includeFiles, includeFolders);
      const message = this.getRootDirectoryMessage(normalizedPath, `Listing ${typeMessage}${depthMessage}`);
      
      return this.prepareResult(
        true, 
        result, 
        message, 
        params.context, 
        parseWorkspaceContext(params.workspaceContext, 'default-workspace', params.context) || undefined
      );
      
    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Failed to list directory contents: ', error));
    }
  }
  
  /**
   * Resolve include options based on parameters
   */
  private resolveIncludeOptions(params: ListDirectoryParameters): { includeFiles: boolean; includeFolders: boolean } {
    // Handle shortcut parameters first
    if (params.filesOnly) {
      return { includeFiles: true, includeFolders: false };
    }
    
    if (params.foldersOnly) {
      return { includeFiles: false, includeFolders: true };
    }
    
    // Use explicit parameters or defaults
    return {
      includeFiles: params.includeFiles ?? true,
      includeFolders: params.includeFolders ?? true
    };
  }
  
  /**
   * Get type message for the result
   */
  private getTypeMessage(includeFiles: boolean, includeFolders: boolean): string {
    if (includeFiles && includeFolders) {
      return 'directory contents';
    } else if (includeFiles) {
      return 'files';
    } else if (includeFolders) {
      return 'folders';
    } else {
      return 'nothing (no files or folders selected)';
    }
  }
  
  /**
   * Recursively get files up to specified depth
   * @param folder The folder to start from
   * @param depth The maximum depth to traverse (0 = current folder only)
   * @returns Array of files
   */
  private getFilesRecursively(folder: TFolder, depth: number): TFile[] {
    const result: TFile[] = [];
    
    // Get direct children that are files
    const childFiles = (folder.children || []).filter(child => child instanceof TFile) as TFile[];
    result.push(...childFiles);
    
    // If depth > 0, recursively get files from subfolders
    if (depth > 0) {
      const childFolders = (folder.children || []).filter(child => child instanceof TFolder) as TFolder[];
      for (const childFolder of childFolders) {
        const subFiles = this.getFilesRecursively(childFolder, depth - 1);
        result.push(...subFiles);
      }
    }
    
    return result;
  }
  
  /**
   * Recursively get folders up to specified depth
   * @param folder The folder to start from
   * @param depth The maximum depth to traverse (0 = current folder only)
   * @returns Array of folders
   */
  private getFoldersRecursively(folder: TFolder, depth: number): TFolder[] {
    const result: TFolder[] = [];
    
    // Get direct children that are folders
    const childFolders = (folder.children || []).filter(child => child instanceof TFolder) as TFolder[];
    result.push(...childFolders);
    
    // If depth > 0, recursively get subfolders
    if (depth > 0) {
      for (const childFolder of childFolders) {
        const subfolders = this.getFoldersRecursively(childFolder, depth - 1);
        result.push(...subfolders);
      }
    }
    
    return result;
  }
  
  /**
   * Get the parameter schema
   */
  getParameterSchema(): any {
    const modeSchema = {
      type: 'object',
      properties: {
        path: this.getDirectoryPathSchema(),
        filter: {
          type: 'string',
          description: FILTER_DESCRIPTION
        },
        depth: {
          type: 'number',
          description: 'Recursive depth for directory traversal (0 = current directory only, 1 = include immediate subdirectories, 2 = include subdirectories of subdirectories, etc.)',
          minimum: 0,
          default: 0
        },
        includeFiles: {
          type: 'boolean',
          description: 'Whether to include files in the results',
          default: true
        },
        includeFolders: {
          type: 'boolean',
          description: 'Whether to include folders in the results',
          default: true
        },
        filesOnly: {
          type: 'boolean',
          description: 'Shortcut to only return files (overrides includeFiles/includeFolders)',
          default: false
        },
        foldersOnly: {
          type: 'boolean',
          description: 'Shortcut to only return folders (overrides includeFiles/includeFolders)',
          default: false
        }
      },
      required: ['path']
    };
    
    return this.getMergedSchema(modeSchema);
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
        },
        folders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              path: { type: 'string' }
            }
          }
        },
        summary: {
          type: 'object',
          properties: {
            fileCount: { type: 'number' },
            folderCount: { type: 'number' },
            totalItems: { type: 'number' }
          }
        }
      }
    };
    
    return baseSchema;
  }
}