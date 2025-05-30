import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { AppendContentParams, AppendContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';
import { parseWorkspaceContext } from '../../../utils/contextUtils';
import { getErrorMessage, createErrorMessage } from '../../../utils/errorUtils';

/**
 * Mode for appending content to a file
 */
export class AppendContentMode extends BaseMode<AppendContentParams, AppendContentResult> {
  private app: App;
  private embeddingService: EmbeddingService | null = null;
  private searchService: ChromaSearchService | null = null;
  
  /**
   * Create a new AppendContentMode
   * @param app Obsidian app instance
   * @param embeddingService Optional EmbeddingService for updating embeddings
   * @param searchService Optional SearchService for updating embeddings
   */
  constructor(
    app: App,
    embeddingService?: EmbeddingService | null,
    searchService?: ChromaSearchService | null
  ) {
    super(
      'appendContent',
      'Append Content',
      'Append content to a file in the vault',
      '1.0.0'
    );
    
    this.app = app;
    this.embeddingService = embeddingService || null;
    this.searchService = searchService || null;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the append result
   */
  async execute(params: AppendContentParams): Promise<AppendContentResult> {
    try {
      const { filePath, content, workspaceContext, handoff, sessionId } = params;
      
      const result = await ContentOperations.appendContent(this.app, filePath, content);
      
      // Update embeddings for the file if available
      await this.updateEmbeddingsWithChromaDB(filePath, workspaceContext, sessionId);
      
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
      return this.prepareResult(false, undefined, createErrorMessage('Error appending content: ', error), params.workspaceContext);
    }
  }
  
  /**
   * Update the file embeddings using ChromaDB if available
   * @param filePath Path to the file
   * @param workspaceContext Workspace context
   * @param sessionId Session ID for activity recording
   */
  private async updateEmbeddingsWithChromaDB(
    filePath: string,
    workspaceContext?: any,
    sessionId?: string
  ): Promise<void> {
    try {
      // Skip if no ChromaDB services available
      if (!this.searchService && !this.embeddingService) {
        return;
      }
      
      // Parse workspace context for workspace ID
      const parsedContext = parseWorkspaceContext(workspaceContext);
      const workspaceId = parsedContext?.workspaceId;
      
      // Update file index with ChromaDB if searchService is available
      if (this.searchService) {
        await this.searchService.indexFile(
          filePath,
          workspaceId,
          { 
            force: true, // Force reindexing since content changed
            sessionId: sessionId
          }
        );
      } 
      // Fallback to using EmbeddingService directly
      else if (this.embeddingService) {
        // First, get the updated file content
        const updatedContent = await ContentOperations.readContent(this.app, filePath);
        
        // Generate embedding for updated file content
        const embedding = await this.embeddingService.getEmbedding(updatedContent);
        
        if (embedding) {
          // Store embedding directly in ChromaDB via FileEmbeddingCollection
          // Skip direct storage as this should be handled by searchService
          console.log('Embedding generated for updated content in appendContentMode, but not stored directly.');
          // The searchService handles this via indexFile method
          // No action needed here as the architecture uses services
        }
      }
      
      // Record memory trace for file modification to track activity
      // This is critical for workspace recent files and associated notes
      if (workspaceId && sessionId) {
        try {
          // Get the memoryService from the plugin
          const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
          const memoryService = plugin?.services?.memoryService;
          
          if (memoryService) {
            // Store a memory trace with the file path in relatedFiles
            await memoryService.storeMemoryTrace({
              workspaceId,
              workspacePath: parsedContext?.workspacePath || [workspaceId],
              contextLevel: 'workspace',
              activityType: 'research',
              content: `Appended content to file: ${filePath}`,
              metadata: {
                tool: 'contentManager.appendContent',
                params: { filePath },
                result: { success: true },
                relatedFiles: [filePath]  // This is critical for tracking recent files
              },
              sessionId: sessionId,
              timestamp: Date.now(),
              importance: 0.6,
              tags: ['file-modification']
            });
            
            // Optionally record in workspace activity history if available
            const workspaceService = plugin?.services?.workspaceService;
            if (workspaceService) {
              await workspaceService.recordActivity(workspaceId, {
                action: 'edit',
                timestamp: Date.now(),
                hierarchyPath: [filePath]
              });
            }
          }
        } catch (error) {
          console.warn('Error recording memory trace for file append:', getErrorMessage(error));
          // Don't throw - this is supplementary tracking
        }
      }
    } catch (error) {
      console.error('Error updating embeddings with ChromaDB:', getErrorMessage(error));
      // Don't throw error - embedding update is a secondary operation
      // and should not prevent the primary operation from succeeding
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