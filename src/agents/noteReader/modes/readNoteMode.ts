import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ReadNoteArgs, ReadNoteResult } from '../types';
import { ReadOperations } from '../utils/ReadOperations';

/**
 * Mode for reading a note
 */
export class ReadNoteMode extends BaseMode<ReadNoteArgs, ReadNoteResult> {
  private app: App;
  
  /**
   * Create a new ReadNoteMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'readNote',
      'Read Note',
      'Read the content of a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the note content
   */
  async execute(params: ReadNoteArgs): Promise<ReadNoteResult> {
    const { path, includeLineNumbers } = params;
    
    let content: string;
    
    if (includeLineNumbers) {
      content = await ReadOperations.readNoteWithLineNumbers(this.app, path);
    } else {
      content = await ReadOperations.readNote(this.app, path);
    }
    
    return {
      content,
      path,
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
        includeLineNumbers: {
          type: 'boolean',
          description: 'Whether to include line numbers in the output',
          default: false
        }
      },
      required: ['path']
    };
  }
}