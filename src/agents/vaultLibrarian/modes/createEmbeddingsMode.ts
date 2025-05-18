import { App, TFolder } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CreateEmbeddingsParams, CreateEmbeddingsResult } from '../types';
import { ProgressTracker } from '../../../database/utils/progressTracker';
import { parseWorkspaceContext } from '../../../utils/contextUtils';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';
import { MemoryService } from '../../../database/services/MemoryService';

/**
 * Mode for creating embeddings for a file
 */
export class CreateEmbeddingsMode extends BaseMode<CreateEmbeddingsParams, CreateEmbeddingsResult> {
  private app: App;
  private progressTracker: ProgressTracker;
  private embeddingService: EmbeddingService | null = null;
  private searchService: ChromaSearchService | null = null;
  private memoryService: MemoryService | null = null;
  
  /**
   * Create a new CreateEmbeddingsMode
   * @param app Obsidian app instance
   * @param memoryService Memory service instance
   * @param embeddingService Embedding service instance
   */
  constructor(
    app: App,
    memoryService?: MemoryService | null,
    embeddingService?: EmbeddingService | null
  ) {
    super(
      'createEmbeddings',
      'Create Embeddings',
      'Index content for semantic search',
      '1.0.0'
    );
    
    this.app = app;
    this.progressTracker = new ProgressTracker();
    this.memoryService = memoryService || null;
    this.embeddingService = embeddingService || null;
    
    // Initialize ChromaDB services if not provided and available from plugin
    try {
      if (!this.memoryService || !this.embeddingService || !this.searchService) {
        const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
        
        if (plugin?.services) {
          if (!this.embeddingService && plugin.services.embeddingService) {
            this.embeddingService = plugin.services.embeddingService;
          }
          
          if (!this.searchService && plugin.services.searchService) {
            this.searchService = plugin.services.searchService;
          }
          
          if (!this.memoryService && plugin.services.memoryService) {
            this.memoryService = plugin.services.memoryService;
          }
        }
      }
    } catch (error) {
      console.error('Error initializing ChromaDB services in CreateEmbeddingsMode:', error);
    }
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  async execute(params: CreateEmbeddingsParams): Promise<CreateEmbeddingsResult> {
    try {
      const { filePath, force, workspaceContext, handoff } = params;
      
      // Parse workspace context early for use throughout the method
      const parsedContext = parseWorkspaceContext(workspaceContext);
      
      if (!filePath) {
        return this.prepareResult(false, undefined, 'File path is required');
      }
      
      // Ensure we have the required services
      if (!this.searchService || !this.embeddingService) {
        // Try to get services from plugin
        const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
        if (plugin?.services) {
          this.searchService = plugin.services.searchService || null;
          this.embeddingService = plugin.services.embeddingService || null;
          this.memoryService = plugin.services.memoryService || null;
        }
        
        // If still no services, return error
        if (!this.searchService || !this.embeddingService) {
          return this.prepareResult(false, undefined, 'ChromaDB services are not available. Make sure the plugin is properly configured.');
        }
      }
      
      // Execute embedding creation
      return await this.executeEmbedding(params);
    } catch (error) {
      // Parse workspace context for error case
      const parsedContext = parseWorkspaceContext(params.workspaceContext);
      
      // Ensure progress is completed even on error
      this.completeProgress(false, parsedContext?.workspaceId, error.message);
      
      return this.prepareResult(false, undefined, `Error creating embeddings: ${error.message}`);
    }
  }
  
  /**
   * Execute embedding creation
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  private async executeEmbedding(params: CreateEmbeddingsParams): Promise<CreateEmbeddingsResult> {
    const { filePath, force, workspaceContext, handoff } = params;
    
    // Parse workspace context
    const parsedContext = parseWorkspaceContext(workspaceContext);
    
    // Check if embedding service is available
    if (!this.embeddingService) {
      return this.prepareResult(false, undefined, 'Embedding service is not available');
    }
    
    if (!this.searchService) {
      return this.prepareResult(false, undefined, 'Search service is not available');
    }
    
    // Check if embeddings are enabled
    if (!this.embeddingService.areEmbeddingsEnabled()) {
      return this.prepareResult(false, undefined, 'Embeddings functionality is currently disabled. Please enable embeddings and provide a valid API key in settings to create embeddings.');
    }
    
    // Get file from vault
    const file = this.app.vault.getAbstractFileByPath(filePath);
    
    // Check if it's a file (not a folder) and has .md extension
    if (!file || file instanceof TFolder || !filePath.endsWith('.md')) {
      return this.prepareResult(false, undefined, `File not found or not a markdown file: ${filePath}`);
    }
    
    
    // Trigger single-file progress update
    this.updateProgress(0, 1, parsedContext?.workspaceId);
    
    try {
      // Index the file using ChromaDB searchService
      const fileId = await this.searchService.indexFile(
        filePath,
        parsedContext?.workspaceId, // Add to workspace if available
        { force } // Pass metadata with force flag
      );
      
      // Determine success and get chunks
      const result = {
        success: !!fileId,
        filePath,
        chunks: 1, // Default to 1 chunk for ChromaDB (we can't easily get actual chunk count)
        error: fileId ? undefined : 'Failed to index file'
      };
      
      // Trigger progress completion
      this.updateProgress(1, 1, parsedContext?.workspaceId);
      this.completeProgress(result.success, parsedContext?.workspaceId);
      
      // Record this activity if in a workspace context
      await this.recordActivity(params, result);
      
      // Prepare result with workspace context
      const response = this.prepareResult(
        result.success,
        {
          filePath: result.filePath,
          chunks: result.chunks
        },
        result.error,
        workspaceContext
      );
      
      // Handle handoff if requested
      if (handoff) {
        return this.handleHandoff(handoff, response);
      }
      
      return response;
    } catch (error) {
      // Ensure progress is completed on error
      this.completeProgress(false, parsedContext?.workspaceId, error.message);
      
      return this.prepareResult(false, undefined, `Error creating embeddings with ChromaDB: ${error.message}`);
    }
  }
  
  
  /**
   * Record embedding activity in workspace memory
   */
  private async recordActivity(
    params: CreateEmbeddingsParams,
    result: {
      success: boolean;
      chunks?: number;
      error?: string;
      filePath: string;
    }
  ): Promise<void> {
    // Parse workspace context
    const parsedContext = parseWorkspaceContext(params.workspaceContext);
    
    if (!parsedContext?.workspaceId) {
      return; // Skip if no workspace context
    }
    
    // Use memory service directly if available
    if (this.memoryService) {
      try {
        // Create activity content
        const content = `Indexed file: ${params.filePath}\n` +
                        `Success: ${result.success}\n` +
                        `Chunks created: ${result.chunks || 0}\n` +
                        (result.error ? `Error: ${result.error}\n` : '');
        
        // Record activity trace using memory service
        await this.memoryService.recordActivityTrace(
          parsedContext.workspaceId,
          {
            type: 'research',
            content,
            metadata: {
              tool: 'CreateEmbeddingsMode',
              params: {
                filePath: params.filePath,
                force: params.force
              },
              result: {
                success: result.success,
                chunks: result.chunks
              },
              relatedFiles: [params.filePath]
            },
            sessionId: params.sessionId
          }
        );
        
        return;
      } catch (error) {
        console.error('Error recording activity with memory service:', error);
        
        // Try to get memory service from plugin if not available
        try {
          const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
          if (plugin?.services?.memoryService) {
            this.memoryService = plugin.services.memoryService;
            await this.recordActivity(params, result);
            return;
          }
        } catch (error) {
          console.error('Error accessing memory service from plugin:', error);
        }
      }
    }
    
    console.warn('Unable to record embedding activity - memory service unavailable');
  }
  
  /**
   * Update the progress UI
   * @param processed Number of files processed
   * @param total Total number of files
   * @param operationId Optional operation ID
   */
  private updateProgress(processed: number, total: number, operationId?: string): void {
    this.progressTracker.updateProgress({
      processed,
      total,
      remaining: total - processed,
      operationId: operationId || `create-embeddings-${Date.now()}`
    });
  }
  
  /**
   * Complete the progress UI
   * @param success Whether processing was successful
   * @param operationId Optional operation ID
   * @param error Optional error message
   */
  private completeProgress(success: boolean, operationId?: string, error?: string): void {
    this.progressTracker.completeProgress({
      success,
      processed: 1,
      failed: success ? 0 : 1,
      error,
      operationId: operationId || `create-embeddings-${Date.now()}`
    });
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
          description: 'Path to the file to index'
        },
        force: {
          type: 'boolean',
          description: 'Whether to force re-indexing even if the file has not changed',
          default: false
        },
        ...this.getCommonParameterSchema()
      },
      required: ['filePath']
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
              description: 'Path to the indexed file'
            },
            chunks: {
              type: 'number',
              description: 'Number of chunks created for the file'
            }
          },
          required: ['filePath']
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
          description: 'Result of the handoff operation'
        }
      },
      required: ['success']
    };
  }
}