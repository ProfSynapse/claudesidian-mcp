import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CommonParameters, CommonResult } from '../../../types';
import { FileOperations } from '../utils/FileOperations';
import { MemoryService } from '../../../database/services/MemoryService';
import {parseWorkspaceContext, extractContextFromParams} from '../../../utils/contextUtils';
import { createErrorMessage } from '../../../utils/errorUtils';

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
  private memoryService: MemoryService | null = null;
  
  /**
   * Create a new CreateFolderMode
   * @param app Obsidian app instance
   * @param memoryService Optional memory service for activity recording
   */
  constructor(app: App, memoryService?: MemoryService | null) {
    super(
      'createFolder',
      'Create Folder',
      'Create a new folder in the vault',
      '1.0.0'
    );
    this.app = app;
    this.memoryService = memoryService || null;
    
    // Try to get memory service from plugin if not provided
    if (!this.memoryService) {
      try {
        const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
        if (plugin?.services?.memoryService) {
          this.memoryService = plugin.services.memoryService;
        }
      } catch (error) {
        console.error('Failed to get memory service:', error);
      }
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
      const parsedContext = parseWorkspaceContext(params.workspaceContext) || undefined;
  if (parsedContext?.workspaceId) {
        await this.recordActivity(params, result);
      }
      
      return this.prepareResult(true, result, undefined, extractContextFromParams(params), parseWorkspaceContext(params.workspaceContext) || undefined);
    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Failed to create folder: ', error));
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
          description: 'Path of the folder to create (REQUIRED)'
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
    // Parse workspace context
    const parsedContext = parseWorkspaceContext(params.workspaceContext) || undefined;
    
    if (!parsedContext?.workspaceId || !this.memoryService) {
      return; // Skip if no workspace context or memory service
    }
    
    try {
      // Create a descriptive content about this operation
      const content = `${result.existed ? 'Found existing' : 'Created new'} folder: ${params.path}`;
      
      // Record the activity using memory service
      await this.memoryService.recordActivityTrace(
        parsedContext.workspaceId,
        {
          type: 'research', // Using supported activity type
          content,
          metadata: {
            tool: 'CreateFolderMode',
            params: {
              path: params.path
            },
            result: {
              existed: result.existed
            },
            relatedFiles: []
          },
          sessionId: params.sessionId
        }
      );
    } catch (error) {
      // Log but don't fail the main operation
      console.error('Failed to record folder creation activity:', createErrorMessage('', error));
      
      // Try to get memory service from plugin if not available
      if (!this.memoryService) {
        try {
          const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
          if (plugin?.services?.memoryService) {
            this.memoryService = plugin.services.memoryService;
            // Try again with the newly found service
            await this.recordActivity(params, result);
          }
        } catch (retryError) {
          console.error('Error accessing memory service for retry:', createErrorMessage('', retryError));
        }
      }
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
