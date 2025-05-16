import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { 
  EditWorkspaceParameters, 
  WorkspaceResult,
  WorkspaceStatus
} from '../../../database/workspace-types';
import { IndexedDBWorkspaceDatabase } from '../../../database/workspace-db';

/**
 * Mode to edit an existing workspace
 */
export class EditWorkspaceMode extends BaseMode<EditWorkspaceParameters, WorkspaceResult> {
  private app: App;
  private workspaceDb: IndexedDBWorkspaceDatabase;
  
  /**
   * Create a new EditWorkspaceMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'editWorkspace',
      'Edit Workspace',
      'Update an existing workspace properties',
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
  async execute(params: EditWorkspaceParameters): Promise<WorkspaceResult> {
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
      
      // Prepare updates
      const updates: Record<string, any> = {};
      
      // Apply basic property updates
      if (params.name !== undefined) updates.name = params.name;
      if (params.description !== undefined) updates.description = params.description;
      if (params.rootFolder !== undefined) updates.rootFolder = params.rootFolder;
      if (params.relatedFolders !== undefined) updates.relatedFolders = params.relatedFolders;
      if (params.status !== undefined) updates.status = params.status;
      
      // Merge preferences if provided
      if (params.preferences) {
        updates.preferences = { ...workspace.preferences, ...params.preferences };
      }
      
      // Handle parent change carefully
      if (params.parentId !== undefined && params.parentId !== workspace.parentId) {
        // If changing parent, we need additional validation
        if (params.parentId) {
          const newParent = await this.workspaceDb.getWorkspace(params.parentId);
          
          if (!newParent) {
            return this.prepareResult(
              false, 
              undefined, 
              `New parent workspace with ID ${params.parentId} not found`
            );
          }
          
          // Validate parent-child relationship based on hierarchy type
          if (workspace.hierarchyType === 'phase' && newParent.hierarchyType !== 'workspace') {
            return this.prepareResult(
              false, 
              undefined, 
              'A phase can only be under a workspace, not another phase or task'
            );
          }
          
          if (workspace.hierarchyType === 'task' && newParent.hierarchyType !== 'phase') {
            return this.prepareResult(
              false, 
              undefined, 
              'A task can only be under a phase, not a workspace or another task'
            );
          }
          
          // Update the path
          updates.path = [...newParent.path, newParent.id];
          
          // Add to new parent's children
          await this.workspaceDb.updateWorkspace(newParent.id, {
            childWorkspaces: [...newParent.childWorkspaces, workspace.id]
          });
          
          // Remove from old parent's children if applicable
          if (workspace.parentId) {
            const oldParent = await this.workspaceDb.getWorkspace(workspace.parentId);
            if (oldParent) {
              await this.workspaceDb.updateWorkspace(oldParent.id, {
                childWorkspaces: oldParent.childWorkspaces.filter((id: string) => id !== workspace.id)
              });
            }
          }
        } else {
          // Removing parent (making it a root workspace)
          // This is only allowed for workspaces, not phases or tasks
          if (workspace.hierarchyType !== 'workspace') {
            return this.prepareResult(
              false, 
              undefined, 
              `Cannot remove parent from a ${workspace.hierarchyType} - only workspaces can be root level`
            );
          }
          
          updates.path = [];
          
          // Remove from old parent's children
          if (workspace.parentId) {
            const oldParent = await this.workspaceDb.getWorkspace(workspace.parentId);
            if (oldParent) {
              await this.workspaceDb.updateWorkspace(oldParent.id, {
                childWorkspaces: oldParent.childWorkspaces.filter((id: string) => id !== workspace.id)
              });
            }
          }
        }
        
        updates.parentId = params.parentId;
      }
      
      // Add activity entry
      const now = Date.now();
      const activityHistory = [...workspace.activityHistory, {
        timestamp: now,
        action: 'edit',
        toolName: 'EditWorkspaceMode'
      }];
      
      updates.activityHistory = activityHistory;
      updates.lastAccessed = now;
      
      // Update the workspace
      await this.workspaceDb.updateWorkspace(params.id, updates);
      
      // Get the updated workspace
      const updatedWorkspace = await this.workspaceDb.getWorkspace(params.id);
      
      const workspaceContext = {
        workspaceId: params.id,
        workspacePath: updatedWorkspace?.path ? [...updatedWorkspace.path, updatedWorkspace.id] : []
      };

      return this.prepareResult(
        true,
        {
          workspace: updatedWorkspace
        },
        undefined,
        workspaceContext
      );
      
    } catch (error) {
      return this.prepareResult(
        false,
        undefined,
        `Failed to edit workspace: ${error.message}`
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
          description: 'ID of the workspace to edit'
        },
        name: {
          type: 'string',
          description: 'New name for the workspace'
        },
        description: {
          type: 'string',
          description: 'New description for the workspace'
        },
        rootFolder: {
          type: 'string',
          description: 'New root folder path'
        },
        relatedFolders: {
          type: 'array',
          items: { type: 'string' },
          description: 'New related folders'
        },
        preferences: {
          type: 'object',
          description: 'Updated custom settings (will be merged with existing)'
        },
        status: {
          type: 'string',
          enum: ['active', 'paused', 'completed'],
          description: 'New workspace status'
        },
        parentId: {
          type: 'string',
          description: 'New parent workspace/phase ID'
        },
        ...commonSchema
      },
      required: ['id']
    };
  }
}