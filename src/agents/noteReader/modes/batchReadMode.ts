import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { BatchReadArgs, BatchReadResult } from '../types';
import { ReadOperations } from '../utils/ReadOperations';

/**
 * Mode for batch reading notes
 */
export class BatchReadMode extends BaseMode<BatchReadArgs, BatchReadResult> {
  private app: App;
  
  /**
   * Create a new BatchReadMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'batchRead',
      'Batch Read',
      'Read multiple notes at once',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the note contents
   */
  async execute(params: BatchReadArgs): Promise<BatchReadResult> {
    // Validate paths array
    if (!params || !params.paths) {
      throw new Error('Missing required parameter: paths');
    }
    
    if (!Array.isArray(params.paths)) {
      throw new Error('Invalid paths parameter: must be an array');
    }
    
    const { paths, includeLineNumbers } = params;
    
    // Validate each path
    const validatedPaths: string[] = [];
    const errors: Record<string, string> = {};
    
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      
      if (typeof path !== 'string') {
        errors[`index_${i}`] = `Invalid path at index ${i}: path must be a string`;
        continue;
      }
      
      if (!path.trim()) {
        errors[`index_${i}`] = `Invalid path at index ${i}: path cannot be empty`;
        continue;
      }
      
      validatedPaths.push(path);
    }
    
    // If there are validation errors, return them
    if (Object.keys(errors).length > 0 && validatedPaths.length === 0) {
      return {
        notes: {},
        errors
      };
    }
    
    // Execute the batch read operation with validated paths
    let result;
    if (includeLineNumbers) {
      result = await ReadOperations.batchReadWithLineNumbers(this.app, validatedPaths);
    } else {
      result = await ReadOperations.batchRead(this.app, validatedPaths);
    }
    
    // Merge any validation errors with read errors
    if (Object.keys(errors).length > 0) {
      result.errors = { ...errors, ...result.errors };
    }
    
    return {
      ...result,
      lineNumbersIncluded: includeLineNumbers
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
        paths: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Paths to the notes'
        },
        includeLineNumbers: {
          type: 'boolean',
          description: 'Whether to include line numbers in the output',
          default: false
        }
      },
      required: ['paths']
    };
  }
}