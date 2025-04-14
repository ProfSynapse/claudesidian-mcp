import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { EditOperations } from '../utils/EditOperations';
import { EditOperationType, InsertOperation, EditResult } from '../types';

/**
 * Parameters for the insert mode
 */
export interface InsertModeParams {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Content to insert
   */
  content: string;
  
  /**
   * Position to insert at (line number, 1-based)
   */
  position: number;
}

/**
 * Mode for inserting content into a note at a specific position
 */
export class InsertMode extends BaseMode<InsertModeParams, EditResult> {
  private app: App;
  
  /**
   * Create a new InsertMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'insert',
      'Insert Content',
      'Insert content into a note at a specific position',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of the operation
   */
  async execute(params: InsertModeParams): Promise<EditResult> {
    const { path, content, position } = params;
    
    const operation: InsertOperation = {
      type: EditOperationType.INSERT,
      path,
      content,
      position
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
        content: {
          type: 'string',
          description: 'Content to insert'
        },
        position: {
          type: 'number',
          description: 'Position to insert at (line number, 1-based)'
        }
      },
      required: ['path', 'content', 'position']
    };
  }
}