import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { AppendContentParams, AppendContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';

/**
 * Mode for appending content to a file
 */
export class AppendContentMode extends BaseMode<AppendContentParams, AppendContentResult> {
  private app: App;
  
  /**
   * Create a new AppendContentMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'appendContent',
      'Append Content',
      'Append content to a file in the vault',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the append result
   */
  async execute(params: AppendContentParams): Promise<AppendContentResult> {
    try {
      const { filePath, content, workspaceContext, handoff } = params;
      
      const result = await ContentOperations.appendContent(this.app, filePath, content);
      
      const response = this.prepareResult(
        true,
        {
          filePath,
          appendedLength: result.appendedLength,
          totalLength: result.totalLength
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
      return this.prepareResult(false, undefined, error.message, params.workspaceContext);
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
          description: 'Path to the file to append to'
        },
        content: {
          type: 'string',
          description: 'Content to append to the file'
        },
        ...this.getCommonParameterSchema()
      },
      required: ['filePath', 'content']
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
            appendedLength: {
              type: 'number',
              description: 'Length of the content appended'
            },
            totalLength: {
              type: 'number',
              description: 'Total length of the file after appending'
            }
          },
          required: ['filePath', 'appendedLength', 'totalLength']
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