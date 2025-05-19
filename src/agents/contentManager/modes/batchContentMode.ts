import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { BatchContentParams, BatchContentResult, ContentOperation } from '../types';
import { ContentOperations } from '../utils/ContentOperations';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';
import { MemoryService } from '../../../database/services/MemoryService';
import { parseWorkspaceContext } from '../../../utils/contextUtils';

/**
 * Mode for executing multiple content operations in a batch
 */
export class BatchContentMode extends BaseMode<BatchContentParams, BatchContentResult> {
  private app: App;
  private embeddingService: EmbeddingService | null = null;
  private searchService: ChromaSearchService | null = null;
  private memoryService: MemoryService | null = null;
  
  /**
   * Create a new BatchContentMode
   * @param app Obsidian app instance
   * @param embeddingService Optional EmbeddingService for updating embeddings
   * @param searchService Optional SearchService for updating embeddings
   * @param memoryService Optional MemoryService for activity recording
   */
  constructor(
    app: App,
    embeddingService?: EmbeddingService | null,
    searchService?: ChromaSearchService | null,
    memoryService?: MemoryService | null
  ) {
    super(
      'batchContent',
      'Batch Content Operations',
      'Execute multiple content operations in a batch',
      '1.0.0'
    );
    
    this.app = app;
    this.embeddingService = embeddingService || null;
    this.searchService = searchService || null;
    this.memoryService = memoryService || null;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the batch operation results
   */
  async execute(params: BatchContentParams): Promise<BatchContentResult> {
    try {
      const { operations, workspaceContext, handoff, sessionId } = params;
      
      // Validate operations before execution
      if (!operations || !Array.isArray(operations) || operations.length === 0) {
        throw new Error('Operations array is empty or not provided');
      }
      
      // Pre-validate all operations to provide better error messages
      operations.forEach((operation, index) => {
        if (!operation.type) {
          throw new Error(`Missing 'type' property in operation at index ${index}`);
        }
        
        if (!operation.params) {
          throw new Error(`Missing 'params' property in operation at index ${index}`);
        }
        
        if (!operation.params.filePath) {
          throw new Error(`Missing 'filePath' property in operation at index ${index}. Each operation must include a 'filePath' parameter.`);
        }
        
        // Validate required parameters based on operation type
        switch (operation.type) {
          case 'create':
          case 'append':
          case 'prepend':
            if (!operation.params.content) {
              throw new Error(`Missing 'content' property in ${operation.type} operation at index ${index}`);
            }
            break;
          case 'replace':
            if (!operation.params.oldContent) {
              throw new Error(`Missing 'oldContent' property in replace operation at index ${index}`);
            }
            if (!operation.params.newContent) {
              throw new Error(`Missing 'newContent' property in replace operation at index ${index}`);
            }
            break;
          case 'replaceByLine':
            if (typeof operation.params.startLine !== 'number') {
              throw new Error(`Missing or invalid 'startLine' property in replaceByLine operation at index ${index}`);
            }
            if (typeof operation.params.endLine !== 'number') {
              throw new Error(`Missing or invalid 'endLine' property in replaceByLine operation at index ${index}`);
            }
            if (!operation.params.newContent) {
              throw new Error(`Missing 'newContent' property in replaceByLine operation at index ${index}`);
            }
            break;
          case 'delete':
            if (!operation.params.content) {
              throw new Error(`Missing 'content' property in delete operation at index ${index}`);
            }
            break;
        }
      });
      
      // Execute operations sequentially to avoid conflicts
      const results: Array<{
        success: boolean;
        error?: string;
        data?: any;
        type: "read" | "create" | "append" | "prepend" | "replace" | "replaceByLine" | "delete";
        filePath: string;
      }> = [];
      
      for (const operation of operations) {
        try {
          let result: any;
          
          // No normalization needed, we're enforcing filePath usage
          
          switch (operation.type) {
            case 'read':
              result = await this.executeReadOperation(operation);
              break;
            case 'create':
              result = await this.executeCreateOperation(operation);
              break;
            case 'append':
              result = await this.executeAppendOperation(operation);
              break;
            case 'prepend':
              result = await this.executePrependOperation(operation);
              break;
            case 'replace':
              result = await this.executeReplaceOperation(operation);
              break;
            case 'replaceByLine':
              result = await this.executeReplaceByLineOperation(operation);
              break;
            case 'delete':
              result = await this.executeDeleteOperation(operation);
              break;
            default:
              throw new Error(`Unknown operation type: ${(operation as any).type}`);
          }
          
          results.push({
            success: true,
            data: result,
            type: operation.type,
            filePath: operation.params.filePath
          });
          
          // For operations that modify content, update embeddings if available
          if (['create', 'append', 'prepend', 'replace', 'replaceByLine', 'delete'].includes(operation.type)) {
            await this.updateEmbeddingsWithChromaDB(
              operation.params.filePath,
              workspaceContext,
              sessionId
            );
          }
        } catch (error: unknown) {
          results.push({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            type: operation.type,
            filePath: operation.params.filePath || 'unknown'
          });
        }
      }
      
      // Record batch activity in workspace memory
      await this.recordBatchActivityWithChromaDB(params, results);
      
      const response = this.prepareResult(
        true,
        { results: results },
        undefined,
        workspaceContext
      );
      
      // Handle handoff if specified
      if (handoff) {
        return this.handleHandoff(handoff, response);
      }
      
      return response;
    } catch (error: unknown) {
      return this.prepareResult(false, undefined, error instanceof Error ? error.message : String(error), params.workspaceContext);
    }
  }
  
  /**
   * Execute a read operation
   * @param operation The read operation to execute
   * @returns Promise that resolves with the operation result
   */
  private async executeReadOperation(operation: Extract<ContentOperation, { type: 'read' }>): Promise<any> {
    const { filePath, limit, offset, includeLineNumbers } = operation.params;
    
    if (typeof limit === 'number' && typeof offset === 'number') {
      const lines = await ContentOperations.readLines(
        this.app,
        filePath,
        offset,
        offset + limit - 1,
        includeLineNumbers
      );
      
      return {
        content: lines.join('\n'),
        filePath,
        lineNumbersIncluded: includeLineNumbers,
        startLine: offset,
        endLine: offset + limit - 1
      };
    } else if (includeLineNumbers) {
      const content = await ContentOperations.readContentWithLineNumbers(this.app, filePath);
      
      return {
        content,
        filePath,
        lineNumbersIncluded: true
      };
    } else {
      const content = await ContentOperations.readContent(this.app, filePath);
      
      return {
        content,
        filePath,
        lineNumbersIncluded: false
      };
    }
  }
  
  /**
   * Execute a create operation
   * @param operation The create operation to execute
   * @returns Promise that resolves with the operation result
   */
  private async executeCreateOperation(operation: Extract<ContentOperation, { type: 'create' }>): Promise<any> {
    const { filePath, content } = operation.params;
    
    const file = await ContentOperations.createContent(this.app, filePath, content);
    
    return {
      filePath,
      created: file.stat.ctime
    };
  }
  
  /**
   * Execute an append operation
   * @param operation The append operation to execute
   * @returns Promise that resolves with the operation result
   */
  private async executeAppendOperation(operation: Extract<ContentOperation, { type: 'append' }>): Promise<any> {
    const { filePath, content } = operation.params;
    
    return await ContentOperations.appendContent(this.app, filePath, content);
  }
  
  /**
   * Execute a prepend operation
   * @param operation The prepend operation to execute
   * @returns Promise that resolves with the operation result
   */
  private async executePrependOperation(operation: Extract<ContentOperation, { type: 'prepend' }>): Promise<any> {
    const { filePath, content } = operation.params;
    
    return await ContentOperations.prependContent(this.app, filePath, content);
  }
  
  /**
   * Execute a replace operation
   * @param operation The replace operation to execute
   * @returns Promise that resolves with the operation result
   */
  private async executeReplaceOperation(operation: Extract<ContentOperation, { type: 'replace' }>): Promise<any> {
    const { filePath, oldContent, newContent } = operation.params;
    
    const replacements = await ContentOperations.replaceContent(
      this.app,
      filePath,
      oldContent,
      newContent
    );
    
    return {
      filePath,
      replacements
    };
  }
  
  /**
   * Execute a replace by line operation
   * @param operation The replace by line operation to execute
   * @returns Promise that resolves with the operation result
   */
  private async executeReplaceByLineOperation(operation: Extract<ContentOperation, { type: 'replaceByLine' }>): Promise<any> {
    const { filePath, startLine, endLine, newContent } = operation.params;
    
    const linesReplaced = await ContentOperations.replaceByLine(
      this.app,
      filePath,
      startLine,
      endLine,
      newContent
    );
    
    return {
      filePath,
      linesReplaced
    };
  }
  
  /**
   * Execute a delete operation
   * @param operation The delete operation to execute
   * @returns Promise that resolves with the operation result
   */
  private async executeDeleteOperation(operation: Extract<ContentOperation, { type: 'delete' }>): Promise<any> {
    const { filePath, content } = operation.params;
    
    const deletions = await ContentOperations.deleteContent(
      this.app,
      filePath,
      content
    );
    
    return {
      filePath,
      deletions
    };
  }
  
  // This function was removed as it's not used
  
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
        
        if (embedding && workspaceId) {
          // Since we're in the else if branch, we know searchService isn't available
          console.log(`Generated embedding for ${filePath}, but searchService not available to store it`);
        }
      }
    } catch (error) {
      console.error('Error updating embeddings with ChromaDB:', error);
      // Don't throw error - embedding update is a secondary operation
      // and should not prevent the primary operation from succeeding
    }
  }
  
  /**
   * Record batch operation activity in workspace memory
   * @param params Batch parameters
   * @param results Batch operation results
   */
  private async recordBatchActivityWithChromaDB(
    params: BatchContentParams,
    results: any[]
  ): Promise<void> {
    try {
      // Skip if no memory service is available
      if (!this.memoryService) {
        return;
      }
      
      // Parse workspace context
      const parsedContext = parseWorkspaceContext(params.workspaceContext);
      
      // Skip if no workspace context is available
      if (!parsedContext?.workspaceId) {
        return;
      }
      
      // Get successful operations and their file paths
      const successfulOps = results.filter(result => result.success);
      const relatedFiles = successfulOps.map(result => result.filePath);
      
      // Create a descriptive content about this batch operation
      const opTypes = successfulOps.map(result => result.type);
      const uniqueOpTypes = [...new Set(opTypes)];
      
      const content = `Performed batch operation with ${successfulOps.length} operations ` +
        `(${uniqueOpTypes.join(', ')}) on ${relatedFiles.length} files.`;
      
      // Record activity using MemoryService
      await this.memoryService.storeMemoryTrace({
        workspaceId: parsedContext.workspaceId,
        workspacePath: parsedContext.workspacePath || [parsedContext.workspaceId],
        activityType: 'research', // Changed from 'edit' to a valid type
        content: content,
        metadata: {
          tool: 'BatchContentMode',
          params: {
            operations: opTypes
          },
          result: {
            files: relatedFiles,
            count: successfulOps.length
          },
          relatedFiles: relatedFiles
        },
        sessionId: params.sessionId || '',
        timestamp: Date.now(),
        importance: 0.7,
        contextLevel: 'workspace', // Changed from 'content' to valid HierarchyType
        tags: ['batch', 'edit', 'content']
      });
    } catch (error) {
      console.error('Error recording batch activity with ChromaDB:', error);
      // Don't throw - activity recording is a secondary operation
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
        operations: {
          type: 'array',
          description: 'Array of operations to perform',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['read', 'create', 'append', 'prepend', 'replace', 'replaceByLine', 'delete'],
                description: 'Type of operation'
              },
              params: {
                type: 'object',
                description: 'Operation-specific parameters. IMPORTANT: All operations require a "filePath" parameter.',
                allOf: [
                  {
                    if: {
                      properties: { 
                        "type": { "enum": ["read"] } 
                      }
                    },
                    then: {
                      properties: {
                        filePath: { type: 'string', description: 'Path to the file to read' },
                        limit: { type: 'number', description: 'Optional number of lines to read' },
                        offset: { type: 'number', description: 'Optional line number to start reading from (1-based)' },
                        includeLineNumbers: { type: 'boolean', description: 'Whether to include line numbers in the output' }
                      },
                      required: ['filePath']
                    }
                  },
                  {
                    if: {
                      properties: { 
                        "type": { "enum": ["create"] }
                      }
                    },
                    then: {
                      properties: {
                        filePath: { type: 'string', description: 'Path to the file to create' },
                        content: { type: 'string', description: 'Content to write to the file' }
                      },
                      required: ['filePath', 'content']
                    }
                  },
                  {
                    if: {
                      properties: { 
                        "type": { "enum": ["append", "prepend"] }
                      }
                    },
                    then: {
                      properties: {
                        filePath: { type: 'string', description: 'Path to the file to modify' },
                        content: { type: 'string', description: 'Content to append/prepend to the file' }
                      },
                      required: ['filePath', 'content']
                    }
                  },
                  {
                    if: {
                      properties: { 
                        "type": { "enum": ["replace"] }
                      }
                    },
                    then: {
                      properties: {
                        filePath: { type: 'string', description: 'Path to the file to modify' },
                        oldContent: { type: 'string', description: 'Content to replace' },
                        newContent: { type: 'string', description: 'Content to replace with' }
                      },
                      required: ['filePath', 'oldContent', 'newContent']
                    }
                  },
                  {
                    if: {
                      properties: { 
                        "type": { "enum": ["replaceByLine"] }
                      }
                    },
                    then: {
                      properties: {
                        filePath: { type: 'string', description: 'Path to the file to modify' },
                        startLine: { type: 'number', description: 'Start line number (1-based)' },
                        endLine: { type: 'number', description: 'End line number (1-based, inclusive)' },
                        newContent: { type: 'string', description: 'Content to replace with' }
                      },
                      required: ['filePath', 'startLine', 'endLine', 'newContent']
                    }
                  },
                  {
                    if: {
                      properties: { 
                        "type": { "enum": ["delete"] }
                      }
                    },
                    then: {
                      properties: {
                        filePath: { type: 'string', description: 'Path to the file to modify' },
                        content: { type: 'string', description: 'Content to delete' }
                      },
                      required: ['filePath', 'content']
                    }
                  }
                ]
              }
            },
            required: ['type', 'params']
          }
        },
        ...this.getCommonParameterSchema()
      },
      required: ['operations']
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
            results: {
              type: 'array',
              description: 'Array of operation results',
              items: {
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
                    description: 'Operation-specific result data'
                  },
                  type: {
                    type: 'string',
                    description: 'Type of operation'
                  },
                  filePath: {
                    type: 'string',
                    description: 'File path for the operation'
                  }
                },
                required: ['success', 'type', 'filePath']
              }
            }
          },
          required: ['results']
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