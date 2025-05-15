import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ListNoteArgs, ListNoteResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Mode for listing notes in the vault
 */
export class ListNoteMode extends BaseMode<ListNoteArgs, ListNoteResult> {
  private app: App;
  
  /**
   * Create a new ListNoteMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listNote',
      'List Notes',
      'List notes in the vault',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the list of notes
   */
  async execute(params: ListNoteArgs): Promise<ListNoteResult> {
    const { path, extension, limit } = params;
    
    try {
      const notes = await SearchOperations.listNotes(this.app, path, extension, limit);
      
      return {
        success: true,
        notes,
        total: notes.length
      };
    } catch (error) {
      console.error('Failed to list notes:', error);
      
      return {
        success: false,
        notes: [],
        total: 0
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
          description: 'Path to search in (optional)'
        },
        extension: {
          type: 'string',
          description: 'Filter by extension (optional)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (optional)'
        }
      },
      description: 'List notes in the vault'
    };
  }
}