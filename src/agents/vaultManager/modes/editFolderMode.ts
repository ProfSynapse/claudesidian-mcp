import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CommonParameters, CommonResult } from '../../../types';
import { createErrorMessage } from '../../../utils/errorUtils';

/**
 * Arguments for editing a folder
 */
export interface EditFolderArgs extends CommonParameters {
  /**
   * Path to the folder to edit
   */
  path: string;
  
  /**
   * New path for the folder
   */
  newPath: string;
}

/**
 * Result of editing a folder
 */
export interface EditFolderResult extends CommonResult {
  /**
   * Path to the folder
   */
  path?: string;
  
  /**
   * New path for the folder
   */
  newPath?: string;
}

/**
 * Mode for editing a folder
 */
export class EditFolderMode extends BaseMode<EditFolderArgs, EditFolderResult> {
  private app: App;
  
  /**
   * Create a new EditFolderMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'editFolder',
      'Edit Folder',
      'Edit a folder in the vault',
      '1.0.0'
    );
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: EditFolderArgs): Promise<EditFolderResult> {
    try {
      if (!params.path) {
        return {
          success: false,
          error: 'Path is required'
        };
      }
      
      if (!params.newPath) {
        return {
          success: false,
          error: 'New path is required'
        };
      }
      
      // Rename the folder using the Obsidian Vault API
      try {
        await this.app.vault.adapter.rename(params.path, params.newPath);
      } catch (renameError) {
        return {
          success: false,
          error: createErrorMessage('Failed to rename folder: ', renameError)
        };
      }
      
      return {
        success: true,
        path: params.path,
        newPath: params.newPath
      };
    } catch (error) {
      return {
        success: false,
        error: createErrorMessage('Failed to edit folder: ', error)
      };
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
          description: 'Path to the folder to edit'
        },
        newPath: {
          type: 'string',
          description: 'New path for the folder'
        },
        ...commonSchema
      },
      required: ['path', 'newPath']
    };
  }
  
  /**
   * Get the result schema
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the operation was successful'
        },
        error: {
          type: 'string',
          description: 'Error message if operation failed'
        },
        path: {
          type: 'string',
          description: 'Path to the folder'
        },
        newPath: {
          type: 'string',
          description: 'New path for the folder'
        }
      },
      required: ['success']
    };
  }
}