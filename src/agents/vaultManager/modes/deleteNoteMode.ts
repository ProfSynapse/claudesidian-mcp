import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { DeleteNoteArgs, DeleteNoteResult } from '../types';
import { FileOperations } from '../utils/FileOperations';

/**
 * Mode for deleting a note
 */
export class DeleteNoteMode extends BaseMode<DeleteNoteArgs, DeleteNoteResult> {
  private app: App;
  
  /**
   * Create a new DeleteNoteMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'deleteNote',
      'Delete Note',
      'Delete a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of deleting the note
   */
  async execute(params: DeleteNoteArgs): Promise<DeleteNoteResult> {
    const { path } = params;
    
    try {
      await FileOperations.deleteNote(this.app, path);
      
      return {
        path,
        success: true
      };
    } catch (error) {
      console.error('Failed to delete note:', error);
      
      return {
        path,
        success: false,
        error: error.message
      };
    }
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
      required: ['path'],
      description: 'Delete a note'
    };
  }
}