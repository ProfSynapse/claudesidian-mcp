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
  ListWorkspacesResult
} from '../../../../database/workspace-types';
import { WorkspaceService } from '../../../../services/WorkspaceService';
import { parseWorkspaceContext } from '../../../../utils/contextUtils';
import { PaginationHelper } from '../../../../services/pagination/PaginationHelper';
import { PaginationInfo } from '../../../../types/pagination/PaginationTypes';

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
      // Don't pass limit to service when using pagination - we'll handle it after
      const usePagination = PaginationHelper.hasPaginationParams(params);
      const queryParams: {
        sortBy?: 'name' | 'created' | 'lastAccessed',
        sortOrder?: 'asc' | 'desc',
        limit?: number
      } = {
        sortBy: params.sortBy as 'name' | 'created' | 'lastAccessed' | undefined,
        sortOrder: params.order as 'asc' | 'desc' | undefined,
        limit: usePagination ? undefined : params.limit // Only use limit for backward compat
      };

      let workspaces;
      try {
        workspaces = await workspaceService.getWorkspaces(queryParams);
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
        workspaces.forEach((ws: any, index: number) => {
          console.log(`  ${index + 1}. ID: ${ws.id}, Name: ${ws.name}, Status: ${ws.status}`);
        });
      } else {
        console.warn('[ListWorkspacesMode] No workspaces found');
        
        // Enhanced diagnostic: Use workspace collection diagnostic service if available
        try {
          const diagnostics = await workspaceService.getDiagnostics();
          
          if (diagnostics.totalItems > 0) {
            console.warn('[ListWorkspacesMode] Collection contains data but getWorkspaces() returned empty');
            console.warn('[ListWorkspacesMode] Format analysis:', diagnostics.formatAnalysis);
            
            if (diagnostics.sampleItems.length > 0) {
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
          status: ws.status || 'active'
        };

        return formatted;
      });

      // Apply pagination or use all results
      let resultWorkspaces: any[];
      let pagination: PaginationInfo | undefined;

      if (usePagination) {
        const paginated = PaginationHelper.paginate(formattedWorkspaces, {
          page: params.page,
          pageSize: params.pageSize
        });
        resultWorkspaces = paginated.items;
        pagination = paginated.pagination;
      } else if (!params.limit) {
        // No limit specified - apply default pagination
        const paginated = PaginationHelper.paginate(formattedWorkspaces, {});
        resultWorkspaces = paginated.items;
        pagination = paginated.pagination;
      } else {
        // Backward compatibility: limit was already applied by service
        resultWorkspaces = formattedWorkspaces;
      }

      // Ensure workspaceContext has required workspaceId
      const workspaceContext = params.workspaceContext
        ? {
            workspaceId: parseWorkspaceContext(params.workspaceContext)?.workspaceId || workspaces[0]?.id || '',
            workspacePath: parseWorkspaceContext(params.workspaceContext)?.workspacePath
          }
        : undefined;


      const result = {
        success: true,
        data: {
          workspaces: resultWorkspaces,
          pagination,
          performance: {
            totalDuration: Date.now() - startTime,
            serviceAccessTime: 0, // Simplified for consolidated version
            queryTime: Date.now() - startTime,
            workspaceCount: resultWorkspaces.length
          }
        },
        workspaceContext: workspaceContext
      };

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
        limit: {
          type: 'number',
          description: 'Maximum number of workspaces to return (backward compatibility, prefer page/pageSize)'
        },
        page: {
          type: 'number',
          description: 'Page number (0-indexed). Use with pageSize for pagination.'
        },
        pageSize: {
          type: 'number',
          description: 'Items per page (default: 25, max: 200). Use with page for pagination.'
        }
      }
    };

    // Merge with common schema (adds sessionId, workspaceContext)
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