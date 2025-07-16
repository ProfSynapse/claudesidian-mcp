/**
 * WorkspaceRetriever - Handles workspace data retrieval and validation
 * Follows Single Responsibility Principle by focusing only on workspace retrieval
 */

import { WorkspaceService } from '../../../../../../database/services/WorkspaceService';
import { LoadWorkspaceParameters } from '../../../../../../database/types/workspace/ParameterTypes';

export interface WorkspaceRetrievalResult {
  success: boolean;
  workspace?: any;
  children?: Array<{id: string; name: string; hierarchyType: string}>;
  error?: string;
}

/**
 * Service responsible for workspace retrieval and validation
 * Follows SRP by focusing only on workspace data operations
 */
export class WorkspaceRetriever {
  constructor(private workspaceService: WorkspaceService) {}

  /**
   * Retrieve workspace data and children if requested
   */
  async retrieveWorkspace(params: LoadWorkspaceParameters): Promise<WorkspaceRetrievalResult> {
    try {
      // Get the base workspace
      let workspace = await this.workspaceService.getWorkspace(params.id);
      
      if (!workspace) {
        return {
          success: false,
          error: `Workspace with ID ${params.id} not found`
        };
      }

      // Handle specific phase/task if specified
      if (params.specificPhaseId) {
        const specificPhase = await this.workspaceService.getWorkspace(params.specificPhaseId);
        
        if (!specificPhase) {
          return {
            success: false,
            error: `Specific phase/task with ID ${params.specificPhaseId} not found`
          };
        }
        
        // Verify it's part of this workspace
        const rootId = specificPhase.path[0] || specificPhase.id;
        if (rootId !== params.id) {
          return {
            success: false,
            error: `Specific phase/task with ID ${params.specificPhaseId} is not part of workspace ${params.id}`
          };
        }
        
        workspace = specificPhase;
      }
      
      // Update the last accessed timestamp
      await this.workspaceService.updateLastAccessed(workspace.id);
      
      // Get immediate children if requested
      let children: Array<{id: string; name: string; hierarchyType: string}> | undefined = undefined;
      if (params.includeChildren) {
        children = await this.retrieveChildren(workspace.id);
      }

      return {
        success: true,
        workspace,
        children
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve workspace: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Retrieve immediate children of a workspace
   */
  private async retrieveChildren(workspaceId: string): Promise<Array<{id: string; name: string; hierarchyType: string}>> {
    try {
      const children: Array<{id: string; name: string; hierarchyType: string}> = [];
      
      // Get all child workspaces in one call
      const childWorkspaces = await this.workspaceService.getWorkspaces({
        parentId: workspaceId
      });
      
      for (const child of childWorkspaces) {
        children.push({
          id: child.id,
          name: child.name,
          hierarchyType: child.hierarchyType
        });
      }

      return children;
    } catch (error) {
      console.error('Error retrieving workspace children:', error);
      return [];
    }
  }

  /**
   * Validate workspace access permissions
   */
  async validateWorkspaceAccess(workspaceId: string): Promise<{ 
    hasAccess: boolean; 
    error?: string 
  }> {
    try {
      const workspace = await this.workspaceService.getWorkspace(workspaceId);
      
      if (!workspace) {
        return {
          hasAccess: false,
          error: `Workspace with ID ${workspaceId} not found`
        };
      }

      // Additional access checks could be added here
      // For now, if workspace exists, access is granted
      return { hasAccess: true };
    } catch (error) {
      return {
        hasAccess: false,
        error: `Access validation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get workspace hierarchy path
   */
  async getWorkspaceHierarchy(workspaceId: string): Promise<{
    path: string[];
    names: string[];
    levels: string[];
  }> {
    try {
      const workspace = await this.workspaceService.getWorkspace(workspaceId);
      
      if (!workspace) {
        return { path: [], names: [], levels: [] };
      }

      const path = workspace.path || [workspace.id];
      const names: string[] = [];
      const levels: string[] = [];

      // Build full hierarchy information
      for (const pathId of path) {
        try {
          const pathWorkspace = await this.workspaceService.getWorkspace(pathId);
          if (pathWorkspace) {
            names.push(pathWorkspace.name);
            levels.push(pathWorkspace.hierarchyType);
          }
        } catch (error) {
          console.warn(`Failed to get workspace info for path ID ${pathId}:`, error);
          names.push('Unknown');
          levels.push('unknown');
        }
      }

      return { path, names, levels };
    } catch (error) {
      console.error('Error getting workspace hierarchy:', error);
      return { path: [], names: [], levels: [] };
    }
  }
}