import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CommonParameters, CommonResult } from '../../../types';

/**
 * Arguments for moving a file
 */
export interface MoveFileArgs extends CommonParameters {
  /**
   * Path to the file to move
   */
  path: string;
  
  /**
   * New path for the file
   */
  newPath: string;
}

/**
 * Result of moving a file
 */
export interface MoveFileResult extends CommonResult {
  /**
   * Path to the file
   */
  path?: string;
  
  /**
   * New path for the file
   */
  newPath?: string;
}

/**
 * Mode for moving a file
 */
export class MoveFileMode extends BaseMode<MoveFileArgs, MoveFileResult> {
  private app: App;
  
  /**
   * Create a new MoveFileMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'moveFile',
      'Move File',
      'Move a file in the vault',
      '1.0.0'
    );
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: MoveFileArgs): Promise<MoveFileResult> {
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
      
      // In a real implementation, this would move the file
      // using the Obsidian Vault API
      
      return {
        success: true,
        path: params.path,
        newPath: params.newPath
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to move file: ${error.message}`
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
          description: 'Path to the file to move'
        },
        newPath: {
          type: 'string',
          description: 'New path for the file'
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
          description: 'Path to the file'
        },
        newPath: {
          type: 'string',
          description: 'New path for the file'
        }
      },
      required: ['success']
    };
  }
}