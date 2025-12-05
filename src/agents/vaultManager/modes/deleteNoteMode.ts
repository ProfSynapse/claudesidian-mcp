import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { DeleteNoteParams, DeleteNoteResult } from '../types';
import { FileOperations } from '../utils/FileOperations';
import { createErrorMessage } from '../../../utils/errorUtils';

/**
 * Mode for deleting a note
 */
export class DeleteNoteMode extends BaseMode<DeleteNoteParams, DeleteNoteResult> {
  private app: App;
  
  /**
   * Create a new DeleteNoteMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'deleteNote',
      'Delete Note',
      'Delete a note from the vault',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of deleting the note
   */
  async execute(params: DeleteNoteParams): Promise<DeleteNoteResult> {
    const { path } = params;

    try {
      await FileOperations.deleteNote(this.app, path);

      return this.prepareResult(true, { path });
    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Failed to delete note: ', error));
    }
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    const modeSchema = {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the note to delete'
        }
      },
      required: ['path'],
      description: 'Delete a note from the vault'
    };
    
    // Merge with common schema (sessionId and context)
    return this.getMergedSchema(modeSchema);
  }
}