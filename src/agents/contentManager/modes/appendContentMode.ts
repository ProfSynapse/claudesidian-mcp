import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { AppendContentParams, AppendContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';
import { createErrorMessage, getErrorMessage } from '../../../utils/errorUtils';
import { extractContextFromParams, parseWorkspaceContext } from '../../../utils/contextUtils';
import { MemoryService } from '../../../database/services/MemoryService';

/**
 * Mode for appending content to a file
 */
export class AppendContentMode extends BaseMode<AppendContentParams, AppendContentResult> {
  private app: App;
  private memoryService: MemoryService | null = null;
  
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
      
      // File change detection and embedding updates are handled automatically by FileEventManager
      
      const resultData = {
        filePath,
        appendedLength: result.appendedLength,
        totalLength: result.totalLength
      };
      
      // Record session activity for memory tracking
      await this.recordActivity(params, resultData);
      
      const response = this.prepareResult(true, resultData, undefined, extractContextFromParams(params), parseWorkspaceContext(workspaceContext) || undefined);
      
      // Handle handoff if specified
      if (handoff) {
        return this.handleHandoff(handoff, response);
      }
      
      return response;
    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Error appending content: ', error), extractContextFromParams(params), parseWorkspaceContext(params.workspaceContext) || undefined);
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
  
  /**
   * Record content appending activity in workspace memory
   * @param params Parameters used for appending content
   * @param resultData Result data containing append information
   */
  private async recordActivity(
    params: AppendContentParams,
    resultData: {
      filePath: string;
      appendedLength: number;
      totalLength: number;
    }
  ): Promise<void> {
    // Parse workspace context
    const parsedContext = parseWorkspaceContext(params.workspaceContext) || undefined;
    
    // Skip if no workspace context
    if (!parsedContext?.workspaceId) {
      return;
    }
    
    // Skip if no memory service
    if (!this.memoryService) {
      try {
        // Try to get the memory service from the plugin
        const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
        if (plugin?.services?.memoryService) {
          this.memoryService = plugin.services.memoryService;
        } else {
          // No memory service available, skip activity recording
          return;
        }
      } catch (error) {
        console.error('Failed to get memory service from plugin:', getErrorMessage(error));
        return;
      }
    }
    
    // Create a descriptive content about this operation
    let contentSnippet = params.content.substring(0, 100);
    if (params.content.length > 100) {
      contentSnippet += '...';
    }
    
    const content = `Appended to file ${params.filePath} (${resultData.appendedLength} chars added, ${resultData.totalLength} total)\nContent: ${contentSnippet}`;
    
    try {
      await this.memoryService!.recordActivityTrace(parsedContext.workspaceId, {
        type: 'completion',
        content: content,
        metadata: {
          tool: 'contentManager.appendContent',
          params: {
            filePath: params.filePath,
            appendedLength: resultData.appendedLength,
            totalLength: resultData.totalLength
          },
          result: resultData,
          relatedFiles: [params.filePath]
        },
        sessionId: params.sessionId
      });
    } catch (error) {
      console.error('Failed to record append content activity:', getErrorMessage(error));
    }
  }
}