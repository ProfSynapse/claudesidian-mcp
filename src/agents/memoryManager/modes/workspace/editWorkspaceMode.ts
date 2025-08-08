import { App, Plugin } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { extractContextFromParams, parseWorkspaceContext } from '../../../../utils/contextUtils';
import { 
  EditWorkspaceParameters, 
  WorkspaceResult,
  WorkspaceStatus,
  ProjectWorkspace
} from '../../../../database/workspace-types';
import { WorkspaceService } from "../services/WorkspaceService";
import { createServiceIntegration } from '../../utils/ServiceIntegration';
import { memoryManagerErrorHandler, createMemoryManagerError } from '../../utils/ErrorHandling';

/**
 * Mode to edit an existing workspace with robust service integration and error handling
 */
export class EditWorkspaceMode extends BaseMode<EditWorkspaceParameters, WorkspaceResult> {
  private app: App;
  private serviceIntegration: ReturnType<typeof createServiceIntegration>;
  
  /**
   * Create a new EditWorkspaceMode with enhanced service integration
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'editWorkspace',
      'Edit Workspace',
      'Update an existing workspace properties with comprehensive error handling',
      '1.0.0'
    );
    this.app = app;
    this.serviceIntegration = createServiceIntegration(app, {
      logLevel: 'warn',
      maxRetries: 2,
      fallbackBehavior: 'warn'
    });
  }
  
  /**
   * Get workspace service with robust error handling and retry logic
   */
  private async getWorkspaceService(): Promise<WorkspaceService | null> {
    const result = await this.serviceIntegration.getWorkspaceService();
    
    if (!result.success) {
    }
    
    return result.service;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: EditWorkspaceParameters): Promise<WorkspaceResult> {
    try {
      // Validate parameters
      if (!params.id) {
        return this.prepareResult(false, undefined, 'Workspace ID is required');
      }
      
      // Get the workspace service
      const workspaceService = await this.getWorkspaceService();
      if (!workspaceService) {
        return this.prepareResult(false, undefined, 'Workspace service not available');
      }
      
      // Get the workspace
      const workspace = await workspaceService.getWorkspace(params.id);
      if (!workspace) {
        return this.prepareResult(
          false, 
          undefined, 
          `Workspace with ID ${params.id} not found`
        );
      }
      
      // Prepare updates
      const updates: Partial<ProjectWorkspace> = {};
      
      // Apply basic property updates
      if (params.name !== undefined) updates.name = params.name;
      if (params.description !== undefined) updates.description = params.description;
      if (params.rootFolder !== undefined) updates.rootFolder = params.rootFolder;
      if (params.relatedFolders !== undefined) updates.relatedFolders = params.relatedFolders;
      if (params.relatedFiles !== undefined) updates.relatedFiles = params.relatedFiles;
      if (params.status !== undefined) updates.status = params.status as WorkspaceStatus;
      
      // Merge preferences if provided
      if (params.preferences) {
        updates.preferences = { ...workspace.preferences, ...params.preferences };
      }
      
      // Handle parent change carefully
      if (params.parentId !== undefined && params.parentId !== workspace.parentId) {
        // If changing parent, we need additional validation
        if (params.parentId) {
          const newParent = await workspaceService.getWorkspace(params.parentId);
          
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
          
          // Update the path - WorkspaceService will handle parent-child relationships
          updates.path = [...(newParent.path || []), newParent.id];
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
        }
        
        updates.parentId = params.parentId;
      }
      
      // Add activity entry
      const now = Date.now();
      const activity: {
        timestamp: number,
        action: 'edit' | 'create' | 'view' | 'tool',
        toolName?: string,
        duration?: number,
        hierarchyPath?: string[]
      } = {
        timestamp: now,
        action: 'edit',
        toolName: 'EditWorkspaceMode'
      };
      
      await workspaceService.addActivity(params.id, activity);
      
      // Update the workspace
      await workspaceService.updateWorkspace(params.id, updates);
      
      // Get the updated workspace
      const updatedWorkspace = await workspaceService.getWorkspace(params.id);
      
      const workspaceContext = {
        workspaceId: params.id,
        workspacePath: updatedWorkspace?.path ? [...updatedWorkspace.path, updatedWorkspace.id] : []
      };

      return this.prepareResult(true, {
          workspace: updatedWorkspace
        }, undefined, extractContextFromParams(params), parseWorkspaceContext(workspaceContext) || undefined);
      
    } catch (error: any) {
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
        relatedFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'New individual files to include in workspace context (paths relative to vault root)'
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