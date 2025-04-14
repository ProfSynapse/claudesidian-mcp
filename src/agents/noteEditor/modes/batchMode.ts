import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { EditOperations } from '../utils/EditOperations';
import { EditOperation, EditResult, BatchEditResult } from '../types';

/**
 * Parameters for the batch mode
 */
export interface BatchModeParams {
  /**
   * Edit operations to perform
   */
  operations: EditOperation[];
}

/**
 * Mode for performing multiple edit operations
 */
export class BatchMode extends BaseMode<BatchModeParams, BatchEditResult> {
  private app: App;
  
  /**
   * Create a new BatchMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'batch',
      'Batch Edit',
      'Perform multiple edit operations on notes',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of the operations
   */
  async execute(params: BatchModeParams): Promise<BatchEditResult> {
    // Validate operations array
    if (!params || !params.operations) {
      throw new Error('Missing required parameter: operations');
    }
    
    if (!Array.isArray(params.operations)) {
      throw new Error('Invalid operations parameter: must be an array');
    }
    
    const { operations } = params;
    const results: EditResult[] = [];
    
    // Log the operations for debugging
    console.log(`BatchMode: Processing ${operations.length} operations`);
    
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i] as any; // Use any type to avoid TypeScript errors during validation
      
      // Validate each operation
      if (!operation || typeof operation !== 'object') {
        results.push({
          path: 'unknown',
          success: false,
          error: `Invalid operation at index ${i}: operation must be an object`
        });
        continue;
      }
      
      if (!operation.type) {
        results.push({
          path: operation.path ? String(operation.path) : 'unknown',
          success: false,
          error: `Invalid operation at index ${i}: missing 'type' property`
        });
        continue;
      }
      
      if (!operation.path) {
        results.push({
          path: 'unknown',
          success: false,
          error: `Invalid operation at index ${i}: missing 'path' property`
        });
        continue;
      }
      
      try {
        console.log(`BatchMode: Executing operation ${i+1}/${operations.length} of type ${operation.type} on path ${operation.path}`);
        // Now that we've validated the operation, we can safely cast it to EditOperation
        await EditOperations.executeOperation(this.app, operation as EditOperation);
        
        results.push({
          path: operation.path,
          success: true
        });
      } catch (error) {
        console.error(`BatchMode: Error executing operation ${i+1}/${operations.length}:`, error);
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
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
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
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the note'
              },
              success: {
                type: 'boolean',
                description: 'Whether the edit was successful'
              },
              error: {
                type: 'string',
                description: 'Error message if edit failed'
              }
            },
            required: ['path', 'success']
          },
          description: 'Results of individual edit operations'
        },
        success: {
          type: 'boolean',
          description: 'Whether all edits were successful'
        }
      },
      required: ['results', 'success']
    };
  }
}