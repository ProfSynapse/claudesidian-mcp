import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { ListPropertiesArgs, ListPropertiesResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Tool for listing properties in the vault
 */
export class ListPropertiesTool extends BaseTool<ListPropertiesArgs, ListPropertiesResult> {
  private app: App;
  
  /**
   * Create a new ListPropertiesTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listProperties',
      'List properties in the vault',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the list of properties
   */
  async execute(args: ListPropertiesArgs): Promise<ListPropertiesResult> {
    const { key, limit } = args;
    
    try {
      const properties = await SearchOperations.listProperties(this.app, key, limit);
      
      return {
        properties,
        total: Object.keys(properties).length
      };
    } catch (error) {
      console.error('Failed to list properties:', error);
      
      return {
        properties: {},
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
        key: {
          type: 'string',
          description: 'Filter by key (optional)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (optional)'
        }
      },
      description: 'List properties in the vault'
    };
  }
}