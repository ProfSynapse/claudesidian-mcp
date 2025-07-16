/**
 * WorkspaceContextBuilder - Builds workspace context for state restoration
 * Follows Single Responsibility Principle by focusing only on workspace context building
 */

import { WorkspaceService } from '../../../../../../database/services/WorkspaceService';

export interface WorkspaceContextResult {
  success: boolean;
  workspace?: any;
  error?: string;
}

/**
 * Service responsible for building workspace context during state restoration
 * Follows SRP by focusing only on workspace context operations
 */
export class WorkspaceContextBuilder {
  constructor(private workspaceService: WorkspaceService) {}

  /**
   * Get workspace details for restoration
   */
  async getWorkspaceContext(workspaceId: string): Promise<WorkspaceContextResult> {
    try {
      const workspace = await this.workspaceService.getWorkspace(workspaceId);
      
      if (!workspace) {
        return {
          success: false,
          error: `Restored workspace with ID ${workspaceId} not found`
        };
      }

      return {
        success: true,
        workspace
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get workspace context: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate workspace context for restoration
   */
  validateWorkspaceContext(workspace: any): boolean {
    return workspace && workspace.id && workspace.rootFolder;
  }

  /**
   * Extract workspace metadata for restoration
   */
  extractWorkspaceMetadata(workspace: any): {
    name: string;
    description?: string;
    hierarchyType: string;
    rootFolder: string;
    path: string[];
  } {
    return {
      name: workspace.name || 'Unknown Workspace',
      description: workspace.description,
      hierarchyType: workspace.hierarchyType || 'workspace',
      rootFolder: workspace.rootFolder || '/',
      path: workspace.path || []
    };
  }
}