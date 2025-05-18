import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CreateContentParams, CreateContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';
import { parseWorkspaceContext } from '../../../utils/contextUtils';

/**
 * Mode for creating a new file with content
 */
export class CreateContentMode extends BaseMode<CreateContentParams, CreateContentResult> {
  private app: App;
  private embeddingService: EmbeddingService | null = null;
  private searchService: ChromaSearchService | null = null;
  
  /**
   * Create a new CreateContentMode
   * @param app Obsidian app instance
   * @param embeddingService Optional EmbeddingService for indexing
   * @param searchService Optional SearchService for indexing
   */
  constructor(
    app: App, 
    embeddingService?: EmbeddingService | null,
    searchService?: ChromaSearchService | null
  ) {
    super(
      'createContent',
      'Create Content',
      'Create a new file with content in the vault',
      '1.0.0'
    );
    
    this.app = app;
    this.embeddingService = embeddingService || null;
    this.searchService = searchService || null;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the creation result
   */
  async execute(params: CreateContentParams): Promise<CreateContentResult> {
    try {
      const { filePath, content, workspaceContext, handoff, sessionId } = params;
      
      const file = await ContentOperations.createContent(this.app, filePath, content);
      
      // Index the file using ChromaDB if available
      await this.indexFileWithChromaDB(filePath, content, workspaceContext, sessionId);
      
      const result = this.prepareResult(
        true,
        {
          filePath,
          created: file.stat.ctime
        },
        undefined,
        workspaceContext
      );
      
      // Handle handoff if specified
      if (handoff) {
        return this.handleHandoff(handoff, result);
      }
      
      return result;
    } catch (error) {
      return this.prepareResult(false, undefined, error.message, params.workspaceContext);
    }
  }
  
  /**
   * Index the file using ChromaDB if available
   * @param filePath Path to the file
   * @param content Content of the file 
   * @param workspaceContext Workspace context
   * @param sessionId Session ID for activity recording
   */
  private async indexFileWithChromaDB(
    filePath: string, 
    content: string, 
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
      
      // Create embedding and index file with ChromaDB if searchService is available
      if (this.searchService) {
        await this.searchService.indexFile(
          filePath,
          workspaceId,
          { 
            force: true,
            sessionId: sessionId
          }
        );
      } 
      // Fallback to using EmbeddingService directly
      else if (this.embeddingService) {
        // Generate embedding for file content
        const embedding = await this.embeddingService.getEmbedding(content);
        
        if (embedding) {
          // Store embedding directly in ChromaDB via FileEmbeddingCollection
          // Skip direct storage as this should be handled by searchService
          console.log('Embedding generated for new content in createContentMode, but not stored directly.');
          // The searchService handles this via indexFile method
          // No action needed here as the architecture uses services
        }
      }
    } catch (error) {
      console.error('Error indexing file with ChromaDB:', error);
      // Don't throw error - indexing is a secondary operation
      // and should not prevent file creation
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
          description: 'Path to the file to create'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file'
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