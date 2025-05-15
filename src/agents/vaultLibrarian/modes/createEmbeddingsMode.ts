import { BaseMode } from '../../baseMode';
import { CreateEmbeddingsParams, CreateEmbeddingsResult } from '../types';
import { VaultLibrarianAgent } from '../vaultLibrarian';
import { ToolActivityEmbedder } from '../tool-activity-embedder';

/**
 * Mode for creating embeddings for a file
 */
export class CreateEmbeddingsMode extends BaseMode<CreateEmbeddingsParams, CreateEmbeddingsResult> {
  private activityEmbedder: ToolActivityEmbedder | null = null;
  
  /**
   * Create a new CreateEmbeddingsMode
   * @param agent VaultLibrarian agent instance
   */
  constructor(private agent: VaultLibrarianAgent) {
    super(
      'createEmbeddings',
      'Create Embeddings',
      'Index content for semantic search',
      '1.0.0'
    );
    
    // Initialize the activity embedder if we have a provider
    if (agent.getProvider()) {
      this.activityEmbedder = new ToolActivityEmbedder(agent.getProvider());
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
      
      if (!filePath) {
        return this.prepareResult(false, undefined, 'File path is required');
      }
      
      // Index the file
      const result = await this.agent.indexFile(filePath, force);
      
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
      return this.prepareResult(false, undefined, `Error creating embeddings: ${error.message}`);
    }
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
    if (!params.workspaceContext?.workspaceId || !this.activityEmbedder) {
      return; // Skip if no workspace context or embedder
    }
    
    try {
      // Initialize the activity embedder
      await this.activityEmbedder.initialize();
      
      // Get workspace path (or use just the ID if no path provided)
      const workspacePath = params.workspaceContext.workspacePath || [params.workspaceContext.workspaceId];
      
      // Create a descriptive content about this indexing operation
      const content = `Indexed file: ${params.filePath}\n` +
                      `Success: ${result.success}\n` +
                      `Chunks created: ${result.chunks || 0}\n` +
                      (result.error ? `Error: ${result.error}\n` : '');
      
      // Record the activity in workspace memory
      await this.activityEmbedder.recordActivity(
        params.workspaceContext.workspaceId,
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