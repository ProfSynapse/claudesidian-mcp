import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { EditOperations } from '../utils/EditOperations';
import { EditOperationType, PrependOperation, EditResult } from '../types';

/**
 * Parameters for the prepend mode
 */
export interface PrependModeParams {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Content to prepend
   */
  content: string;
}

/**
 * Mode for prepending content to a note
 */
export class PrependMode extends BaseMode<PrependModeParams, EditResult> {
  private app: App;
  
  /**
   * Create a new PrependMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'prepend',
      'Prepend Content',
      'Prepend content to the beginning of a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of the operation
   */
  async execute(params: PrependModeParams): Promise<EditResult> {
    const { path, content } = params;
    
    const operation: PrependOperation = {
      type: EditOperationType.PREPEND,
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
          description: 'Content to prepend'
        }
      },
      required: ['path', 'content']
    };
  }
}