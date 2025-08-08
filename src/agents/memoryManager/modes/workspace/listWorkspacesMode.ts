import { App, Plugin } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { 
  ListWorkspacesParameters, 
  ListWorkspacesResult, 
  HierarchyType 
} from '../../../../database/workspace-types';
import { WorkspaceService } from "../services/WorkspaceService";
import { parseWorkspaceContext } from '../../../../utils/contextUtils';
import { createServiceIntegration } from '../../utils/ServiceIntegration';
import { memoryManagerErrorHandler, createMemoryManagerError } from '../../utils/ErrorHandling';

/**
 * Mode to list available workspaces with robust service integration and error handling
 */
export class ListWorkspacesMode extends BaseMode<ListWorkspacesParameters, ListWorkspacesResult> {
  private app: App;
  private serviceIntegration: ReturnType<typeof createServiceIntegration>;
  
  /**
   * Create a new ListWorkspacesMode with robust service integration
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
    this.serviceIntegration = createServiceIntegration(app, {
      logLevel: 'warn',
      maxRetries: 2,
      fallbackBehavior: 'warn'
    });
  }
  
  /**
   * Get workspace service with robust error handling and retry logic
   */
  private async getWorkspaceService(): Promise<WorkspaceService | null> {
    const result = await this.serviceIntegration.getWorkspaceService();
    
    if (!result.success) {
    }
    
    return result.service;
  }
  
  /**
   * Execute the mode with robust service integration and comprehensive error handling
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: ListWorkspacesParameters): Promise<ListWorkspacesResult> {
    const startTime = Date.now();
    console.log('[ListWorkspacesMode] Starting workspace listing with params:', params);
    
    try {
      // Get workspace service with comprehensive error handling
      const serviceResult = await this.serviceIntegration.getWorkspaceService();
      if (!serviceResult.success || !serviceResult.service) {
        const error = memoryManagerErrorHandler.handleServiceUnavailable(
          'List Workspaces',
          'listWorkspaces',
          'WorkspaceService',
          serviceResult.error,
          params
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext, { workspaces: [] });
      }
      
      const workspaceService = serviceResult.service;
      
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
        const error = memoryManagerErrorHandler.handleUnexpected(
          'List Workspaces',
          'listWorkspaces',
          queryError,
          params
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext, { workspaces: [] });
      }
      
      // Log detailed workspace information for debugging
      if (workspaces.length > 0) {
        console.log('[ListWorkspacesMode] Workspace details:');
        workspaces.forEach((ws: any, index: number) => {
          console.log(`  ${index + 1}. ID: ${ws.id}, Name: ${ws.name}, Status: ${ws.status}, Type: ${ws.hierarchyType}`);
        });
      } else {
        console.warn('[ListWorkspacesMode] No workspaces found - checking possible causes...');
        
        // Enhanced diagnostic: Use the new workspace collection diagnostic service
        try {
          console.log('[ListWorkspacesMode] Running enhanced diagnostics...');
          const diagnostics = await workspaceService.getDiagnostics();
          console.log('[ListWorkspacesMode] Enhanced diagnostic results:', diagnostics);
          
          if (diagnostics.totalItems > 0) {
            console.warn('[ListWorkspacesMode] Collection contains data but getWorkspaces() returned empty');
            console.warn('[ListWorkspacesMode] Format analysis:', diagnostics.formatAnalysis);
            
            if (diagnostics.sampleItems.length > 0) {
              console.log('[ListWorkspacesMode] Sample items for debugging:');
              diagnostics.sampleItems.forEach((item: any, index: number) => {
                console.log(`  ${index + 1}. ID: ${item.id}, Legacy: ${item.isLegacy}, Metadata keys: ${Object.keys(item.metadata)}`);
              });
            }
            
            // If we have legacy items, that might explain the issue
            if (diagnostics.formatAnalysis.legacyCount > 0) {
              console.warn(`[ListWorkspacesMode] Found ${diagnostics.formatAnalysis.legacyCount} legacy format workspaces - backward compatibility should handle these`);
            }
            
            if (diagnostics.formatAnalysis.invalidCount > 0) {
              console.error(`[ListWorkspacesMode] Found ${diagnostics.formatAnalysis.invalidCount} invalid workspace items - data corruption possible`);
            }
          }
        } catch (diagError) {
          console.error('[ListWorkspacesMode] Enhanced diagnostic check failed:', diagError);
        }
      }
      
      // Format the results with enhanced validation
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
            serviceAccessTime: serviceResult.diagnostics?.duration || 0,
            queryTime: Date.now() - startTime, // Approximation
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
      
      return createMemoryManagerError<ListWorkspacesResult>(
        'List Workspaces',
        'listWorkspaces',
        error,
        params.workspaceContext,
        params
      );
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