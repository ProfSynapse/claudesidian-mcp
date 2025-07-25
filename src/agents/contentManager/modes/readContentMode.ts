import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ReadContentParams, ReadContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';
import {parseWorkspaceContext, extractContextFromParams} from '../../../utils/contextUtils';
import { MemoryService } from '../../../database/services/MemoryService';
import { getErrorMessage, createErrorMessage } from '../../../utils/errorUtils';

/**
 * Mode for reading content from a file
 */
export class ReadContentMode extends BaseMode<ReadContentParams, ReadContentResult> {
  private app: App;
  private memoryService: MemoryService | null = null;
  
  /**
   * Create a new ReadContentMode
   * @param app Obsidian app instance
   * @param memoryService Optional MemoryService for activity recording
   */
  constructor(
    app: App, 
    memoryService?: MemoryService | null
  ) {
    super(
      'readContent',
      'Read Content',
      'Read content from a file in the vault',
      '1.0.0'
    );
    
    this.app = app;
    this.memoryService = memoryService || null;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the file content
   */
  async execute(params: ReadContentParams): Promise<ReadContentResult> {
    try {
      const { filePath, limit, offset, includeLineNumbers, workspaceContext, handoff } = params;
      
      let content: string;
      let startLine: number | undefined;
      let endLine: number | undefined;
      
      // If both limit and offset are specified, read specific lines
      if (typeof limit === 'number' && typeof offset === 'number') {
        startLine = offset;
        endLine = offset + limit - 1;
        const lines = await ContentOperations.readLines(
          this.app,
          filePath,
          startLine,
          endLine,
          includeLineNumbers
        );
        content = lines.join('\n');
      } else if (includeLineNumbers) {
        // Read entire file with line numbers
        content = await ContentOperations.readContentWithLineNumbers(this.app, filePath);
      } else {
        // Read entire file
        content = await ContentOperations.readContent(this.app, filePath);
      }
      
      const resultData = {
        content,
        filePath,
        lineNumbersIncluded: includeLineNumbers,
        startLine,
        endLine
      };
      
      // Record this activity in workspace memory if applicable
      await this.recordActivity(params, resultData);
      
      const result = this.prepareResult(true, resultData, undefined, extractContextFromParams(params), parseWorkspaceContext(workspaceContext) || undefined);
      
      // Handle handoff if specified
      if (handoff) {
        return this.handleHandoff(handoff, result);
      }
      
      return result;
    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Error reading content: ', error), extractContextFromParams(params), parseWorkspaceContext(params.workspaceContext) || undefined);
    }
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    // Create the mode-specific schema
    const modeSchema = {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file to read'
        },
        limit: {
          type: 'number',
          description: 'Optional number of lines to read'
        },
        offset: {
          type: 'number',
          description: 'Optional line number to start reading from (1-based)'
        },
        includeLineNumbers: {
          type: 'boolean',
          description: 'Whether to include line numbers in the output',
          default: false
        }
      },
      required: ['filePath']
    };
    
    // Merge with common schema (workspace context and handoff)
    return this.getMergedSchema(modeSchema);
  }
  
  /**
   * Record content reading activity in workspace memory
   * @param params Parameters used for reading content
   * @param resultData Result data containing content information
   */
  private async recordActivity(
    params: ReadContentParams,
    resultData: {
      content: string;
      filePath: string;
      lineNumbersIncluded?: boolean;
      startLine?: number;
      endLine?: number;
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
    let contentSnippet = resultData.content.substring(0, 100);
    if (resultData.content.length > 100) {
      contentSnippet += '...';
    }
    
    const readDescription = params.limit && params.offset 
      ? `Read lines ${params.offset}-${params.offset + params.limit - 1}` 
      : 'Read full content';
    
    const content = `${readDescription} from ${params.filePath}\nSnippet: ${contentSnippet}`;
    
    try {
      // Record activity using MemoryService - we've already checked it's not null
      await this.memoryService!.storeMemoryTrace({
        workspaceId: parsedContext.workspaceId,
        workspacePath: parsedContext.workspacePath || [parsedContext.workspaceId],
        activityType: 'research', // Most appropriate type for content reading
        content: content,
        metadata: {
          tool: 'ReadContentMode',
          params: {
            filePath: params.filePath,
            limit: params.limit,
            offset: params.offset,
            includeLineNumbers: params.includeLineNumbers
          },
          result: {
            contentLength: content.length,
            startLine: params.offset || 0,
            endLine: params.limit && params.offset !== undefined ? params.offset + params.limit : undefined
          },
          relatedFiles: [params.filePath]
        },
        sessionId: params.sessionId || '',
        timestamp: Date.now(),
        importance: 0.5,
        contextLevel: 'workspace',
        tags: ['read', 'content']
      });
      
      // Auto-track external files as associated notes
      try {
        const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
        const workspaceService = plugin?.services?.workspaceService;
        
        if (workspaceService && parsedContext.workspaceId) {
          // Get the current workspace to check if this file is outside the workspace folder
          const workspace = await workspaceService.getWorkspace(parsedContext.workspaceId);
          
          if (workspace) {
            // Normalize paths for comparison
            const { sanitizePath } = await import('../../../utils/pathUtils');
            const normalizedFilePath = sanitizePath(params.filePath, false);
            const normalizedRootFolder = sanitizePath(workspace.rootFolder, false);
            const rootFolderWithSlash = normalizedRootFolder.endsWith('/') ? 
              normalizedRootFolder : normalizedRootFolder + '/';
            
            // Check if file is outside workspace folder
            const isOutsideWorkspace = normalizedFilePath !== normalizedRootFolder && 
                                     !normalizedFilePath.startsWith(rootFolderWithSlash);
            
            if (isOutsideWorkspace) {
              // Add to workspace's associatedNotes
              await workspaceService.addAssociatedNote(parsedContext.workspaceId, params.filePath);
            }
          }
        }
        
        // Also use the FileEventManager to record the activity across all relevant workspaces
        const fileEventManager = plugin?.services?.fileEventManager;
        
        if (fileEventManager) {
          // This will automatically update all workspaces that contain this file
          await fileEventManager.updateFileActivity(
            params.filePath,
            'view'
          );
        } else {
          // Fallback to direct workspace service if file event manager is not available          
          if (workspaceService && parsedContext.workspaceId) {
            await workspaceService.recordActivity(parsedContext.workspaceId, {
              action: 'view',
              timestamp: Date.now(),
              hierarchyPath: [params.filePath],
              toolName: 'readContent'
            });
          }
        }
      } catch (error) {
        console.warn('Error recording file activity:', getErrorMessage(error));
        // Don't fail the main operation
      }
    } catch (error) {
      // Log but don't fail the main operation
      console.error('Failed to record content reading activity with memory service:', getErrorMessage(error));
    }
  }

  getResultSchema(): any {
    // Use the base result schema from BaseMode, which includes common result properties
    const baseSchema = super.getResultSchema();
    
    // Add mode-specific data properties
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Content of the file'
        },
        filePath: {
          type: 'string',
          description: 'Path to the file'
        },
        lineNumbersIncluded: {
          type: 'boolean',
          description: 'Whether line numbers are included in the content'
        },
        startLine: {
          type: 'number',
          description: 'Starting line if offset was specified'
        },
        endLine: {
          type: 'number',
          description: 'Ending line if limit was specified'
        }
      },
      required: ['content', 'filePath']
    };
    
    return baseSchema;
  }
}