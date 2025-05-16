import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { 
  LoadWorkspaceParameters, 
  LoadWorkspaceResult
} from '../../../database/workspace-types';
import { IndexedDBWorkspaceDatabase } from '../../../database/workspace-db';
import { WorkspaceCacheManager } from '../../../database/workspace-cache';

/**
 * Mode to load a workspace as the active context
 */
export class LoadWorkspaceMode extends BaseMode<LoadWorkspaceParameters, LoadWorkspaceResult> {
  private app: App;
  private workspaceDb: IndexedDBWorkspaceDatabase;
  private cacheManager: WorkspaceCacheManager;
  
  /**
   * Create a new LoadWorkspaceMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'loadWorkspace',
      'Load Workspace',
      'Load a workspace as the active context',
      '1.0.0'
    );
    this.app = app;
    this.workspaceDb = new IndexedDBWorkspaceDatabase();
    this.cacheManager = new WorkspaceCacheManager();
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: LoadWorkspaceParameters): Promise<LoadWorkspaceResult> {
    try {
      // Initialize database and cache
      await this.workspaceDb.initialize();
      await this.cacheManager.initialize();
      
      // Validate parameters
      if (!params.id) {
        return this.prepareResult(false, undefined, 'Workspace ID is required');
      }
      
      // Get the target workspace
      let workspace = await this.workspaceDb.getWorkspace(params.id);
      if (!workspace) {
        return this.prepareResult(
          false, 
          undefined, 
          `Workspace with ID ${params.id} not found`
        );
      }
      
      // If specificPhaseId is provided, navigate to that node
      if (params.specificPhaseId) {
        const specificPhase = await this.workspaceDb.getWorkspace(params.specificPhaseId);
        if (!specificPhase) {
          return this.prepareResult(
            false, 
            undefined, 
            `Specific phase/task with ID ${params.specificPhaseId} not found`
          );
        }
        
        // Verify it's part of this workspace
        const rootId = specificPhase.path[0] || specificPhase.id;
        if (rootId !== params.id) {
          return this.prepareResult(
            false, 
            undefined, 
            `Specific phase/task with ID ${params.specificPhaseId} is not part of workspace ${params.id}`
          );
        }
        
        workspace = specificPhase;
      }
      
      // Update the last accessed timestamp
      await this.workspaceDb.updateLastAccessed(workspace.id);
      
      // Preload cache based on context depth
      const contextDepth = params.contextDepth || 'standard';
      const maxItems = contextDepth === 'minimal' ? 10 : 
                      contextDepth === 'standard' ? 50 : 100;
      
      const cache = await this.cacheManager.getWorkspaceCache(workspace.id, maxItems);
      
      // Get immediate children if requested
      let children = undefined;
      if (params.includeChildren) {
        children = [];
        for (const childId of workspace.childWorkspaces) {
          const child = await this.workspaceDb.getWorkspace(childId);
          if (child) {
            children.push({
              id: child.id,
              name: child.name,
              hierarchyType: child.hierarchyType
            });
          }
        }
      }
      
      // Generate workspace summary
      const summary = await this.generateWorkspaceSummary(workspace);
      
      // Gather key context items
      const recentFiles = await this.getRecentFiles(workspace);
      const keyFiles = await this.getKeyFiles(workspace);
      const relatedConcepts = await this.getRelatedConcepts(workspace);
      
      // Create workspace context
      const workspaceContext = {
        workspaceId: workspace.id,
        workspacePath: [...workspace.path, workspace.id],
        activeWorkspace: true
      };

      // Prepare result
      return this.prepareResult(
        true,
        {
          workspace: {
            id: workspace.id,
            name: workspace.name,
            description: workspace.description,
            rootFolder: workspace.rootFolder,
            summary,
            hierarchyType: workspace.hierarchyType,
            path: workspace.path,
            children
          },
          context: {
            recentFiles,
            keyFiles,
            relatedConcepts
          }
        },
        undefined,
        workspaceContext
      );
      
    } catch (error) {
      return this.prepareResult(
        false,
        {
          workspace: undefined,
          context: {
            recentFiles: [],
            keyFiles: [],
            relatedConcepts: []
          }
        },
        `Failed to load workspace: ${error.message}`
      );
    }
  }
  
  /**
   * Generate a summary of the workspace
   */
  private async generateWorkspaceSummary(workspace: {
    id: string;
    name: string;
    description?: string;
    rootFolder: string;
    hierarchyType: string;
    childWorkspaces: string[];
    status: string;
    activityHistory?: Array<{action: string; timestamp: number}>;
    path: string[];
  }): Promise<string> {
    // In a real implementation, this would analyze content and activity
    // to create a meaningful summary
    
    let summary = `${workspace.name}`;
    if (workspace.description) {
      summary += `: ${workspace.description}`;
    }
    
    // Add hierarchy information
    if (workspace.hierarchyType === 'workspace') {
      summary += ` (Main workspace with ${workspace.childWorkspaces.length} phases)`;
    } else if (workspace.hierarchyType === 'phase') {
      summary += ` (Phase with ${workspace.childWorkspaces.length} tasks)`;
    } else {
      summary += ` (Task)`;
    }
    
    // Add status
    summary += `. Status: ${workspace.status}.`;
    
    // Add activity summary
    const activities = workspace.activityHistory || [];
    if (activities.length > 0) {
      const lastActivity = activities[activities.length - 1];
      const lastDate = new Date(lastActivity.timestamp).toLocaleDateString();
      summary += ` Last activity: ${lastActivity.action} on ${lastDate}.`;
    }
    
    return summary;
  }
  
  /**
   * Get recent files for the workspace
   */
  private async getRecentFiles(workspace: {
    rootFolder: string;
    id: string;
  }): Promise<string[]> {
    // In a real implementation, this would query file history
    // For now, return placeholder paths
    return [
      `${workspace.rootFolder}/README.md`,
      `${workspace.rootFolder}/notes.md`,
      `${workspace.rootFolder}/plan.md`
    ];
  }
  
  /**
   * Get key files for the workspace
   */
  private async getKeyFiles(workspace: {
    rootFolder: string;
    id: string;
  }): Promise<string[]> {
    // In a real implementation, this would identify important files
    // For now, return placeholder paths
    return [
      `${workspace.rootFolder}/index.md`,
      `${workspace.rootFolder}/guidelines.md`
    ];
  }
  
  /**
   * Get related concepts for the workspace
   */
  private async getRelatedConcepts(workspace: {
    id: string;
    name: string;
  }): Promise<string[]> {
    // In a real implementation, this would extract key topics
    // For now, return placeholder concepts
    return [
      "Main concept",
      "Related idea",
      "Key framework"
    ];
  }
  
  /**
   * Get the parameter schema
   */
  getParameterSchema(): Record<string, any> {
    const commonSchema = this.getCommonParameterSchema();
    
    return {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID of the workspace to load'
        },
        contextDepth: {
          type: 'string',
          enum: ['minimal', 'standard', 'comprehensive'],
          description: 'How much context to load'
        },
        includeChildren: {
          type: 'boolean',
          description: 'Whether to include child workspaces/phases/tasks'
        },
        specificPhaseId: {
          type: 'string',
          description: 'Load a specific phase/task instead of whole workspace'
        },
        ...commonSchema
      },
      required: ['id']
    };
  }
}