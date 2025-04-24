import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CreateNoteArgs, CreateNoteResult } from '../types';
import { FileOperations } from '../utils/FileOperations';

/**
 * Mode for creating a note
 */
export class CreateNoteMode extends BaseMode<CreateNoteArgs, CreateNoteResult> {
  private app: App;
  
  /**
   * Create a new CreateNoteMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'createNote',
      'Create Note',
      'Create a new note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of creating the note
   */
  async execute(params: CreateNoteArgs): Promise<CreateNoteResult> {
    const { path, content, overwrite } = params;
    
    try {
      const result = await FileOperations.createNote(this.app, path, content, overwrite);
      
      return {
        path,
        success: true,
        existed: result.existed
      };
    } catch (error) {
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
        },
        content: {
          type: 'string',
          description: 'Content of the note'
        },
        overwrite: {
          type: 'boolean',
          description: 'Whether to overwrite if the note already exists'
        }
      },
      required: ['path', 'content'],
      description: 'Create a new note'
    };
  }
}
