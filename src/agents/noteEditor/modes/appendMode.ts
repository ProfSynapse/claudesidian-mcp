import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { EditOperations } from '../utils/EditOperations';
import { EditOperationType, AppendOperation, EditResult } from '../types';

/**
 * Parameters for the append mode
 */
export interface AppendModeParams {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Content to append
   */
  content: string;
}

/**
 * Mode for appending content to a note
 */
export class AppendMode extends BaseMode<AppendModeParams, EditResult> {
  private app: App;
  
  /**
   * Create a new AppendMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'append',
      'Append Content',
      'Append content to the end of a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of the operation
   */
  async execute(params: AppendModeParams): Promise<EditResult> {
    const { path, content } = params;
    
    const operation: AppendOperation = {
      type: EditOperationType.APPEND,
      path,
      content
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
          description: 'Content to append'
        }
      },
      required: ['path', 'content']
    };
  }
}