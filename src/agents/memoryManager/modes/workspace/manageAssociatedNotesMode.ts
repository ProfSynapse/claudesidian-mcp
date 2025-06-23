import { App, Plugin } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { CommonParameters, CommonResult } from '../../../../types';
import { WorkspaceService } from '../../../../database/services/WorkspaceService';
import { ClaudesidianPlugin } from '../utils/pluginTypes';

/**
 * Parameters for managing associated notes
 */
export interface ManageAssociatedNotesParameters extends CommonParameters {
  /**
   * Workspace ID
   */
  workspaceId: string;
  
  /**
   * Action to perform
   */
  action: 'add' | 'remove' | 'list';
  
  /**
   * File path to add or remove (required for add/remove actions)
   */
  filePath?: string;
}

/**
 * Result for managing associated notes
 */
export interface ManageAssociatedNotesResult extends CommonResult {
  data: {
    /**
     * Current list of associated notes after the operation
     */
    associatedNotes: string[];
    
    /**
     * The action that was performed
     */
    action: string;
    
    /**
     * The file path that was affected (for add/remove)
     */
    filePath?: string;
    
    /**
     * Message describing what happened
     */
    message: string;
  };
}

/**
 * Mode to manage associated notes for a workspace
 */
export class ManageAssociatedNotesMode extends BaseMode<ManageAssociatedNotesParameters, ManageAssociatedNotesResult> {
  private app: App;
  private plugin: Plugin;
  private workspaceService: WorkspaceService | null = null;
  
  constructor(app: App) {
    super(
      'manageAssociatedNotes',
      'Manage Associated Notes',
      'Add, remove, or list associated notes for a workspace',
      '1.0.0'
    );
    this.app = app;
    this.plugin = app.plugins.getPlugin('claudesidian-mcp');
    
    // Safely access the plugin services
    if (this.plugin) {
      const pluginWithServices = this.plugin as ClaudesidianPlugin;
      if (pluginWithServices.services?.workspaceService) {
        this.workspaceService = pluginWithServices.services.workspaceService;
      }
    }
  }
  
  async execute(params: ManageAssociatedNotesParameters): Promise<ManageAssociatedNotesResult> {
    try {
      if (!this.workspaceService) {
        return this.prepareResult(
          false,
          { associatedNotes: [], action: params.action, message: 'Workspace service not available' }
        );
      }
      
      // Validate workspace exists
      const workspace = await this.workspaceService.getWorkspace(params.workspaceId);
      if (!workspace) {
        return this.prepareResult(
          false,
          { associatedNotes: [], action: params.action, message: `Workspace ${params.workspaceId} not found` }
        );
      }
      
      let message = '';
      let currentNotes: string[] = [];
      
      switch (params.action) {
        case 'add':
          if (!params.filePath) {
            return this.prepareResult(
              false,
              { associatedNotes: [], action: params.action, message: 'filePath is required for add action' }
            );
          }
          
          // Check if file exists
          const file = this.app.vault.getAbstractFileByPath(params.filePath);
          if (!file) {
            return this.prepareResult(
              false,
              { associatedNotes: [], action: params.action, filePath: params.filePath, message: `File ${params.filePath} not found` }
            );
          }
          
          await this.workspaceService.addAssociatedNote(params.workspaceId, params.filePath);
          currentNotes = await this.workspaceService.getAssociatedNotes(params.workspaceId);
          message = `Added ${params.filePath} to associated notes`;
          break;
          
        case 'remove':
          if (!params.filePath) {
            return this.prepareResult(
              false,
              { associatedNotes: [], action: params.action, message: 'filePath is required for remove action' }
            );
          }
          
          await this.workspaceService.removeAssociatedNote(params.workspaceId, params.filePath);
          currentNotes = await this.workspaceService.getAssociatedNotes(params.workspaceId);
          message = `Removed ${params.filePath} from associated notes`;
          break;
          
        case 'list':
          currentNotes = await this.workspaceService.getAssociatedNotes(params.workspaceId);
          message = `Retrieved ${currentNotes.length} associated notes`;
          break;
          
        default:
          return this.prepareResult(
            false,
            { associatedNotes: [], action: params.action, message: `Unknown action: ${params.action}` }
          );
      }
      
      return this.prepareResult(
        true,
        {
          associatedNotes: currentNotes,
          action: params.action,
          filePath: params.filePath,
          message
        }
      );
      
    } catch (error: any) {
      return this.prepareResult(
        false,
        { 
          associatedNotes: [], 
          action: params.action, 
          filePath: params.filePath,
          message: `Failed to manage associated notes: ${error.message}` 
        }
      );
    }
  }
  
  getParameterSchema(): Record<string, any> {
    const commonSchema = this.getCommonParameterSchema();
    
    return {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'ID of the workspace to manage'
        },
        action: {
          type: 'string',
          enum: ['add', 'remove', 'list'],
          description: 'Action to perform: add a file, remove a file, or list all associated notes'
        },
        filePath: {
          type: 'string',
          description: 'Path to the file to add or remove (required for add/remove actions)'
        },
        ...commonSchema
      },
      required: ['workspaceId', 'action']
    };
  }
  
  getResultSchema(): Record<string, any> {
    const baseSchema = super.getResultSchema();
    
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        associatedNotes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Current list of associated notes after the operation'
        },
        action: {
          type: 'string',
          description: 'The action that was performed'
        },
        filePath: {
          type: 'string',
          description: 'The file path that was affected (for add/remove actions)'
        },
        message: {
          type: 'string',
          description: 'Message describing what happened'
        }
      },
      required: ['associatedNotes', 'action', 'message']
    };
    
    return baseSchema;
  }
}