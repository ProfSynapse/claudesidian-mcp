import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ReplaceByLineParams, ReplaceByLineResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';

/**
 * Mode for replacing content by line number in a file
 */
export class ReplaceByLineMode extends BaseMode<ReplaceByLineParams, ReplaceByLineResult> {
  private app: App;
  
  /**
   * Create a new ReplaceByLineMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'replaceByLine',
      'Replace By Line',
      'Replace content by line number in a file in the vault',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the replace result
   */
  async execute(params: ReplaceByLineParams): Promise<ReplaceByLineResult> {
    try {
      const { filePath, startLine, endLine, newContent, workspaceContext, handoff, sessionId } = params;
      
      const linesReplaced = await ContentOperations.replaceByLine(
        this.app,
        filePath,
        startLine,
        endLine,
        newContent
      );
      
      // File change detection and embedding updates are handled automatically by FileEventManager
      
      const response = this.prepareResult(
        true,
        {
          filePath,
          linesReplaced
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.prepareResult(false, undefined, errorMessage, params.workspaceContext);
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
        startLine: {
          type: 'number',
          description: 'Start line number (1-based)'
        },
        endLine: {
          type: 'number',
          description: 'End line number (1-based, inclusive)'
        },
        newContent: {
          type: 'string',
          description: 'Content to replace with'
        },
        ...this.getCommonParameterSchema()
      },
      required: ['filePath', 'startLine', 'endLine', 'newContent']
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
            linesReplaced: {
              type: 'number',
              description: 'Number of lines replaced'
            }
          },
          required: ['filePath', 'linesReplaced']
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