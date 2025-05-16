import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CommonParameters, CommonResult, DEFAULT_MEMORY_SETTINGS } from '../../../types';
import { FileOperations } from '../utils/FileOperations';
import { ToolActivityEmbedder } from '../../../database/tool-activity-embedder';
import { OpenAIProvider } from '../../../database/providers/openai-provider';

/**
 * Parameters for create folder mode
 */
interface CreateFolderParameters extends CommonParameters {
  /**
   * Path of the folder to create
   */
  path: string;
}

/**
 * Result for create folder mode
 */
interface CreateFolderResult extends CommonResult {
  data?: {
    path: string;
    existed?: boolean;
  };
}

/**
 * Mode to create a new folder
 */
export class CreateFolderMode extends BaseMode<CreateFolderParameters, CreateFolderResult> {
  private app: App;
  private activityEmbedder: ToolActivityEmbedder | null = null;
  
  /**
   * Create a new CreateFolderMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'createFolder',
      'Create Folder',
      'Create a new folder in the vault',
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
      // Try to get settings from the plugin
      let memorySettings = { ...DEFAULT_MEMORY_SETTINGS };
      
      if (this.app.plugins) {
        const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
        if (plugin?.settings?.settings?.memory) {
          memorySettings = plugin.settings.settings.memory;
        }
      }
      
      // Only create provider if embeddings are enabled and API key is available
      if (memorySettings.embeddingsEnabled && memorySettings.openaiApiKey) {
        const provider = new OpenAIProvider(memorySettings);
        this.activityEmbedder = new ToolActivityEmbedder(provider);
      } else {
        // Don't attempt to create a provider without an API key
        console.log('Activity embedder disabled: embeddings not enabled or API key missing');
        this.activityEmbedder = null;
      }
    } catch (error) {
      console.error('Failed to initialize activity embedder:', error);
      this.activityEmbedder = null;
    }
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: CreateFolderParameters): Promise<CreateFolderResult> {
    try {
      // Validate parameters
      if (!params.path) {
        return this.prepareResult(false, undefined, 'Path is required');
      }
      
      // Create the folder using existing utility if available
      let result: { path: string; existed: boolean };
      
      if (typeof FileOperations?.createFolder === 'function') {
        const existed = await FileOperations.createFolder(this.app, params.path);
        result = { path: params.path, existed };
      } 
      // Otherwise use default implementation
      else {
        // Check if folder already exists
        const existingFolder = this.app.vault.getAbstractFileByPath(params.path);
        if (existingFolder) {
          result = { path: params.path, existed: true };
        } else {
          // Create the folder
          await this.app.vault.createFolder(params.path);
          result = { path: params.path, existed: false };
        }
      }
      
      // Record this activity in workspace memory if applicable
      if (params.workspaceContext?.workspaceId) {
        await this.recordActivity(params, result);
      }
      
      return this.prepareResult(
        true, 
        result, 
        undefined, 
        params.workspaceContext
      );
    } catch (error) {
      return this.prepareResult(false, undefined, `Failed to create folder: ${error.message}`);
    }
  }
  
  /**
   * Get the parameter schema
   */
  getParameterSchema(): Record<string, any> {
    // Create the mode-specific schema
    const modeSchema = {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path of the folder to create'
        }
      },
      required: ['path']
    };
    
    // Merge with common schema (workspace context and handoff)
    return this.getMergedSchema(modeSchema);
  }
  
  /**
   * Record folder creation activity in workspace memory
   * @param params Parameters used for folder creation
   * @param result Result of folder creation operation
   */
  private async recordActivity(
    params: CreateFolderParameters, 
    result: { path: string; existed: boolean }
  ): Promise<void> {
    if (!params.workspaceContext?.workspaceId || !this.activityEmbedder) {
      return; // Skip if no workspace context or embedder
    }
    
    try {
      // Initialize the activity embedder - wrapped in try/catch to handle initialization failures gracefully
      try {
        await this.activityEmbedder.initialize();
      } catch (initError) {
        console.log('Activity embedder initialization failed, skipping activity recording:', initError);
        return;
      }
      
      // Get workspace path (or use just the ID if no path provided)
      const workspacePath = params.workspaceContext.workspacePath || [params.workspaceContext.workspaceId];
      
      // Create a descriptive content about this operation
      const content = `${result.existed ? 'Found existing' : 'Created new'} folder: ${params.path}`;
      
      // Record the activity in workspace memory
      await this.activityEmbedder.recordActivity(
        params.workspaceContext.workspaceId,
        workspacePath,
        'research', // Most appropriate available type for folder operations
        content,
        {
          tool: 'CreateFolderMode',
          params: {
            path: params.path
          },
          result: {
            existed: result.existed
          }
        }
      );
    } catch (error) {
      // Log but don't fail the main operation
      console.error('Failed to record folder creation activity:', error);
    }
  }

  /**
   * Get the result schema
   */
  getResultSchema(): Record<string, any> {
    const baseSchema = super.getResultSchema();
    
    // Extend the base schema to include our specific data
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        path: { 
          type: 'string',
          description: 'Path of the created folder'
        },
        existed: {
          type: 'boolean',
          description: 'Whether the folder already existed'
        }
      }
    };
    
    return baseSchema;
  }
}
