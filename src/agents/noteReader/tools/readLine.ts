import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { ReadLineArgs, ReadLineResult } from '../types';
import { ReadOperations } from '../utils/ReadOperations';

/**
 * Tool for reading specific lines from a note
 */
export class ReadLineTool extends BaseTool<ReadLineArgs, ReadLineResult> {
  private app: App;
  
  /**
   * Create a new ReadLineTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'readLine',
      'Read specific lines from a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the specified lines
   */
  async execute(args: ReadLineArgs): Promise<ReadLineResult> {
    const { path, startLine, endLine } = args;
    
    const lines = await ReadOperations.readLines(this.app, path, startLine, endLine);
    
    return {
      lines,
      path,
      startLine,
      endLine
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
        path: {
          type: 'string',
          description: 'Path to the note'
        },
        startLine: {
          type: 'number',
          description: 'Start line (1-based)'
        },
        endLine: {
          type: 'number',
          description: 'End line (1-based, inclusive)'
        }
      },
      required: ['path', 'startLine', 'endLine']
    };
  }
}