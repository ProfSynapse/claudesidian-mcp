/**
 * Location: /src/agents/memoryManager/modes/workspaces/LoadWorkspaceMode.ts
 * Purpose: Consolidated workspace loading mode for MemoryManager
 * 
 * This file handles loading a workspace by ID and restoring workspace context
 * and state for the user session.
 * 
 * Used by: MemoryManager agent for workspace loading operations
 * Integrates with: WorkspaceService for accessing workspace data
 */

import { BaseMode } from '../../../baseMode';
import { 
  LoadWorkspaceParameters, 
  LoadWorkspaceResult 
} from '../../../../database/types/workspace/ParameterTypes';
import { ProjectWorkspace } from '../../../../database/types/workspace/WorkspaceTypes';
import { parseWorkspaceContext } from '../../../../utils/contextUtils';
import { createErrorMessage } from '../../../../utils/errorUtils';

/**
 * Mode to load and restore a workspace by ID
 */
export class LoadWorkspaceMode extends BaseMode<LoadWorkspaceParameters, LoadWorkspaceResult> {
  private agent: any;
  
  /**
   * Create a new LoadWorkspaceMode for the consolidated MemoryManager
   * @param agent The MemoryManagerAgent instance
   */
  constructor(agent: any) {
    super(
      'loadWorkspace',
      'Load Workspace',
      'Load a workspace by ID and restore context and state',
      '2.0.0'
    );
    this.agent = agent;
  }
  
