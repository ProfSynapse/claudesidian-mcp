import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CreateContentParams, CreateContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';
import { createErrorMessage } from '../../../utils/errorUtils';
import { extractContextFromParams, parseWorkspaceContext } from '../../../utils/contextUtils';

/**
 * Mode for creating a new file with content
 * Follows Single Responsibility Principle - only handles content creation
 * File change detection and embedding updates are handled automatically by FileEventManager
 */
export class CreateContentMode extends BaseMode<CreateContentParams, CreateContentResult> {
  private app: App;
  
  /**
   * Create a new CreateContentMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'createContent',
      'Create Content',
      'Create a new file with content in the vault',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the creation result
   */
  async execute(params: CreateContentParams): Promise<CreateContentResult> {
    try {
      const { filePath, content, workspaceContext, handoff, sessionId } = params;
      
      // Validate parameters
      if (!filePath) {
        return this.prepareResult(false, undefined, 'File path is required', extractContextFromParams(params), parseWorkspaceContext(workspaceContext) || undefined);
      }
      
      if (content === undefined || content === null) {
        return this.prepareResult(false, undefined, 'Content is required', extractContextFromParams(params), parseWorkspaceContext(workspaceContext) || undefined);
      }
      
      // Create file
      const file = await ContentOperations.createContent(this.app, filePath, content);
      
      // File change detection and embedding updates are handled automatically by FileEventManager
      
      const result = this.prepareResult(true, {
          filePath,
          created: file.stat.ctime
        }, undefined, extractContextFromParams(params), parseWorkspaceContext(workspaceContext) || undefined);
      
      // Handle handoff if specified
      if (handoff) {
        return this.handleHandoff(handoff, result);
      }
      
      return result;
    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Error creating file: ', error), extractContextFromParams(params), parseWorkspaceContext(params.workspaceContext) || undefined);
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
          description: 'Path to the file to create (REQUIRED)'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file (REQUIRED)'
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
              description: 'Path to the created file'
            },
            created: {
              type: 'number',
              description: 'Creation timestamp'
            }
          },
          required: ['filePath', 'created']
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