import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ReplaceContentParams, ReplaceContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';
import { createErrorMessage } from '../../../utils/errorUtils';

/**
 * Mode for replacing content in a file
 */
export class ReplaceContentMode extends BaseMode<ReplaceContentParams, ReplaceContentResult> {
  private app: App;
  
  /**
   * Create a new ReplaceContentMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'replaceContent',
      'Replace Content',
      'Replace content in a file in the vault',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the replace result
   */
  async execute(params: ReplaceContentParams): Promise<ReplaceContentResult> {
    try {
      const { filePath, oldContent, newContent, similarityThreshold = 0.95, workspaceContext, handoff, sessionId } = params;
      
      const replacements = await ContentOperations.replaceContent(
        this.app,
        filePath,
        oldContent,
        newContent,
        similarityThreshold
      );
      
      // File change detection and embedding updates are handled automatically by FileEventManager
      
      const response = this.prepareResult(
        true,
        {
          filePath,
          replacements
        },
        undefined,
        workspaceContext
      );
      
      // Handle handoff if specified
      if (handoff) {
        return this.handleHandoff(handoff, response);
      }
      
      return response;
    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Error replacing content: ', error), params.workspaceContext);
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
        oldContent: {
          type: 'string',
          description: 'Content to replace'
        },
        newContent: {
          type: 'string',
          description: 'Content to replace with'
        },
        similarityThreshold: {
          type: 'number',
          description: 'Threshold for fuzzy matching (0.0 to 1.0, where 1.0 is exact match)',
          default: 0.95,
          minimum: 0.0,
          maximum: 1.0
        },
        ...this.getCommonParameterSchema()
      },
      required: ['filePath', 'oldContent', 'newContent']
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
            }
          },
          required: ['filePath', 'replacements']
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