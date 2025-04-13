import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { ReadNoteArgs, ReadNoteResult } from '../types';
import { ReadOperations } from '../utils/ReadOperations';

/**
 * Tool for reading a note
 */
export class ReadNoteTool extends BaseTool<ReadNoteArgs, ReadNoteResult> {
  private app: App;
  
  /**
   * Create a new ReadNoteTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'readNote',
      'Read the content of a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the note content
   */
  async execute(args: ReadNoteArgs): Promise<ReadNoteResult> {
    const { path } = args;
    
    const content = await ReadOperations.readNote(this.app, path);
    
    return {
      content,
      path
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
        }
      },
      required: ['path']
    };
  }
}