import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { 
  CreateWorkspaceParameters, 
  CreateWorkspaceResult,
  ProjectWorkspace,
  HierarchyType,
  WorkspaceStatus
} from '../../vaultLibrarian/workspace-types';
import { IndexedDBWorkspaceDatabase } from '../../vaultLibrarian/db/workspace-db';
import { v4 as uuidv4 } from 'uuid';

/**
 * Mode to create a new workspace
 */
export class CreateWorkspaceMode extends BaseMode<CreateWorkspaceParameters, CreateWorkspaceResult> {
  private app: App;
  private workspaceDb: IndexedDBWorkspaceDatabase;
  
  /**
   * Create a new CreateWorkspaceMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'createWorkspace',
      'Create Workspace',
      'Create a new workspace, phase, or task',
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
  async execute(params: CreateWorkspaceParameters): Promise<CreateWorkspaceResult> {
    try {
      // Initialize database connection if needed
      await this.workspaceDb.initialize();
      
      // Validate parameters
      if (!params.name) {
        return this.prepareResult(false, undefined, 'Workspace name is required');
      }
      
      if (!params.rootFolder) {
        return this.prepareResult(false, undefined, 'Root folder is required');
      }
      
      // Determine hierarchy type and path
      const hierarchyType = params.hierarchyType || 'workspace';
      let path: string[] = [];
      let parentWorkspace: ProjectWorkspace | undefined;
      
      // If this is a child workspace, get the parent and validate
      if (params.parentId && hierarchyType !== 'workspace') {
        parentWorkspace = await this.workspaceDb.getWorkspace(params.parentId);
        
        if (!parentWorkspace) {
          return this.prepareResult(
            false, 
            undefined, 
            `Parent workspace with ID ${params.parentId} not found`
          );
        }
        
        // Phases can only be parented by workspaces
        if (hierarchyType === 'phase' && parentWorkspace.hierarchyType !== 'workspace') {
          return this.prepareResult(
            false, 
            undefined, 
            'A phase can only be created under a workspace, not another phase or task'
          );
        }
        
        // Tasks can only be parented by phases
        if (hierarchyType === 'task' && parentWorkspace.hierarchyType !== 'phase') {
          return this.prepareResult(
            false, 
            undefined, 
            'A task can only be created under a phase, not a workspace or another task'
          );
        }
        
        // Build the path based on parent
        path = [...parentWorkspace.path, params.parentId];
      }
      
      // Generate a unique ID
      const workspaceId = uuidv4();
      
      // Create the workspace object
      const now = Date.now();
      const newWorkspace: ProjectWorkspace = {
        id: workspaceId,
        name: params.name,
        description: params.description,
        created: now,
        lastAccessed: now,
        
        // Hierarchy information
        hierarchyType,
        parentId: params.parentId,
        childWorkspaces: [],
        path,
        
        // Context boundaries
        rootFolder: params.rootFolder,
        relatedFolders: params.relatedFolders || [],
        
        // Memory parameters
        relevanceSettings: {
          folderProximityWeight: 0.5,
          recencyWeight: 0.7,
          frequencyWeight: 0.3
        },
        
        // Activity history
        activityHistory: [{
          timestamp: now,
          action: 'create',
          toolName: 'CreateWorkspaceMode'
        }],
        
        // User preferences
        preferences: params.preferences || {},
        
        // Progress tracking
        completionStatus: {},
        
        // Overall status
        status: 'active' as WorkspaceStatus
      };
      
      // Save the workspace to the database
      await this.workspaceDb.createWorkspace(newWorkspace);
      
      // If this is a child workspace, update the parent
      if (parentWorkspace) {
        await this.workspaceDb.updateWorkspace(
          parentWorkspace.id, 
          { 
            childWorkspaces: [...parentWorkspace.childWorkspaces, workspaceId],
            lastAccessed: now
          }
        );
      }
      
      const workspaceContext = {
        workspaceId,
        workspacePath: [...path, workspaceId]
      };

      return this.prepareResult(
        true,
        {
          workspaceId,
          workspace: newWorkspace
        },
        undefined,
        workspaceContext
      );
      
    } catch (error) {
      return this.prepareResult(
        false, 
        undefined,
        `Failed to create workspace: ${error.message}`
      );
    }
  }
  
  /**
   * Get the parameter schema
   */
  getParameterSchema(): any {
    // Create the mode-specific schema
    const modeSchema = {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the workspace'
        },
        description: {
          type: 'string',
          description: 'Optional description of the workspace'
        },
        rootFolder: {
          type: 'string',
          description: 'Root folder path for this workspace'
        },
        relatedFolders: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional related folders'
        },
        preferences: {
          type: 'object',
          description: 'Custom workspace settings'
        },
        hierarchyType: {
          type: 'string',
          enum: ['workspace', 'phase', 'task'],
          description: 'Type of hierarchy node (default: workspace)'
        },
        parentId: {
          type: 'string',
          description: 'Parent workspace/phase ID if applicable'
        }
      },
      required: ['name', 'rootFolder']
    };
    
    // Merge with common schema (workspace context and handoff)
    return this.getMergedSchema(modeSchema);
  }
  
  /**
   * Get the result schema
   */
  getResultSchema(): any {
    // Use the base result schema from BaseMode, which includes common result properties
    const baseSchema = super.getResultSchema();
    
    // Add mode-specific data properties
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'ID of the created workspace'
        },
        workspace: {
          type: 'object',
          description: 'The full workspace object that was created',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            hierarchyType: { 
              type: 'string',
              enum: ['workspace', 'phase', 'task']
            },
            path: {
              type: 'array',
              items: { type: 'string' }
            },
            // Other workspace properties omitted for brevity
          }
        }
      },
      required: ['workspaceId', 'workspace']
    };
    
    return baseSchema;
  }
}