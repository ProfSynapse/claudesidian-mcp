import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { BatchEditArgs, BatchEditResult, EditResult } from '../types';
import { EditOperations } from '../utils/EditOperations';

/**
 * Tool for performing multiple edit operations on notes
 */
export class BatchEditTool extends BaseTool<BatchEditArgs, BatchEditResult> {
  private app: App;
  
  /**
   * Create a new BatchEditTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'batchEdit',
      'Perform multiple edit operations on notes',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the results of the edits
   */
  async execute(args: BatchEditArgs): Promise<BatchEditResult> {
    const { operations } = args;
    const results: EditResult[] = [];
    
    for (const operation of operations) {
      try {
        await EditOperations.executeOperation(this.app, operation);
        
        results.push({
          path: operation.path,
          success: true
        });
      } catch (error) {
        results.push({
          path: operation.path,
          success: false,
          error: error.message
        });
      }
    }
    
    const success = results.every(result => result.success);
    
    return {
      results,
      success
    };
  }
  
  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any {
    return {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          items: {
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
            required: ['type', 'path']
          },
          description: 'Edit operations to perform'
        }
      },
      required: ['operations']
    };
  }
}