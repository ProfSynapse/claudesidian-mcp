import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { 
  ListWorkspacesParameters, 
  ListWorkspacesResult, 
  HierarchyType 
} from '../../../database/workspace-types';
import { IndexedDBWorkspaceDatabase } from '../../../database/workspace-db';
import { parseWorkspaceContext } from '../../../utils/contextUtils';

/**
 * Mode to list available workspaces
 */
export class ListWorkspacesMode extends BaseMode<ListWorkspacesParameters, ListWorkspacesResult> {
  private app: App;
  private workspaceDb: IndexedDBWorkspaceDatabase;
  
  /**
   * Create a new ListWorkspacesMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listWorkspaces',
      'List Workspaces',
      'List available workspaces with filters and sorting',
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
  async execute(params: ListWorkspacesParameters): Promise<ListWorkspacesResult> {
    try {
      // Initialize database connection if needed
      await this.workspaceDb.initialize();
      
      // Get workspaces with optional filtering and sorting
      const workspaces = await this.workspaceDb.getWorkspaces({
        parentId: params.parentId,
        hierarchyType: params.hierarchyType,
        sortBy: params.sortBy,
        sortOrder: params.order
      });
      
      // Format the results
      const formattedWorkspaces = workspaces.map((ws: any) => ({
        id: ws.id,
        name: ws.name,
        description: ws.description,
        rootFolder: ws.rootFolder,
        lastAccessed: ws.lastAccessed,
        status: ws.status,
        hierarchyType: ws.hierarchyType,
        parentId: ws.parentId,
        childCount: ws.childWorkspaces.length
      }));
      
      // Ensure workspaceContext has required workspaceId
      const workspaceContext = params.workspaceContext 
        ? { 
            workspaceId: parseWorkspaceContext(params.workspaceContext)?.workspaceId || workspaces[0]?.id || '',
            workspacePath: parseWorkspaceContext(params.workspaceContext)?.workspacePath 
          }
        : undefined;
        
      return {
        success: true,
        data: {
          workspaces: formattedWorkspaces
        },
        workspaceContext: workspaceContext
      };
      
    } catch (error) {
      // For error case, ensure workspaceContext has required workspaceId if present
      const workspaceContext = params.workspaceContext 
        ? { 
            workspaceId: parseWorkspaceContext(params.workspaceContext)?.workspaceId || '',
            workspacePath: parseWorkspaceContext(params.workspaceContext)?.workspacePath 
          }
        : undefined;
        
      return {
        success: false,
        error: `Failed to list workspaces: ${error.message}`,
        workspaceContext: workspaceContext,
        data: {
          workspaces: []
        }
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
        sortBy: {
          type: 'string',
          enum: ['name', 'created', 'lastAccessed'],
          description: 'Field to sort workspaces by'
        },
        order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort order (ascending or descending)'
        },
        parentId: {
          type: 'string',
          description: 'Filter by parent workspace ID'
        },
        hierarchyType: {
          type: 'string',
          enum: ['workspace', 'phase', 'task'],
          description: 'Filter by hierarchy type'
        },
        ...commonSchema
      }
    };
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
            workspaces: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Workspace identifier'
                  },
                  name: {
                    type: 'string',
                    description: 'Workspace name'
                  },
                  description: {
                    type: 'string',
                    description: 'Workspace description'
                  },
                  rootFolder: {
                    type: 'string',
                    description: 'Root folder for the workspace'
                  },
                  lastAccessed: {
                    type: 'number',
                    description: 'Timestamp of last access'
                  },
                  status: {
                    type: 'string',
                    enum: ['active', 'paused', 'completed'],
                    description: 'Workspace status'
                  },
                  hierarchyType: {
                    type: 'string',
                    enum: ['workspace', 'phase', 'task'],
                    description: 'Hierarchy type'
                  },
                  parentId: {
                    type: 'string',
                    description: 'Parent workspace ID if applicable'
                  },
                  childCount: {
                    type: 'number',
                    description: 'Number of child workspaces/phases/tasks'
                  }
                }
              }
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