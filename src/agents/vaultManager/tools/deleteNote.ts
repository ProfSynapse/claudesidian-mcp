import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { DeleteNoteArgs, DeleteNoteResult } from '../types';
import { FileOperations } from '../utils/FileOperations';

/**
 * Tool for deleting a note
 */
export class DeleteNoteTool extends BaseTool<DeleteNoteArgs, DeleteNoteResult> {
  private app: App;
  
  /**
   * Create a new DeleteNoteTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'deleteNote',
      'Delete a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the result of deleting the note
   */
  async execute(args: DeleteNoteArgs): Promise<DeleteNoteResult> {
    const { path } = args;
    
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
      required: ['path'],
      description: 'Delete a note'
    };
  }
}