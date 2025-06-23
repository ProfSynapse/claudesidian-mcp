import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { PrependContentParams, PrependContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';
import { createErrorMessage } from '../../../utils/errorUtils';

/**
 * Mode for prepending content to a file
 */
export class PrependContentMode extends BaseMode<PrependContentParams, PrependContentResult> {
  private app: App;
  
  /**
   * Create a new PrependContentMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'prependContent',
      'Prepend Content',
      'Prepend content to a file in the vault',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the prepend result
   */
  async execute(params: PrependContentParams): Promise<PrependContentResult> {
    try {
      const { filePath, content, workspaceContext, handoff, sessionId } = params;
      
      const result = await ContentOperations.prependContent(this.app, filePath, content);
      
      // Update embeddings for the file if available
      // File change detection and embedding updates are handled automatically by FileEventManager
      
      const response = this.prepareResult(
        true,
        {
          filePath,
          prependedLength: result.prependedLength,
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
      return this.prepareResult(false, undefined, createErrorMessage('Error prepending content: ', error), params.workspaceContext);
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
          description: 'Path to the file to prepend to'
        },
        content: {
          type: 'string',
          description: 'Content to prepend to the file'
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
            prependedLength: {
              type: 'number',
              description: 'Length of the content prepended'
            },
            totalLength: {
              type: 'number',
              description: 'Total length of the file after prepending'
            }
          },
          required: ['filePath', 'prependedLength', 'totalLength']
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