  /**
   * Execute the mode to load a workspace
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: LoadWorkspaceParameters): Promise<LoadWorkspaceResult> {
    const startTime = Date.now();
    
    try {
      // Get workspace service from agent
      const workspaceService = await this.agent.getWorkspaceServiceAsync();
      if (!workspaceService) {
        console.error('[LoadWorkspaceMode] WorkspaceService not available');
        return {
          success: false,
          error: 'WorkspaceService not available',
          data: {
            context: '',
            workflow: '',
            keyFiles: {},
            preferences: '',
            nextActions: []
          },
          workspaceContext: typeof params.workspaceContext === 'string' 
            ? parseWorkspaceContext(params.workspaceContext) || undefined
            : params.workspaceContext
        };
      }
      
      // Get the workspace by ID
      let workspace: ProjectWorkspace | undefined;
      try {
        workspace = await workspaceService.getWorkspace(params.id);
      } catch (queryError) {
        console.error('[LoadWorkspaceMode] Failed to load workspace:', queryError);
        return {
          success: false,
          error: `Failed to load workspace: ${queryError instanceof Error ? queryError.message : String(queryError)}`,
          data: {
            context: '',
            workflow: '',
            keyFiles: {},
            preferences: '',
            nextActions: []
          },
          workspaceContext: typeof params.workspaceContext === 'string' 
            ? parseWorkspaceContext(params.workspaceContext) || undefined
            : params.workspaceContext
        };
      }
      
      if (!workspace) {
        console.error('[LoadWorkspaceMode] Workspace not found:', params.id);
        return {
          success: false,
          error: `Workspace with ID '${params.id}' not found`,
          data: {
            context: '',
            workflow: '',
            keyFiles: {},
            preferences: '',
            nextActions: []
          },
          workspaceContext: typeof params.workspaceContext === 'string' 
            ? parseWorkspaceContext(params.workspaceContext) || undefined
            : params.workspaceContext
        };
      }
      
      
      // Update last accessed timestamp
      try {
        await workspaceService.updateLastAccessed(params.id);
      } catch (updateError) {
        console.warn('[LoadWorkspaceMode] Failed to update last accessed timestamp:', updateError);
        // Continue - this is not critical
      }
      
      // Get directory structure if requested
      let directoryInfo = '';
      if (params.includeDirectoryStructure) {
        try {
          directoryInfo = await this.getDirectoryStructure(workspace.rootFolder);
        } catch (dirError) {
          console.warn('[LoadWorkspaceMode] Failed to get directory structure:', dirError);
          directoryInfo = 'Directory structure unavailable';
        }
      }
      
      // Build actionable context briefing
      const context = this.buildContextBriefing(workspace, directoryInfo);
      
      // Build workflow summary
      const workflow = this.buildWorkflowSummary(workspace);
      
      // Extract key files
      const keyFiles = this.extractKeyFiles(workspace);
      
      // Build preferences summary
      const preferences = this.buildPreferences(workspace);
      
      // Get next actions
      const nextActions = this.getNextActions(workspace);
      
      // Update workspace context
      const workspaceContext = {
        workspaceId: workspace.id,
        workspacePath: workspace.path || []
      };
      
      const result = {
        success: true,
        data: {
          context: context,
          workflow: workflow,
          keyFiles: keyFiles,
          preferences: preferences,
          nextActions: nextActions
        },
        workspaceContext: workspaceContext
      };
      
      return result;
      
    } catch (error: any) {
      console.error(`[LoadWorkspaceMode] Unexpected error after ${Date.now() - startTime}ms:`, {
        message: error.message,
        stack: error.stack,
        params: params
      });
      
      return {
        success: false,
        error: createErrorMessage('Unexpected error loading workspace: ', error),
        data: {
          context: '',
          workflow: '',
          keyFiles: {},
          preferences: '',
          nextActions: []
        },
        workspaceContext: typeof params.workspaceContext === 'string' 
          ? parseWorkspaceContext(params.workspaceContext) || undefined
          : params.workspaceContext
      };
    }
  }
  
  /**
   * Build a contextual briefing for the workspace
   */
  private buildContextBriefing(workspace: ProjectWorkspace, directoryInfo: string): string {
    const parts: string[] = [];
    
    // Workspace header
    parts.push(`**${workspace.name}**`);
    if (workspace.description) {
      parts.push(`${workspace.description}`);
    }
    
    // Purpose and goals from modern context
    if (workspace.context?.purpose) {
      parts.push(`**Purpose:** ${workspace.context.purpose}`);
    }
    if (workspace.context?.currentGoal) {
      parts.push(`**Current Goal:** ${workspace.context.currentGoal}`);
    }
    if (workspace.context?.status) {
      parts.push(`**Status:** ${workspace.context.status}`);
    }
    
    // Root folder and structure
    parts.push(`**Root Folder:** ${workspace.rootFolder}`);
    if (directoryInfo) {
      parts.push(`**Directory Structure:**\n${directoryInfo}`);
    }
    
    // Recent activity
    if (workspace.activityHistory && workspace.activityHistory.length > 0) {
      const recentActivity = workspace.activityHistory
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 3)
        .map(activity => `- ${activity.context || activity.action}`)
        .join('\n');
      parts.push(`**Recent Activity:**\n${recentActivity}`);
    }
    
