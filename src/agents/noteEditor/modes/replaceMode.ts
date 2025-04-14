import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { EditOperations } from '../utils/EditOperations';
import { EditOperationType, ReplaceOperation, EditResult } from '../types';

/**
 * Parameters for the replace mode
 */
export interface ReplaceModeParams {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Text to search for in the note
   */
  search: string;
  
  /**
   * Text to replace the search text with
   */
  replace: string;
  
  /**
   * Whether to replace all occurrences of the search text
   */
  replaceAll?: boolean;
}

/**
 * Mode for replacing text in a note
 */
export class ReplaceMode extends BaseMode<ReplaceModeParams, EditResult> {
  private app: App;
  
  /**
   * Create a new ReplaceMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'replace',
      'Replace Text',
      'Replace text in a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of the operation
   */
  async execute(params: ReplaceModeParams): Promise<EditResult> {
    const { path, search, replace, replaceAll } = params;
    
    const operation: ReplaceOperation = {
      type: EditOperationType.REPLACE,
      path,
      search,
      replace,
      replaceAll
    };
    
    try {
      await EditOperations.executeOperation(this.app, operation);
      
      return {
        path,
        success: true
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
        search: {
          type: 'string',
          description: 'Text to search for in the note'
        },
        replace: {
          type: 'string',
          description: 'Text to replace the search text with'
        },
        replaceAll: {
          type: 'boolean',
          description: 'Whether to replace all occurrences of the search text'
        }
      },
      required: ['path', 'search', 'replace']
    };
  }
}