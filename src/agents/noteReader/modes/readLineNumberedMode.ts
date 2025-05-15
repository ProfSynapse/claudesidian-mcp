import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ReadNoteArgs, ReadNoteLineNumberedResult } from '../types';
import { ReadOperations } from '../utils/ReadOperations';

/**
 * Mode for reading a note with line numbers
 */
export class ReadLineNumberedMode extends BaseMode<ReadNoteArgs, ReadNoteLineNumberedResult> {
  private app: App;
  
  /**
   * Create a new ReadLineNumberedMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'readNumbered',
      'Read Note with Line Numbers',
      'Read the content of a note with line numbers',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the note content with line numbers
   */
  async execute(params: ReadNoteArgs): Promise<ReadNoteLineNumberedResult> {
    const { path } = params;
    
    const content = await ReadOperations.readNote(this.app, path);
    const numberedContent = await ReadOperations.readNoteWithLineNumbers(this.app, path);
    
    return {
      content,
      numberedContent,
      path
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
        }
      },
      required: ['path']
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
        content: {
          type: 'string',
          description: 'Content of the note'
        },
        numberedContent: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              number: {
                type: 'number',
                description: 'Line number (1-based)'
              },
              text: {
                type: 'string',
                description: 'Line content'
              }
            }
          },
          description: 'Content of the note with line numbers'
        },
        path: {
          type: 'string',
          description: 'Path to the note'
        }
      }
    };
  }
}