    return parts.join('\n\n');
  }
  
  /**
   * Build a workflow summary
   */
  private buildWorkflowSummary(workspace: ProjectWorkspace): string {
    if (!workspace.context?.workflows || workspace.context.workflows.length === 0) {
      return 'No workflows defined';
    }
    
    const workflows = workspace.context.workflows.map(workflow => {
      const steps = workflow.steps.map(step => `  - ${step}`).join('\n');
      return `**${workflow.name}** (${workflow.when}):\n${steps}`;
    }).join('\n\n');
    
    return workflows;
  }
  
  /**
   * Extract key files into a flat structure
   */
  private extractKeyFiles(workspace: ProjectWorkspace): Record<string, string> {
    const keyFiles: Record<string, string> = {};
    
    if (workspace.context?.keyFiles) {
      workspace.context.keyFiles.forEach(category => {
        Object.entries(category.files).forEach(([name, path]) => {
          keyFiles[name] = path;
        });
      });
    }
    
    return keyFiles;
  }
  
  /**
   * Build preferences summary
   */
  private buildPreferences(workspace: ProjectWorkspace): string {
    const prefs: string[] = [];
    
    if (workspace.context?.preferences && workspace.context.preferences.length > 0) {
      prefs.push(...workspace.context.preferences);
    }
    
    if (workspace.preferences?.userPreferences) {
      prefs.push(...workspace.preferences.userPreferences);
    }
    
    return prefs.length > 0 ? prefs.join('\n- ') : 'No preferences set';
  }
  
  /**
   * Get next actions
   */
  private getNextActions(workspace: ProjectWorkspace): string[] {
    if (workspace.context?.nextActions && workspace.context.nextActions.length > 0) {
      return workspace.context.nextActions;
    }
    
    return ['No next actions defined'];
  }
  
  /**
   * Get directory structure for the workspace folder
   */
  private async getDirectoryStructure(rootFolder: string): Promise<string> {
    try {
      const app = this.agent.getApp();
      const folder = app.vault.getAbstractFileByPath(rootFolder);
      
      if (!folder || !('children' in folder)) {
        return `Folder '${rootFolder}' not found or empty`;
      }
      
      const structure = this.buildDirectoryTree(folder as any, 0, 2); // Max depth 2
      return structure || 'Empty folder';
    } catch (error) {
      return `Error reading directory: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  
  /**
   * Build a directory tree string representation
   */
  private buildDirectoryTree(folder: any, depth: number, maxDepth: number): string {
    if (depth > maxDepth || !folder.children) {
      return '';
    }
    
    const indent = '  '.repeat(depth);
    const items: string[] = [];
    
    // Sort children: folders first, then files
    const children = [...folder.children].sort((a, b) => {
      const aIsFolder = 'children' in a;
      const bIsFolder = 'children' in b;
      
      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;
      return a.name.localeCompare(b.name);
    });
    
    for (const child of children.slice(0, 10)) { // Limit to 10 items per level
      if ('children' in child) {
        // Folder
        items.push(`${indent}📁 ${child.name}/`);
        const subtree = this.buildDirectoryTree(child, depth + 1, maxDepth);
        if (subtree) {
          items.push(subtree);
        }
      } else {
        // File
        items.push(`${indent}📄 ${child.name}`);
      }
    }
    
    if (children.length > 10) {
      items.push(`${indent}... and ${children.length - 10} more items`);
    }
    
    return items.join('\n');
  }
  
  /**
   * Get the parameter schema
   */
  getParameterSchema(): any {
    const modeSchema = {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Workspace ID to load (REQUIRED)'
        },
        includeChildren: {
          type: 'boolean',
          description: 'Include child workspace information'
        },
        includeFileDetails: {
          type: 'boolean',
          description: 'Include detailed file information'
        },
        includeDirectoryStructure: {
          type: 'boolean',
          description: 'Include current directory structure'
        },
        includeSessionContext: {
          type: 'boolean',
          description: 'Include session context information'
        }
      },
      required: ['id']
    };
    
    // Merge with common schema (adds sessionId, workspaceContext, handoff)
    return this.getMergedSchema(modeSchema);
  }
  
  /**
   * Get the result schema
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the operation was successful'
        },
        error: {
          type: 'string',
          description: 'Error message if operation failed'
        },
        data: {
          type: 'object',
          properties: {
            context: {
              type: 'string',
              description: 'Formatted contextual briefing about the workspace'
            },
            workflow: {
              type: 'string',
              description: 'Formatted workflow information'
            },
            keyFiles: {
              type: 'object',
              additionalProperties: {
                type: 'string'
              },
              description: 'Key files as name-path pairs'
            },
            preferences: {
              type: 'string',
              description: 'Formatted user preferences'
            },
            nextActions: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Next actions to take in this workspace'
            }
          }
        },
        workspaceContext: {
          type: 'object',
          properties: {
            workspaceId: {
              type: 'string',
              description: 'Current workspace ID'
            },
            workspacePath: {
              type: 'array',
              items: { type: 'string' },
              description: 'Full path from root workspace'
            }
          }
        }
      },
      required: ['success']
    };
  }
}