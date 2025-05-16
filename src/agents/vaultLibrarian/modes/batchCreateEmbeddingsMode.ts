import { TFolder } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { BatchCreateEmbeddingsParams, BatchCreateEmbeddingsResult } from '../types';
import { VaultLibrarianAgent } from '../vaultLibrarian';
import { ToolActivityEmbedder } from '../tool-activity-embedder';

/**
 * Mode for batch creating embeddings for multiple files
 */
export class BatchCreateEmbeddingsMode extends BaseMode<BatchCreateEmbeddingsParams, BatchCreateEmbeddingsResult> {
  private activityEmbedder: ToolActivityEmbedder | null = null;
  
  /**
   * Create a new BatchCreateEmbeddingsMode
   * @param agent VaultLibrarian agent instance
   */
  constructor(private agent: VaultLibrarianAgent) {
    super(
      'batchCreateEmbeddings',
      'Batch Create Embeddings',
      'Index multiple files for semantic search',
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
  async execute(params: BatchCreateEmbeddingsParams): Promise<BatchCreateEmbeddingsResult> {
    // Generate an operation ID for this batch
    const operationId = `batch-embeddings-${Date.now()}`;
    
    try {
      const { filePaths, force, workspaceContext, handoff } = params;
      
      if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
        return this.prepareResult(false, undefined, 'File paths array is required and must not be empty');
      }
      
      // Validate files exist
      const validFilePaths = [];
      for (const path of filePaths) {
        const file = this.agent.app.vault.getAbstractFileByPath(path);
        // Check if it's a file and has .md extension
        if (file && !(file instanceof TFolder) && path.endsWith('.md')) {
          validFilePaths.push(path);
        }
      }
      
      if (validFilePaths.length === 0) {
        return this.prepareResult(false, undefined, 'No valid markdown files found in the provided paths');
      }
      
      // Initial progress update
      this.updateProgress(0, validFilePaths.length, operationId);
      
      // Batch index the files with force defaulting to false if undefined
      const result = await this.processFilesWithProgress(validFilePaths, force || false, operationId);
      
      // Final progress update and completion
      this.updateProgress(result.processed, validFilePaths.length, operationId);
      this.completeProgress(result.failed === 0, operationId, 
                           result.failed > 0 ? `Failed to index ${result.failed} files` : undefined);
      
      // Record this activity if in a workspace context
      await this.recordActivity(params, result);
      
      // Prepare result with workspace context
      const response = this.prepareResult(
        result.success,
        {
          results: result.results,
          processed: result.processed,
          failed: result.failed
        },
        undefined,
        workspaceContext
      );
      
      // Handle handoff if requested
      if (handoff) {
        return this.handleHandoff(handoff, response);
      }
      
      return response;
    } catch (error) {
      // Ensure progress is completed even on error
      this.completeProgress(false, operationId, error.message);
      
      return this.prepareResult(false, undefined, `Error batch creating embeddings: ${error.message}`);
    }
  }
  
  /**
   * Process files with progress updates
   * @param filePaths Paths to process
   * @param force Whether to force processing
   * @param operationId Operation ID for progress tracking
   */
  private async processFilesWithProgress(
    filePaths: string[], 
    force: boolean, 
    operationId: string
  ): Promise<{
    success: boolean;
    results: Array<{
      success: boolean;
      filePath: string;
      chunks?: number;
      error?: string;
    }>;
    processed: number;
    failed: number;
  }> {
    const results = [];
    let processed = 0;
    let failed = 0;
    // Get settings safely using "as any" to bypass TypeScript errors
    const memorySettings = ((this.agent as any).settings) || {};
    const batchSize = memorySettings.batchSize || 10;
    const delay = memorySettings.processingDelay || 1000;
    
    // Process in smaller batches
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      
      // Process this batch
      const batchResults = await Promise.all(
        batch.map(async filePath => {
          try {
            const result = await this.agent.indexFile(filePath, force);
            processed++;
            if (!result.success) failed++;
            
            // Update progress after each file
            this.updateProgress(processed, filePaths.length, operationId);
            
            return result;
          } catch (error) {
            processed++;
            failed++;
            
            // Update progress after each file
            this.updateProgress(processed, filePaths.length, operationId);
            
            return {
              success: false,
              filePath,
              error: error.message
            };
          }
        })
      );
      
      // Add results to the overall results array
      results.push(...batchResults);
      
      // Pause between batches to avoid freezing the UI
      if (i + batchSize < filePaths.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return {
      success: failed === 0,
      results,
      processed,
      failed
    };
  }
  
  /**
   * Update the progress UI
   * @param processed Number of files processed
   * @param total Total number of files
   * @param operationId Operation ID for progress tracking
   */
  private updateProgress(processed: number, total: number, operationId: string): void {
    // Use the global progress handler if available
    // @ts-ignore - Using global methods for inter-component communication
    if (window.mcpProgressHandlers && window.mcpProgressHandlers.updateProgress) {
      // @ts-ignore
      window.mcpProgressHandlers.updateProgress({
        processed,
        total,
        remaining: total - processed,
        operationId
      });
    }
  }
  
  /**
   * Complete the progress UI
   * @param success Whether processing was successful
   * @param operationId Operation ID for progress tracking
   * @param error Optional error message
   */
  private completeProgress(success: boolean, operationId: string, error?: string): void {
    // Use the global completion handler if available
    // @ts-ignore - Using global methods for inter-component communication
    if (window.mcpProgressHandlers && window.mcpProgressHandlers.completeProgress) {
      // @ts-ignore
      window.mcpProgressHandlers.completeProgress({
        success,
        processed: 0, // We don't know the exact count here
        failed: 0,
        error,
        operationId
      });
    }
  }
  
  /**
   * Record batch embedding activity in workspace memory
   * @param params Parameters used for batch indexing
   * @param result Result of batch indexing operation
   */
  private async recordActivity(
    params: BatchCreateEmbeddingsParams,
    result: {
      success: boolean;
      results: Array<{
        success: boolean;
        filePath: string;
        chunks?: number;
        error?: string;
      }>;
      processed: number;
      failed: number;
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
      
      // Create a descriptive content about this batch indexing operation
      const successfulFiles = result.results.filter(r => r.success).map(r => r.filePath);
      const failedFiles = result.results.filter(r => !r.success).map(r => r.filePath);
      
      const content = `Batch indexed ${result.processed} files\n` +
                      `Success: ${result.success}\n` +
                      `Files processed: ${result.processed}\n` +
                      `Files failed: ${result.failed}\n` +
                      (successfulFiles.length > 0 ? `Successful files: ${successfulFiles.join(', ')}\n` : '') +
                      (failedFiles.length > 0 ? `Failed files: ${failedFiles.join(', ')}\n` : '');
      
      // Record the activity in workspace memory
      await this.activityEmbedder.recordActivity(
        params.workspaceContext.workspaceId,
        workspacePath,
        'project_plan', // Most appropriate type for indexing
        content,
        {
          tool: 'BatchCreateEmbeddingsMode',
          params: {
            filePaths: params.filePaths,
            force: params.force
          },
          result: {
            success: result.success,
            processed: result.processed,
            failed: result.failed
          }
        },
        params.filePaths // Related files
      );
    } catch (error) {
      // Log but don't fail the main operation
      console.error('Failed to record batch indexing activity:', error);
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
        filePaths: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Paths to the files to index'
        },
        force: {
          type: 'boolean',
          description: 'Whether to force re-indexing even if files have not changed',
          default: false
        },
        ...this.getCommonParameterSchema()
      },
      required: ['filePaths']
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
          description: 'Whether the operation succeeded overall'
        },
        error: {
          type: 'string',
          description: 'Error message if success is false'
        },
        data: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    description: 'Whether this file was indexed successfully'
                  },
                  filePath: {
                    type: 'string',
                    description: 'Path to the indexed file'
                  },
                  chunks: {
                    type: 'number',
                    description: 'Number of chunks created for the file'
                  },
                  error: {
                    type: 'string',
                    description: 'Error message if indexing this file failed'
                  }
                },
                required: ['success', 'filePath']
              },
              description: 'Results for each file'
            },
            processed: {
              type: 'number',
              description: 'Number of files processed'
            },
            failed: {
              type: 'number',
              description: 'Number of files that failed to index'
            }
          },
          required: ['results', 'processed', 'failed']
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