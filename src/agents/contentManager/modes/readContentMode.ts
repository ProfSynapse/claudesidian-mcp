import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ReadContentParams, ReadContentResult } from '../types';
import { ContentOperations } from '../utils/ContentOperations';
import { ToolActivityEmbedder } from '../../vaultLibrarian/tool-activity-embedder';
import { DummyEmbeddingProvider } from '../../vaultLibrarian/providers/embeddings-provider';

/**
 * Mode for reading content from a file
 */
export class ReadContentMode extends BaseMode<ReadContentParams, ReadContentResult> {
  private app: App;
  private activityEmbedder: ToolActivityEmbedder | null = null;
  
  /**
   * Create a new ReadContentMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'readContent',
      'Read Content',
      'Read content from a file in the vault',
      '1.0.0'
    );
    
    this.app = app;
    
    // Initialize activity embedder for workspace memory
    this.initializeActivityEmbedder();
  }
  
  /**
   * Initialize activity embedder if needed
   */
  private async initializeActivityEmbedder() {
    try {
      // Create an instance with a dummy provider
      const dummyProvider = new DummyEmbeddingProvider();
      this.activityEmbedder = new ToolActivityEmbedder(dummyProvider);
    } catch (error) {
      console.error('Failed to initialize activity embedder:', error);
      this.activityEmbedder = null;
    }
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
      
      const result = this.prepareResult(
        true,
        resultData,
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
    if (!params.workspaceContext?.workspaceId || !this.activityEmbedder) {
      return; // Skip if no workspace context or embedder
    }
    
    try {
      // Initialize the activity embedder
      await this.activityEmbedder.initialize();
      
      // Get workspace path (or use just the ID if no path provided)
      const workspacePath = params.workspaceContext.workspacePath || [params.workspaceContext.workspaceId];
      
      // Create a descriptive content about this operation
      let contentSnippet = resultData.content.substring(0, 100);
      if (resultData.content.length > 100) {
        contentSnippet += '...';
      }
      
      const readDescription = params.limit && params.offset 
        ? `Read lines ${params.offset}-${params.offset + params.limit - 1}` 
        : 'Read full content';
      
      const content = `${readDescription} from ${params.filePath}\nSnippet: ${contentSnippet}`;
      
      // Record the activity in workspace memory
      await this.activityEmbedder.recordActivity(
        params.workspaceContext.workspaceId,
        workspacePath,
        'research', // Most appropriate type for content reading
        content,
        {
          tool: 'ReadContentMode',
          params: {
            filePath: params.filePath,
            limit: params.limit,
            offset: params.offset,
            includeLineNumbers: params.includeLineNumbers
          },
          result: {
            contentLength: resultData.content.length,
            startLine: resultData.startLine,
            endLine: resultData.endLine
          }
        },
        [resultData.filePath] // Related files
      );
    } catch (error) {
      // Log but don't fail the main operation
      console.error('Failed to record content reading activity:', error);
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