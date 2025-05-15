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
    const { path, startLine, endLine, includeLineNumbers } = params;
    
    let lines: string[];
    
    if (includeLineNumbers) {
      lines = await ReadOperations.readLinesWithLineNumbers(this.app, path, startLine, endLine);
    } else {
      lines = await ReadOperations.readLines(this.app, path, startLine, endLine);
    }
    
    return {
      lines,
      path,
      startLine,
      endLine,
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
        },
        includeLineNumbers: {
          type: 'boolean',
          description: 'Whether to include line numbers in the output',
          default: false
        }
      },
      required: ['path', 'startLine', 'endLine']
    };
  }
}