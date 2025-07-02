import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { PrependContentParams, PrependContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';
import { createErrorMessage, getErrorMessage } from '../../../utils/errorUtils';
import { extractContextFromParams, parseWorkspaceContext } from '../../../utils/contextUtils';
import { MemoryService } from '../../../database/services/MemoryService';

/**
 * Mode for prepending content to a file
 */
export class PrependContentMode extends BaseMode<PrependContentParams, PrependContentResult> {
  private app: App;
  private memoryService: MemoryService | null = null;
  
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
      const { filePath, content, workspaceContext, handoff } = params;
      
      const result = await ContentOperations.prependContent(this.app, filePath, content);
      
      // File change detection and embedding updates are handled automatically by FileEventManager
      
      const resultData = {
        filePath,
        prependedLength: result.prependedLength,
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
      return this.prepareResult(false, undefined, createErrorMessage('Error prepending content: ', error), extractContextFromParams(params), parseWorkspaceContext(params.workspaceContext) || undefined);
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
  
  /**
   * Record content prepending activity in workspace memory
   * @param params Parameters used for prepending content
   * @param resultData Result data containing prepend information
   */
  private async recordActivity(
    params: PrependContentParams,
    resultData: {
      filePath: string;
      prependedLength: number;
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
    
    const content = `Prepended to file ${params.filePath} (${resultData.prependedLength} chars added, ${resultData.totalLength} total)\nContent: ${contentSnippet}`;
    
    try {
      await this.memoryService!.recordActivityTrace(parsedContext.workspaceId, {
        type: 'completion',
        content: content,
        metadata: {
          tool: 'contentManager.prependContent',
          params: {
            filePath: params.filePath,
            prependedLength: resultData.prependedLength,
            totalLength: resultData.totalLength
          },
          result: resultData,
          relatedFiles: [params.filePath]
        },
        sessionId: params.sessionId
      });
    } catch (error) {
      console.error('Failed to record prepend content activity:', getErrorMessage(error));
    }
  }
}