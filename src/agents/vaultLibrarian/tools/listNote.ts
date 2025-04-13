import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { ListNoteArgs, ListNoteResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Tool for listing notes in the vault
 */
export class ListNoteTool extends BaseTool<ListNoteArgs, ListNoteResult> {
  private app: App;
  
  /**
   * Create a new ListNoteTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listNote',
      'List notes in the vault',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the list of notes
   */
  async execute(args: ListNoteArgs): Promise<ListNoteResult> {
    const { path, extension, limit } = args;
    
    try {
      const notes = await SearchOperations.listNotes(this.app, path, extension, limit);
      
      return {
        notes,
        total: notes.length
      };
    } catch (error) {
      console.error('Failed to list notes:', error);
      
      return {
        notes: [],
        total: 0
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