import { App, Plugin } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { 
  ListWorkspacesParameters, 
  ListWorkspacesResult, 
  HierarchyType 
} from '../../../database/workspace-types';
import { WorkspaceService } from '../../../database/services/WorkspaceService';
import { parseWorkspaceContext } from '../../../utils/contextUtils';
import { ClaudesidianPlugin } from '../utils/pluginTypes';

/**
 * Mode to list available workspaces
 */
export class ListWorkspacesMode extends BaseMode<ListWorkspacesParameters, ListWorkspacesResult> {
  private plugin: Plugin;
  private workspaceService: WorkspaceService | null = null;
  
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
    this.plugin = app.plugins.getPlugin('claudesidian-mcp');
    
    // Safely access the workspace service
    if (this.plugin) {
      const pluginWithServices = this.plugin as ClaudesidianPlugin;
      if (pluginWithServices.services && pluginWithServices.services.workspaceService) {
        this.workspaceService = pluginWithServices.services.workspaceService;
      }
    }
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: ListWorkspacesParameters): Promise<ListWorkspacesResult> {
    try {
      // Get workspace service
      const workspaceService = this.workspaceService;
      if (!workspaceService) {
        return {
          success: false,
          error: 'Workspace service not available',
          data: { workspaces: [] }
        };
      }
      
      // Get workspaces with optional filtering and sorting
      const workspaces = await workspaceService.getWorkspaces({
        parentId: params.parentId,
        hierarchyType: params.hierarchyType as HierarchyType,
        sortBy: params.sortBy as 'name' | 'created' | 'lastAccessed',
        sortOrder: params.order as 'asc' | 'desc'
      });
      
      // Format the results
      const formattedWorkspaces = workspaces.map(ws => ({
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
      
    } catch (error: any) {
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