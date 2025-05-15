import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { EditOperationType, EditResult, DeleteOperation, InsertOperation } from '../types';
import { EditOperations } from '../utils/EditOperations';

/**
 * Arguments for replacing content in a specific line range
 */
export interface ReplaceByLineArgs {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Start line number (1-based)
   */
  startLine: number;
  
  /**
   * End line number (1-based, inclusive)
   */
  endLine: number;
  
  /**
   * Content to replace with
   */
  content: string;
}

/**
 * Mode for replacing content in a specific line range
 */
export class ReplaceByLineMode extends BaseMode<ReplaceByLineArgs, EditResult> {
  private app: App;
  
  /**
   * Create a new ReplaceByLineMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'replaceByLine',
      'Replace By Line',
      'Replace content in a specific line range',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of the operation
   */
  async execute(params: ReplaceByLineArgs): Promise<EditResult> {
    try {
      const { path, startLine, endLine, content } = params;
      
      // First, delete the specified lines
      const deleteOperation: DeleteOperation = {
        type: EditOperationType.DELETE,
        path,
        startPosition: startLine,
        endPosition: endLine
      };
      
      await EditOperations.executeOperation(this.app, deleteOperation);
      
      // Then, insert the new content at the start line
      const insertOperation: InsertOperation = {
        type: EditOperationType.INSERT,
        path,
        position: startLine,
        content
      };
      
      await EditOperations.executeOperation(this.app, insertOperation);
      
      return {
        path,
        success: true
      };
    } catch (error) {
      return {
        path: params.path,
        success: false,
        error: error.message || 'Failed to replace content by line range'
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
        startLine: {
          type: 'number',
          description: 'Start line number (1-based)'
        },
        endLine: {
          type: 'number',
          description: 'End line number (1-based, inclusive)'
        },
        content: {
          type: 'string',
          description: 'Content to replace with'
        }
      },
      required: ['path', 'startLine', 'endLine', 'content']
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
          description: 'Error message if the operation failed'
        }
      },
      required: ['path', 'success']
    };
  }
}