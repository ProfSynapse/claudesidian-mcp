/**
 * ListStatesMode - Lists states with filtering and sorting capabilities
 * Following the same pattern as ListWorkspacesMode for consistency
 */

import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager'
import { ListStatesParams, StateResult } from '../../types';
import { createErrorMessage } from '../../../../utils/errorUtils';
import { extractContextFromParams } from '../../../../utils/contextUtils';
import { MemoryService } from "../../services/MemoryService";
import { WorkspaceService } from '../../../../services/WorkspaceService';
import { PaginationHelper } from '../../../../services/pagination/PaginationHelper';
import { PaginationInfo } from '../../../../types/pagination/PaginationTypes';

/**
 * Mode for listing states with filtering and sorting
 */
export class ListStatesMode extends BaseMode<ListStatesParams, StateResult> {
  private agent: MemoryManagerAgent;

  constructor(agent: MemoryManagerAgent) {
    super(
      'listStates',
      'List States',
      'List states with optional filtering and sorting',
      '2.0.0'
    );
    this.agent = agent;
  }

  async execute(params: ListStatesParams): Promise<StateResult> {
    try {
      // Get services from agent
      const memoryService = await this.agent.getMemoryServiceAsync();
      const workspaceService = await this.agent.getWorkspaceServiceAsync();
      
      if (!memoryService) {
        return this.prepareResult(false, undefined, 'Memory service not available');
      }

      // Get workspace ID from context
      let workspaceId: string | undefined;
      const inheritedContext = this.getInheritedWorkspaceContext(params);
      if (inheritedContext?.workspaceId) {
        workspaceId = inheritedContext.workspaceId;
      }

      // Get states (pass sessionId to filter by session, or undefined to get all)
      const states = await memoryService.getStates(
        workspaceId || 'default-workspace',
        params.context.sessionId
      );

      // Note: getStates already filters by sessionId if provided
      let filteredStates = states;

      // Filter by tags if provided
      if (params.tags && params.tags.length > 0) {
        filteredStates = filteredStates.filter(state => {
          const stateTags = (state.state as any)?.state?.metadata?.tags || [];
          return params.tags!.some(tag => stateTags.includes(tag));
        });
      }

      // Sort states
      const sortedStates = this.sortStates(filteredStates, params.order || 'desc');

      // Apply pagination or limit (pagination takes precedence if provided)
      const usePagination = PaginationHelper.hasPaginationParams(params);
      let resultStates: any[];
      let pagination: PaginationInfo | undefined;

      if (usePagination) {
        // Use pagination
        const paginated = PaginationHelper.paginate(sortedStates, {
          page: params.page,
          pageSize: params.pageSize
        });
        resultStates = paginated.items;
        pagination = paginated.pagination;
      } else if (params.limit) {
        // Backward compatibility: use simple limit
        resultStates = sortedStates.slice(0, params.limit);
      } else {
        // Default: use pagination with defaults
        const paginated = PaginationHelper.paginate(sortedStates, {});
        resultStates = paginated.items;
        pagination = paginated.pagination;
      }

      // Enhance state data
      const enhancedStates = workspaceService
        ? await this.enhanceStatesWithContext(resultStates, workspaceService, params.includeContext)
        : resultStates.map(state => ({
            ...state,
            workspaceName: 'Unknown Workspace',
            created: state.created || state.timestamp
          }));

      // Prepare result
      const contextString = workspaceId
        ? `Found ${resultStates.length} state(s) in workspace ${workspaceId}`
        : `Found ${resultStates.length} state(s) across all workspaces`;

      return this.prepareResult(
        true,
        {
          states: enhancedStates,
          total: states.length,
          filtered: resultStates.length,
          workspaceId: workspaceId,
          pagination,
          filters: {
            sessionId: params.context.sessionId,
            tags: params.tags || [],
            order: params.order || 'desc',
            limit: params.limit,
            page: params.page,
            pageSize: params.pageSize,
            includeContext: params.includeContext
          }
        },
        undefined,
        contextString,
        inheritedContext || undefined
      );

    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Error listing states: ', error));
    }
  }

  /**
   * Sort states by creation date
   */
  private sortStates(states: any[], order: 'asc' | 'desc'): any[] {
    return states.sort((a, b) => {
      const timeA = a.timestamp || a.created || 0;
      const timeB = b.timestamp || b.created || 0;
      return order === 'asc' ? timeA - timeB : timeB - timeA;
    });
  }

  /**
   * Enhance states with workspace names and context
   */
  private async enhanceStatesWithContext(states: any[], workspaceService: WorkspaceService, includeContext?: boolean): Promise<any[]> {
    const workspaceCache = new Map<string, string>();
    
    return await Promise.all(states.map(async (state) => {
      let workspaceName = 'Unknown Workspace';
      
      if (!workspaceCache.has(state.workspaceId)) {
        try {
          const workspace = await workspaceService.getWorkspace(state.workspaceId);
          workspaceName = workspace?.name || 'Unknown Workspace';
          workspaceCache.set(state.workspaceId, workspaceName);
        } catch {
          workspaceCache.set(state.workspaceId, 'Unknown Workspace');
        }
      } else {
        workspaceName = workspaceCache.get(state.workspaceId)!;
      }

      const enhanced: any = {
        ...state,
        workspaceName,
        created: state.created || state.timestamp
      };

      if (includeContext && state.state?.context) {
        enhanced.context = {
          files: state.state.context.activeFiles || [],
          traceCount: 0, // Could be enhanced to count related traces
          tags: state.state?.state?.metadata?.tags || [],
          summary: state.state.context.activeTask || 'No active task recorded'
        };
      }

      return enhanced;
    }));
  }


  /**
   * Get workspace context from inherited parameters
   */
  protected getInheritedWorkspaceContext(params: ListStatesParams): any {
    return extractContextFromParams(params);
  }

  /**
   * Prepare standardized result format
   */
  protected prepareResult(success: boolean, data?: any, contextData?: any, message?: string, workspaceContext?: any): StateResult {
    return {
      success,
      data: data || {},
      workspaceContext
    };
  }

  getParameterSchema(): any {
    const customSchema = {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Filter by session ID'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of states to return (backward compatibility, prefer page/pageSize)'
        },
        page: {
          type: 'number',
          description: 'Page number (0-indexed). Use with pageSize for pagination.'
        },
        pageSize: {
          type: 'number',
          description: 'Items per page (default: 25, max: 200). Use with page for pagination.'
        },
        order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort order by creation date'
        },
        includeContext: {
          type: 'boolean',
          description: 'Include context information'
        }
      },
      additionalProperties: false
    };

    return this.getMergedSchema(customSchema);
  }

  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the operation was successful'
        },
        data: {
          type: 'object',
          description: 'State data'
        },
        message: {
          type: 'string',
          description: 'Result message'
        },
        workspaceContext: {
          type: 'object',
          description: 'Workspace context'
        }
      },
      required: ['success'],
      additionalProperties: false
    };
  }
}