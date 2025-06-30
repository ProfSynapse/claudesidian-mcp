import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { MoveNoteArgs, MoveNoteResult } from '../types';
import { FileOperations } from '../utils/FileOperations';
import { createErrorMessage } from '../../../utils/errorUtils';

/**
 * Mode for moving a note
 */
export class MoveNoteMode extends BaseMode<MoveNoteArgs, MoveNoteResult> {
  private app: App;
  
  /**
   * Create a new MoveNoteMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'moveNote',
      'Move Note',
      'Move a note to a new location',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of moving the note
   */
  async execute(params: MoveNoteArgs): Promise<MoveNoteResult> {
    const { path, newPath, overwrite } = params;
    
    try {
      await FileOperations.moveNote(this.app, path, newPath, overwrite);
      
      return {
        path,
        newPath,
        success: true
      };
    } catch (error) {
      return {
        path,
        newPath,
        success: false,
        error: createErrorMessage('Failed to move note: ', error)
      };
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
    
    // Merge with common schema (sessionId and context)
    return this.getMergedSchema(modeSchema);
  }
}
