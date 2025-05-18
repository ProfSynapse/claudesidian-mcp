import { App, Plugin } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { 
  DeleteWorkspaceParameters, 
  WorkspaceResult
} from '../../../database/workspace-types';
import { WorkspaceService } from '../../../database/services/WorkspaceService';
import { ClaudesidianPlugin } from '../utils/pluginTypes';

/**
 * Mode to delete a workspace
 */
export class DeleteWorkspaceMode extends BaseMode<DeleteWorkspaceParameters, WorkspaceResult> {
  private app: App;
  private plugin: Plugin;
  private workspaceService: WorkspaceService | null = null;
  
  /**
   * Create a new DeleteWorkspaceMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'deleteWorkspace',
      'Delete Workspace',
      'Remove a workspace and optionally its children',
      '1.0.0'
    );
    this.app = app;
    this.plugin = app.plugins.getPlugin('claudesidian-mcp');
    
    // Safely access the workspace service
    if (this.plugin) {
      const pluginWithServices = this.plugin as ClaudesidianPlugin;
      if (pluginWithServices.services && pluginWithServices.services.workspaceService) {
        this.workspaceService = pluginWithServices.services.workspaceService;
      }
    }
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: DeleteWorkspaceParameters): Promise<WorkspaceResult> {
    try {
      // Validate parameters
      if (!params.id) {
        return this.prepareResult(false, undefined, 'Workspace ID is required');
      }
      
      // Get the workspace
      const workspaceService = this.workspaceService;
      if (!workspaceService) {
        return this.prepareResult(false, undefined, 'Workspace service not available');
      }
      
      const workspace = await workspaceService.getWorkspace(params.id);
      if (!workspace) {
        return this.prepareResult(
          false, 
          undefined, 
          `Workspace with ID ${params.id} not found`
        );
      }
      
      // Store the workspace context for the response
      const workspaceContext = {
        workspaceId: params.id,
        workspacePath: [...workspace.path, workspace.id]
      };
      
      // If the workspace has children and deleteChildren is false, check if it's safe to delete
      if (workspace.childWorkspaces.length > 0 && params.deleteChildren !== true) {
        return this.prepareResult(
          false, 
          undefined, 
          `Workspace has ${workspace.childWorkspaces.length} child workspaces. Set deleteChildren to true to delete them as well.`,
          workspaceContext
        );
      }
      
      // Delete the workspace (WorkspaceService will handle parent-child relationships)
      await workspaceService.deleteWorkspace(params.id, {
        deleteChildren: params.deleteChildren,
        preserveSettings: params.preserveSettings
      });
      
      return this.prepareResult(
        true,
        {
          summary: `Workspace "${workspace.name}" deleted successfully`
        },
        undefined,
        workspaceContext
      );
      
    } catch (error) {
      return this.prepareResult(
        false,
        undefined,
        `Failed to delete workspace: ${error.message}`
      );
    }
  }
  
  /**
   * Get the parameter schema
   */
  getParameterSchema(): any {
    const commonSchema = this.getCommonParameterSchema();
    
    return {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID of the workspace to delete'
        },
        deleteChildren: {
          type: 'boolean',
          description: 'Whether to delete child workspaces/phases/tasks'
        },
        preserveSettings: {
          type: 'boolean',
          description: 'Whether to keep history/preferences'
        },
        ...commonSchema
      },
      required: ['id']
    };
  }
}