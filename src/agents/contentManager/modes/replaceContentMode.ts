import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ReplaceContentParams, ReplaceContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';
import { createErrorMessage, getErrorMessage } from '../../../utils/errorUtils';
import { extractContextFromParams, parseWorkspaceContext } from '../../../utils/contextUtils';
import { MemoryService } from '../../../database/services/MemoryService';

/**
 * Mode for replacing content in a file
 */
export class ReplaceContentMode extends BaseMode<ReplaceContentParams, ReplaceContentResult> {
  private app: App;
  private memoryService: MemoryService | null = null;
  
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
      const { filePath, oldContent, newContent, similarityThreshold = 0.95, workspaceContext, handoff } = params;
      
      const replacements = await ContentOperations.replaceContent(
        this.app,
        filePath,
        oldContent,
        newContent,
        similarityThreshold
      );
      
      // File change detection and embedding updates are handled automatically by FileEventManager
      
      const resultData = {
        filePath,
        replacements
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
      return this.prepareResult(false, undefined, createErrorMessage('Error replacing content: ', error), extractContextFromParams(params), parseWorkspaceContext(params.workspaceContext) || undefined);
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
  
  /**
   * Record content replacement activity in workspace memory
   * @param params Parameters used for replacing content
   * @param resultData Result data containing replacement information
   */
  private async recordActivity(
    params: ReplaceContentParams,
    resultData: {
      filePath: string;
      replacements: number;
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
    const oldSnippet = params.oldContent.substring(0, 50) + (params.oldContent.length > 50 ? '...' : '');
    const newSnippet = params.newContent.substring(0, 50) + (params.newContent.length > 50 ? '...' : '');
    
    const content = `Replaced content in ${params.filePath} (${resultData.replacements} replacements)\nOld: ${oldSnippet}\nNew: ${newSnippet}`;
    
    try {
      await this.memoryService!.recordActivityTrace(parsedContext.workspaceId, {
        type: 'completion',
        content: content,
        metadata: {
          tool: 'contentManager.replaceContent',
          params: {
            filePath: params.filePath,
            replacements: resultData.replacements,
            similarityThreshold: params.similarityThreshold
          },
          result: resultData,
          relatedFiles: [params.filePath]
        },
        sessionId: params.sessionId
      });
    } catch (error) {
      console.error('Failed to record replace content activity:', getErrorMessage(error));
    }
  }
}