import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { CreateNoteArgs, CreateNoteResult } from '../types';
import { FileOperations } from '../utils/FileOperations';

/**
 * Tool for creating a note
 */
export class CreateNoteTool extends BaseTool<CreateNoteArgs, CreateNoteResult> {
  private app: App;
  
  /**
   * Create a new CreateNoteTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'createNote',
      'Create a new note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the result of creating the note
   */
  async execute(args: CreateNoteArgs): Promise<CreateNoteResult> {
    const { path, content, overwrite } = args;
    
    try {
      const result = await FileOperations.createNote(this.app, path, content, overwrite);
      
      return {
        path,
        success: true,
        existed: result.existed
      };
    } catch (error) {
      console.error('Failed to create note:', error);
      
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