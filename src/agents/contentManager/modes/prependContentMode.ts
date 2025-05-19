import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { PrependContentParams, PrependContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';
import { parseWorkspaceContext } from '../../../utils/contextUtils';
import { getErrorMessage, createErrorMessage } from '../../../utils/errorUtils';

/**
 * Mode for prepending content to a file
 */
export class PrependContentMode extends BaseMode<PrependContentParams, PrependContentResult> {
  private app: App;
  private embeddingService: EmbeddingService | null = null;
  private searchService: ChromaSearchService | null = null;
  
  /**
   * Create a new PrependContentMode
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
      'prependContent',
      'Prepend Content',
      'Prepend content to a file in the vault',
      '1.0.0'
    );
    
    this.app = app;
    this.embeddingService = embeddingService || null;
    this.searchService = searchService || null;
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
      await this.updateEmbeddingsWithChromaDB(filePath, workspaceContext, sessionId);
      
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
          console.log('Embedding generated for updated content in prependContentMode, but not stored directly.');
          // The searchService handles this via indexFile method
          // No action needed here as the architecture uses services
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