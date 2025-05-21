import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ReplaceContentParams, ReplaceContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';
import { parseWorkspaceContext } from '../../../utils/contextUtils';
import { getErrorMessage, createErrorMessage } from '../../../utils/errorUtils';

/**
 * Mode for replacing content in a file
 */
export class ReplaceContentMode extends BaseMode<ReplaceContentParams, ReplaceContentResult> {
  private app: App;
  private embeddingService: EmbeddingService | null = null;
  private searchService: ChromaSearchService | null = null;
  
  /**
   * Create a new ReplaceContentMode
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
      'replaceContent',
      'Replace Content',
      'Replace content in a file in the vault',
      '1.0.0'
    );
    
    this.app = app;
    this.embeddingService = embeddingService || null;
    this.searchService = searchService || null;
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
      
      // Update embeddings for the file if available
      await this.updateEmbeddingsWithChromaDB(filePath, workspaceContext, sessionId);
      
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
          console.log('Embedding generated for updated content in replaceContentMode, but not stored directly.');
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
              content: `Modified file: ${filePath}`,
              metadata: {
                tool: 'contentManager.replaceContent',
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
          console.warn('Error recording memory trace for file modification:', getErrorMessage(error));
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