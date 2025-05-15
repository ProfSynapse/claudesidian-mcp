import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { EditOperations } from '../utils/EditOperations';
import { EditOperationType, ReplaceLineOperation, EditResult } from '../types';

/**
 * Parameters for the replace line mode
 */
export interface ReplaceLineModeParams {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Line number to replace (1-based)
   */
  lineNumber: number;
  
  /**
   * New content for the line
   */
  newContent: string;
}

/**
 * Mode for replacing a specific line in a note
 */
export class ReplaceLineMode extends BaseMode<ReplaceLineModeParams, EditResult> {
  private app: App;
  
  /**
   * Create a new ReplaceLineMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'replaceLine',
      'Replace Line',
      'Replace a specific line in a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of the operation
   */
  async execute(params: ReplaceLineModeParams): Promise<EditResult> {
    const { path, lineNumber, newContent } = params;
    
    const operation: ReplaceLineOperation = {
      type: EditOperationType.REPLACE_LINE,
      path,
      lineNumber,
      newContent
    };
    
    try {
      await EditOperations.executeOperation(this.app, operation);
      
      return {
        path,
        success: true
      };
    } catch (error) {
      return {
        path,
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the note'
        },
        lineNumber: {
          type: 'number',
          description: 'Line number to replace (1-based)'
        },
        newContent: {
          type: 'string',
          description: 'New content for the line'
        }
      },
      required: ['path', 'lineNumber', 'newContent']
    };
  }

  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the note'
        },
        success: {
          type: 'boolean',
          description: 'Whether the operation was successful'
        },
        error: {
          type: 'string',
          description: 'Error message if operation failed'
        }
      },
      required: ['path', 'success']
    };
  }
}