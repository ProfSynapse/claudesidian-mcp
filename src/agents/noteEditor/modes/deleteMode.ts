import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { EditOperations } from '../utils/EditOperations';
import { EditOperationType, DeleteOperation, EditResult } from '../types';

/**
 * Parameters for the delete mode
 */
export interface DeleteModeParams {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Start position (line number, 1-based)
   */
  startPosition: number;
  
  /**
   * End position (line number, 1-based, inclusive)
   */
  endPosition: number;
}

/**
 * Mode for deleting content from a note
 */
export class DeleteMode extends BaseMode<DeleteModeParams, EditResult> {
  private app: App;
  
  /**
   * Create a new DeleteMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'delete',
      'Delete Content',
      'Delete content from a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of the operation
   */
  async execute(params: DeleteModeParams): Promise<EditResult> {
    const { path, startPosition, endPosition } = params;
    
    const operation: DeleteOperation = {
      type: EditOperationType.DELETE,
      path,
      startPosition,
      endPosition
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
        startPosition: {
          type: 'number',
          description: 'Start position (line number, 1-based)'
        },
        endPosition: {
          type: 'number',
          description: 'End position (line number, 1-based, inclusive)'
        }
      },
      required: ['path', 'startPosition', 'endPosition']
    };
  }
}