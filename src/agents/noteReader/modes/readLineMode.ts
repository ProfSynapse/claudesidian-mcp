import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ReadLineArgs, ReadLineResult } from '../types';
import { ReadOperations } from '../utils/ReadOperations';

/**
 * Mode for reading specific lines from a note
 */
export class ReadLineMode extends BaseMode<ReadLineArgs, ReadLineResult> {
  private app: App;
  
  /**
   * Create a new ReadLineMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'readLine',
      'Read Line',
      'Read specific lines from a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the specified lines
   */
  async execute(params: ReadLineArgs): Promise<ReadLineResult> {
    const { path, startLine, endLine } = params;
    
    const lines = await ReadOperations.readLines(this.app, path, startLine, endLine);
    const numberedLines = await ReadOperations.readLinesWithNumbers(this.app, path, startLine, endLine);
    
    return {
      lines,
      numberedLines,
      path,
      startLine,
      endLine
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