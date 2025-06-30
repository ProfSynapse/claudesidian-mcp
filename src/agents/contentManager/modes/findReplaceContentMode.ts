import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { FindReplaceContentParams, FindReplaceContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';

import { createErrorMessage } from '../../../utils/errorUtils';
import { extractContextFromParams, parseWorkspaceContext } from '../../../utils/contextUtils';

/**
 * Mode for find and replace operations in a file
 */
export class FindReplaceContentMode extends BaseMode<FindReplaceContentParams, FindReplaceContentResult> {
  private app: App;
  
  /**
   * Create a new FindReplaceContentMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'findReplaceContent',
      'Find and Replace Content',
      'Find and replace text in a file in the vault',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the find and replace result
   */
  async execute(params: FindReplaceContentParams): Promise<FindReplaceContentResult> {
    try {
      const { 
        filePath, 
        findText, 
        replaceText, 
        replaceAll = false, 
        caseSensitive = true, 
        wholeWord = false,
        workspaceContext, 
        handoff, 
        sessionId 
      } = params;
      
      // Get the original content before modification for diff-based embedding updates
      let oldContent: string | undefined;
      try {
        oldContent = await ContentOperations.readContent(this.app, filePath);
      } catch (error) {
        console.warn(`Could not read original content for ${filePath}:`, error);
      }
      
      const replacements = await ContentOperations.findReplaceContent(
        this.app,
        filePath,
        findText,
        replaceText,
        replaceAll,
        caseSensitive,
        wholeWord
      );
      
      // File change detection and embedding updates are handled automatically by FileEventManager
      
      const response = this.prepareResult(true, {
          filePath,
          replacements,
          findText,
          replaceText
        }, undefined, extractContextFromParams(params), parseWorkspaceContext(workspaceContext) || undefined);
      
      // Handle handoff if specified
      if (handoff) {
        return this.handleHandoff(handoff, response);
      }
      
      return response;
    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Error in find and replace: ', error), extractContextFromParams(params), parseWorkspaceContext(params.workspaceContext) || undefined);
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
        filePath: {
          type: 'string',
          description: 'Path to the file to modify'
        },
        findText: {
          type: 'string',
          description: 'Text to find'
        },
        replaceText: {
          type: 'string',
          description: 'Text to replace with'
        },
        replaceAll: {
          type: 'boolean',
          description: 'Whether to replace all occurrences or just the first one',
          default: false
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Whether the search should be case sensitive',
          default: true
        },
        wholeWord: {
          type: 'boolean',
          description: 'Whether to use whole word matching',
          default: false
        },
        ...this.getCommonParameterSchema()
      },
      required: ['filePath', 'findText', 'replaceText']
    };
  }
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the operation succeeded'
        },
        error: {
          type: 'string',
          description: 'Error message if success is false'
        },
        data: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Path to the file'
            },
            replacements: {
              type: 'number',
              description: 'Number of replacements made'
            },
            findText: {
              type: 'string',
              description: 'Text that was searched for'
            },
            replaceText: {
              type: 'string',
              description: 'Text that was used as replacement'
            }
          },
          required: ['filePath', 'replacements', 'findText', 'replaceText']
        },
        workspaceContext: {
          type: 'object',
          properties: {
            workspaceId: {
              type: 'string',
              description: 'ID of the workspace'
            },
            workspacePath: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Path of the workspace'
            },
            activeWorkspace: {
              type: 'boolean',
              description: 'Whether this is the active workspace'
            }
          }
        },
        handoffResult: {
          type: 'object',
          description: 'Result of handoff operation if handoff was specified'
        }
      },
      required: ['success']
    };
  }
}