import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { MoveNoteArgs, MoveNoteResult } from '../types';
import { FileOperations } from '../utils/FileOperations';

/**
 * Tool for moving a note
 */
export class MoveNoteTool extends BaseTool<MoveNoteArgs, MoveNoteResult> {
  private app: App;
  
  /**
   * Create a new MoveNoteTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'moveNote',
      'Move a note to a new location',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the result of moving the note
   */
  async execute(args: MoveNoteArgs): Promise<MoveNoteResult> {
    const { path, newPath, overwrite } = args;
    
    try {
      await FileOperations.moveNote(this.app, path, newPath, overwrite);
      
      return {
        path,
        newPath,
        success: true
      };
    } catch (error) {
      console.error('Failed to move note:', error);
      
      return {
        path,
        newPath,
        success: false,
        error: error.message
      };
    }
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
        newPath: {
          type: 'string',
          description: 'New path for the note'
        },
        overwrite: {
          type: 'boolean',
          description: 'Whether to overwrite if a note already exists at the new path'
        }
      },
      required: ['path', 'newPath'],
      description: 'Move a note to a new location'
    };
  }
}