import { App, TFolder } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CreateEmbeddingsParams, CreateEmbeddingsResult } from '../types';
import { ToolActivityEmbedder } from '../../../database/tool-activity-embedder';
import { ProgressTracker } from '../../../database/utils/progressTracker';
import { parseWorkspaceContext } from '../../../utils/contextUtils';

/**
 * Mode for creating embeddings for a file
 */
export class CreateEmbeddingsMode extends BaseMode<CreateEmbeddingsParams, CreateEmbeddingsResult> {
  private activityEmbedder: ToolActivityEmbedder | null = null;
  private app: App;
  private progressTracker: ProgressTracker;
  
  /**
   * Create a new CreateEmbeddingsMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'createEmbeddings',
      'Create Embeddings',
      'Index content for semantic search',
      '1.0.0'
    );
    
    this.app = app;
    this.progressTracker = new ProgressTracker();
    
    // Activity embedder will be initialized on first use
    this.activityEmbedder = null;
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
      
      // Get services from plugin
      const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
      const indexingService = plugin.services?.indexingService;
      const embeddingManager = plugin.services?.embeddingManager;
      
      if (!indexingService || !embeddingManager) {
        return this.prepareResult(false, undefined, 'Indexing service is not available');
      }
      
      // Check if embeddings are enabled
      if (!embeddingManager.areEmbeddingsEnabled()) {
        return this.prepareResult(false, undefined, 'Embeddings functionality is currently disabled. Please enable embeddings and provide a valid API key in settings to create embeddings.');
      }
      
      // Get file from vault
      const file = this.app.vault.getAbstractFileByPath(filePath);
      
      // Check if it's a file (not a folder) and has .md extension
      if (!file || file instanceof TFolder || !filePath.endsWith('.md')) {
        return this.prepareResult(false, undefined, `File not found or not a markdown file: ${filePath}`);
      }
      
      // Use the already parsed context from above
      
      // Initialize activity embedder if needed
      if (parsedContext?.workspaceId && !this.activityEmbedder) {
        const provider = embeddingManager.getProvider();
        if (provider) {
          try {
            this.activityEmbedder = new ToolActivityEmbedder(provider);
          } catch (error) {
            console.error("Failed to initialize activity embedder:", error);
          }
        }
      }
      
      // Trigger single-file progress update
      this.updateProgress(0, 1, parsedContext?.workspaceId);
      
      // Index the file
      const result = await indexingService.indexFile(filePath, force);
      
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
      // Parse workspace context for error case
      const parsedContext = parseWorkspaceContext(params.workspaceContext);
      
      // Ensure progress is completed even on error
      this.completeProgress(false, parsedContext?.workspaceId, error.message);
      
      return this.prepareResult(false, undefined, `Error creating embeddings: ${error.message}`);
    }
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
   * Record embedding activity in workspace memory
   * @param params Parameters used for indexing
   * @param result Result of indexing operation
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
    
    if (!parsedContext?.workspaceId || !this.activityEmbedder) {
      return; // Skip if no workspace context or embedder
    }
    
    try {
      // Initialize the activity embedder
      await this.activityEmbedder.initialize();
      
      // Get workspace path (or use just the ID if no path provided)
      const workspacePath = parsedContext.workspacePath || [parsedContext.workspaceId];
      
      // Create a descriptive content about this indexing operation
      const content = `Indexed file: ${params.filePath}\n` +
                      `Success: ${result.success}\n` +
                      `Chunks created: ${result.chunks || 0}\n` +
                      (result.error ? `Error: ${result.error}\n` : '');
      
      // Record the activity in workspace memory
      await this.activityEmbedder.recordActivity(
        parsedContext.workspaceId,
        workspacePath,
        'project_plan', // Most appropriate type for indexing
        content,
        {
          tool: 'CreateEmbeddingsMode',
          params: {
            filePath: params.filePath,
            force: params.force
          },
          result: {
            success: result.success,
            chunks: result.chunks
          }
        },
        [params.filePath] // Related files
      );
    } catch (error) {
      // Log but don't fail the main operation
      console.error('Failed to record indexing activity:', error);
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