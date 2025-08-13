/**
 * WorkspaceValidator - Handles workspace resolution and validation
 * Follows Single Responsibility Principle by focusing only on workspace concerns
 */

import { WorkspaceService } from "../../../../services/WorkspaceService";
import { parseWorkspaceContext } from '../../../../../../utils/contextUtils';
import { CreateStateParams } from '../../../../types';

export interface WorkspaceResolutionResult {
  success: boolean;
  workspaceId?: string;
  workspace?: any;
  error?: string;
  wasCreated?: boolean;
}

/**
 * Service responsible for workspace resolution and validation
 * Follows SRP by focusing only on workspace-related operations
 */
export class WorkspaceValidator {
  constructor(private workspaceService: WorkspaceService) {}

  /**
   * Resolve workspace ID from parameters or find/create default
   */
  async resolveWorkspace(params: CreateStateParams): Promise<WorkspaceResolutionResult> {
    try {
      // Parse the workspace context using the utility function
      const workspaceCtx = parseWorkspaceContext(params.workspaceContext);
      
      // First check if it's in the parsed context
      if (workspaceCtx && workspaceCtx.workspaceId) {
        const workspace = await this.workspaceService.getWorkspace(workspaceCtx.workspaceId);
        if (workspace) {
          return {
            success: true,
            workspaceId: workspaceCtx.workspaceId,
            workspace,
            wasCreated: false
          };
        } else {
          return {
            success: false,
            error: `Workspace with ID ${workspaceCtx.workspaceId} not found`
          };
        }
      }

      // Try to find the first available workspace
      const workspaces = await this.workspaceService.getWorkspaces({ 
        sortBy: 'lastAccessed', 
        sortOrder: 'desc'
      });
      
      if (workspaces && workspaces.length > 0) {
        const workspace = workspaces[0];
        return {
          success: true,
          workspaceId: workspace.id,
          workspace,
          wasCreated: false
        };
      }

      // Create a default workspace if none exists
      console.log('No workspaces found, creating default workspace');
      const defaultWorkspace = await this.createDefaultWorkspace();
      
      return {
        success: true,
        workspaceId: defaultWorkspace.id,
        workspace: defaultWorkspace,
        wasCreated: true
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to resolve workspace: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate that a workspace exists and is accessible
   */
  async validateWorkspace(workspaceId: string): Promise<WorkspaceResolutionResult> {
    try {
      const workspace = await this.workspaceService.getWorkspace(workspaceId);
      
      if (!workspace) {
        return {
          success: false,
          error: `Workspace with ID ${workspaceId} not found`
        };
      }

      return {
        success: true,
        workspaceId,
        workspace,
        wasCreated: false
      };
    } catch (error) {
      return {
        success: false,
        error: `Error retrieving workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Create a default workspace using simple schema
   */
  private async createDefaultWorkspace(): Promise<any> {
    return await this.workspaceService.createWorkspace({
      name: 'Default Workspace',
      rootFolder: '/',
      created: Date.now(),
      lastAccessed: Date.now(),
      // Optional context for new schema compatibility
      context: {
        purpose: 'Default workspace for general use',
        currentGoal: 'Organize and manage notes',
        status: 'Active and ready to use',
        workflows: [{
          name: 'General Note Taking',
          when: 'When creating or organizing notes',
          steps: ['Create note', 'Add content', 'Organize in folders']
        }],
        keyFiles: [{
          category: 'Getting Started',
          files: {}
        }],
        preferences: ['Keep organized', 'Use clear naming'],
        agents: [],
        nextActions: ['Start creating notes']
      },
      // Legacy fields for backward compatibility - minimal values
      description: 'Automatically created default workspace',
      relatedFolders: [],
      activityHistory: [],
      completionStatus: {}
    });
  }

  /**
   * Validate workspace context format
   */
  validateWorkspaceContext(workspaceContext?: any): {
    isValid: boolean;
    workspaceId?: string;
    error?: string;
  } {
    if (!workspaceContext) {
      return { isValid: true }; // Context is optional
    }

    try {
      const parsed = parseWorkspaceContext(workspaceContext);
      if (parsed && parsed.workspaceId) {
        if (typeof parsed.workspaceId !== 'string') {
          return {
            isValid: false,
            error: 'Workspace ID must be a string'
          };
        }
        return {
          isValid: true,
          workspaceId: parsed.workspaceId
        };
      }
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: `Invalid workspace context format: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}