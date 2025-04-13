import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { SingleEditArgs, EditResult } from '../types';
import { EditOperations } from '../utils/EditOperations';

/**
 * Tool for performing a single edit operation on a note
 */
export class SingleEditTool extends BaseTool<SingleEditArgs, EditResult> {
  private app: App;
  
  /**
   * Create a new SingleEditTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'singleEdit',
      'Perform a single edit operation on a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the result of the edit
   */
  async execute(args: SingleEditArgs): Promise<EditResult> {
    const { operation } = args;
    
    try {
      await EditOperations.executeOperation(this.app, operation);
      
      return {
        path: operation.path,
        success: true
      };
    } catch (error) {
      return {
        path: operation.path,
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any {
    return {
      type: 'object',
      properties: {
        operation: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['replace', 'insert', 'delete', 'append', 'prepend'],
              description: 'Type of edit operation'
            },
            path: {
              type: 'string',
              description: 'Path to the note'
            }
          },
          required: ['type', 'path'],
          description: 'Edit operation to perform'
        }
      },
      required: ['operation']
    };
  }
}