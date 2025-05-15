import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { 
  DeleteWorkspaceParameters, 
  WorkspaceResult
} from '../../vaultLibrarian/workspace-types';
import { IndexedDBWorkspaceDatabase } from '../../vaultLibrarian/db/workspace-db';

/**
 * Mode to delete a workspace
 */
export class DeleteWorkspaceMode extends BaseMode<DeleteWorkspaceParameters, WorkspaceResult> {
  private app: App;
  private workspaceDb: IndexedDBWorkspaceDatabase;
  
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
    this.workspaceDb = new IndexedDBWorkspaceDatabase();
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: DeleteWorkspaceParameters): Promise<WorkspaceResult> {
    try {
      // Initialize database connection if needed
      await this.workspaceDb.initialize();
      
      // Validate parameters
      if (!params.id) {
        return this.prepareResult(false, undefined, 'Workspace ID is required');
      }
      
      // Get the workspace
      const workspace = await this.workspaceDb.getWorkspace(params.id);
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
        workspacePath: [...workspace.path, workspace.id],
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
      
      // Delete the workspace
      await this.workspaceDb.deleteWorkspace(params.id, {
        deleteChildren: params.deleteChildren,
        preserveSettings: params.preserveSettings
      });
      
      // If this workspace has a parent, update its children list
      if (workspace.parentId) {
        const parent = await this.workspaceDb.getWorkspace(workspace.parentId);
        if (parent) {
          await this.workspaceDb.updateWorkspace(parent.id, {
            childWorkspaces: parent.childWorkspaces.filter((id: string) => id !== params.id),
            lastAccessed: Date.now()
          });
        }
      }
      
      return {
        success: true,
        data: {
          summary: `Workspace "${workspace.name}" deleted successfully`
        },
        workspaceContext
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete workspace: ${error.message}`
      };
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