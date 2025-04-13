import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { BatchReadArgs, BatchReadResult } from '../types';
import { ReadOperations } from '../utils/ReadOperations';

/**
 * Tool for batch reading notes
 */
export class BatchReadTool extends BaseTool<BatchReadArgs, BatchReadResult> {
  private app: App;
  
  /**
   * Create a new BatchReadTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'batchRead',
      'Read multiple notes at once',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the note contents
   */
  async execute(args: BatchReadArgs): Promise<BatchReadResult> {
    const { paths } = args;
    
    return await ReadOperations.batchRead(this.app, paths);
  }
  
  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any {
    return {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Paths to the notes'
        }
      },
      required: ['paths']
    };
  }
}