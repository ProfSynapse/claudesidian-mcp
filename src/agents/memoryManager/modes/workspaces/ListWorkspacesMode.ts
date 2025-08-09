/**
 * Location: src/agents/memoryManager/modes/workspaces/ListWorkspacesMode.ts
 * 
 * Purpose: Implements the listWorkspaces mode for the consolidated MemoryManager
 * This mode lists available workspaces with filtering and sorting options.
 * 
 * Used by: MemoryManagerAgent for workspace listing operations
 * Integrates with: WorkspaceService for accessing workspace data
 */

import { BaseMode } from '../../../baseMode';
import { 
  ListWorkspacesParameters, 
  ListWorkspacesResult, 
  HierarchyType 
} from '../../../../database/workspace-types';
import { WorkspaceService } from "../../services/WorkspaceService";
import { parseWorkspaceContext } from '../../../../utils/contextUtils';

/**
 * Mode to list available workspaces with filtering and sorting
 */
export class ListWorkspacesMode extends BaseMode<ListWorkspacesParameters, ListWorkspacesResult> {
  private agent: any;
  
  /**
   * Create a new ListWorkspacesMode for the consolidated MemoryManager
   * @param agent The MemoryManagerAgent instance
   */
  constructor(agent: any) {
    super(
      'listWorkspaces',
      'List Workspaces',
      'List available workspaces with filters and sorting',
      '1.0.0'
    );
    this.agent = agent;
  }
  
  /**
   * Execute the mode to list workspaces
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: ListWorkspacesParameters): Promise<ListWorkspacesResult> {
    const startTime = Date.now();
    console.log('[ListWorkspacesMode] Starting workspace listing with params:', params);
    
    try {
      // Get workspace service from agent
      const workspaceService = await this.agent.getWorkspaceServiceAsync();
      if (!workspaceService) {
        console.error('[ListWorkspacesMode] WorkspaceService not available');
        return {
          success: false,
          error: 'WorkspaceService not available',
          data: { workspaces: [] },
          workspaceContext: typeof params.workspaceContext === 'string' 
            ? parseWorkspaceContext(params.workspaceContext) || undefined
            : params.workspaceContext
        };
      }
      
      // Get workspaces with optional filtering and sorting
      const queryParams = {
        parentId: params.parentId,
        hierarchyType: params.hierarchyType as HierarchyType,
        sortBy: params.sortBy as 'name' | 'created' | 'lastAccessed',
        sortOrder: params.order as 'asc' | 'desc'
      };
      
      console.log('[ListWorkspacesMode] Query parameters:', queryParams);
      
      let workspaces;
      try {
        workspaces = await workspaceService.getWorkspaces(queryParams);
        console.log(`[ListWorkspacesMode] Retrieved ${workspaces.length} workspaces from service`);
      } catch (queryError) {
        console.error('[ListWorkspacesMode] Failed to query workspaces:', queryError);
        return {
          success: false,
          error: `Failed to query workspaces: ${queryError instanceof Error ? queryError.message : String(queryError)}`,
          data: { workspaces: [] },
          workspaceContext: typeof params.workspaceContext === 'string' 
            ? parseWorkspaceContext(params.workspaceContext) || undefined
            : params.workspaceContext
        };
      }
      
      // Log detailed workspace information for debugging
      if (workspaces.length > 0) {
        console.log('[ListWorkspacesMode] Workspace details:');
        workspaces.forEach((ws: any, index: number) => {
          console.log(`  ${index + 1}. ID: ${ws.id}, Name: ${ws.name}, Status: ${ws.status}, Type: ${ws.hierarchyType}`);
        });
      } else {
        console.warn('[ListWorkspacesMode] No workspaces found');
        
        // Enhanced diagnostic: Use workspace collection diagnostic service if available
        try {
          console.log('[ListWorkspacesMode] Running diagnostics...');
          const diagnostics = await workspaceService.getDiagnostics();
          console.log('[ListWorkspacesMode] Diagnostic results:', diagnostics);
          
          if (diagnostics.totalItems > 0) {
            console.warn('[ListWorkspacesMode] Collection contains data but getWorkspaces() returned empty');
            console.warn('[ListWorkspacesMode] Format analysis:', diagnostics.formatAnalysis);
            
            if (diagnostics.sampleItems.length > 0) {
              console.log('[ListWorkspacesMode] Sample items for debugging:');
              diagnostics.sampleItems.forEach((item: any, index: number) => {
                console.log(`  ${index + 1}. ID: ${item.id}, Legacy: ${item.isLegacy}, Metadata keys: ${Object.keys(item.metadata)}`);
              });
            }
          }
        } catch (diagError) {
          console.error('[ListWorkspacesMode] Diagnostic check failed:', diagError);
        }
      }
      
      // Format the results
      const formattedWorkspaces = workspaces.map((ws: any, index: number) => {
        const formatted = {
          id: ws.id,
          name: ws.name || `Workspace ${index + 1}`,
          description: ws.description || undefined,
          rootFolder: ws.rootFolder || '/',
          lastAccessed: ws.lastAccessed || Date.now(),
          status: ws.status || 'active',
          hierarchyType: ws.hierarchyType || 'workspace',
          parentId: ws.parentId || undefined,
          childCount: ws.childWorkspaces?.length || 0
        };
        
        console.log(`[ListWorkspacesMode] Formatted workspace ${index + 1}:`, formatted);
        return formatted;
      });
      
      // Ensure workspaceContext has required workspaceId
      const workspaceContext = params.workspaceContext 
        ? { 
            workspaceId: parseWorkspaceContext(params.workspaceContext)?.workspaceId || workspaces[0]?.id || '',
            workspacePath: parseWorkspaceContext(params.workspaceContext)?.workspacePath 
          }
        : undefined;
      
      console.log(`[ListWorkspacesMode] Workspace context:`, workspaceContext);
      
      const result = {
        success: true,
        data: {
          workspaces: formattedWorkspaces,
          performance: {
            totalDuration: Date.now() - startTime,
            serviceAccessTime: 0, // Simplified for consolidated version
            queryTime: Date.now() - startTime,
            workspaceCount: formattedWorkspaces.length
          }
        },
        workspaceContext: workspaceContext
      };
      
      console.log(`[ListWorkspacesMode] Final result: success=${result.success}, workspace count=${formattedWorkspaces.length}, duration=${Date.now() - startTime}ms`);
      return result;
      
    } catch (error: any) {
      console.error(`[ListWorkspacesMode] Unexpected error after ${Date.now() - startTime}ms:`, {
        message: error.message,
        stack: error.stack,
        params: params
      });
      
      return {
        success: false,
        error: `Unexpected error: ${error.message || String(error)}`,
        data: { workspaces: [] },
        workspaceContext: typeof params.workspaceContext === 'string' 
          ? parseWorkspaceContext(params.workspaceContext) || undefined
          : params.workspaceContext
      };
    }
  }
  
  /**
   * Get the parameter schema
   */
  getParameterSchema(): any {
    const modeSchema = {
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
        }
      }
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