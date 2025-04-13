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
              },
              // Replace operation properties
              search: {
                type: 'string',
                description: 'Text to search for in the note'
              },
              replace: {
                type: 'string',
                description: 'Text to replace the search text with'
              },
              replaceAll: {
                type: 'boolean',
                description: 'Whether to replace all occurrences of the search text'
              },
              // Insert operation properties
              content: {
                type: 'string',
                description: 'Content to insert, append, or prepend to the note'
              },
              position: {
                type: 'number',
                description: 'Line position to insert content at (1-based)'
              },
              // Delete operation properties
              startPosition: {
                type: 'number',
                description: 'Starting line position for deletion (1-based)'
              },
              endPosition: {
                type: 'number',
                description: 'Ending line position for deletion (1-based, inclusive)'
              }
            },
            required: ['type', 'path'],
            allOf: [
              {
                if: {
                  properties: { type: { enum: ['replace'] } },
                  required: ['type']
                },
                then: {
                  required: ['search', 'replace']
                }
              },
              {
                if: {
                  properties: { type: { enum: ['insert'] } },
                  required: ['type']
                },
                then: {
                  required: ['content', 'position']
                }
              },
              {
                if: {
                  properties: { type: { enum: ['delete'] } },
                  required: ['type']
                },
                then: {
                  required: ['startPosition', 'endPosition']
                }
              },
              {
                if: {
                  properties: { type: { enum: ['append', 'prepend'] } },
                  required: ['type']
                },
                then: {
                  required: ['content']
                }
              }
            ],
            description: 'Edit operation to perform'
          },
          description: 'Edit operations to perform'
        }
      },
      required: ['operations']
    };
  }
}