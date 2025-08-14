/**
 * ListSessionsMode - Lists sessions with filtering and sorting capabilities
 * Following the same pattern as ListWorkspacesMode for consistency
 */

import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager'
import { ListSessionsParams, SessionResult } from '../../types';
import { createErrorMessage } from '../../../../utils/errorUtils';
import { extractContextFromParams } from '../../../../utils/contextUtils';
import { MemoryService } from "../../services/MemoryService";
import { WorkspaceService } from "../../services/WorkspaceService";

/**
 * Mode for listing sessions with filtering and sorting
 */
export class ListSessionsMode extends BaseMode<ListSessionsParams, SessionResult> {
  private agent: MemoryManagerAgent;

  constructor(agent: MemoryManagerAgent) {
    super(
      'listSessions',
      'List Sessions',
      'List sessions with optional filtering and sorting',
      '2.0.0'
    );
    this.agent = agent;
  }

  async execute(params: ListSessionsParams): Promise<SessionResult> {
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
      
      // Ensure workspaceId is defined
      const finalWorkspaceId = workspaceId || 'global-workspace-default';

      // Get sessions
      const sessions = await memoryService.getSessions(finalWorkspaceId, params.activeOnly);

      // Filter by tags if provided
      let filteredSessions = sessions;
      if (params.tags && params.tags.length > 0) {
        filteredSessions = sessions.filter(session => 
          session.tags && params.tags!.some(tag => session.tags!.includes(tag))
        );
      }

      // Sort sessions
      const sortedSessions = this.sortSessions(filteredSessions, params.order || 'desc');

      // Apply limit
      const limitedSessions = params.limit ? sortedSessions.slice(0, params.limit) : sortedSessions;

      // Enhance session data with workspace names
      const enhancedSessions = workspaceService 
        ? await this.enhanceSessionsWithWorkspaceNames(limitedSessions, workspaceService)
        : limitedSessions.map(session => ({
            ...session,
            workspaceName: 'Unknown Workspace',
            created: session.startTime
          }));

      // Prepare result
      const contextString = workspaceId 
        ? `Found ${limitedSessions.length} session(s) in workspace ${workspaceId}`
        : `Found ${limitedSessions.length} session(s) across all workspaces`;

      return this.prepareResult(
        true,
        {
          sessions: enhancedSessions,
          total: sessions.length,
          filtered: limitedSessions.length,
          workspaceId: workspaceId,
          filters: {
            activeOnly: params.activeOnly || false,
            tags: params.tags || [],
            order: params.order || 'desc',
            limit: params.limit
          }
        },
        undefined,
        contextString,
        inheritedContext || undefined
      );

    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Error listing sessions: ', error));
    }
  }

  /**
   * Sort sessions by the specified order
   */
  private sortSessions(sessions: any[], order: 'asc' | 'desc'): any[] {
    return sessions.sort((a, b) => {
      const timeA = a.startTime || 0;
      const timeB = b.startTime || 0;
      return order === 'asc' ? timeA - timeB : timeB - timeA;
    });
  }

  /**
   * Enhance sessions with workspace names
   */
  private async enhanceSessionsWithWorkspaceNames(sessions: any[], workspaceService: WorkspaceService): Promise<any[]> {
    const workspaceCache = new Map<string, string>();
    
    const enhanced = await Promise.all(sessions.map(async (session) => {
      let workspaceName = 'Unknown Workspace';
      
      if (!workspaceCache.has(session.workspaceId)) {
        try {
          const workspace = await workspaceService.getWorkspace(session.workspaceId);
          workspaceName = workspace?.name || 'Unknown Workspace';
          workspaceCache.set(session.workspaceId, workspaceName);
        } catch {
          workspaceCache.set(session.workspaceId, 'Unknown Workspace');
        }
      } else {
        workspaceName = workspaceCache.get(session.workspaceId)!;
      }

      return {
        ...session,
        workspaceName,
        created: session.startTime
      };
    }));

    return enhanced;
  }


  /**
   * Get workspace context from inherited parameters
   */
  protected getInheritedWorkspaceContext(params: ListSessionsParams): any {
    return extractContextFromParams(params);
  }

  /**
   * Prepare standardized result format
   */
  protected prepareResult(success: boolean, data?: any, contextData?: any, message?: string, workspaceContext?: any): SessionResult {
    return {
      success,
      data: data || {},
      workspaceContext
    };
  }

  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        activeOnly: {
          type: 'boolean',
          description: 'Only return active sessions'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of sessions to return'
        },
        order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort order by creation date'
        },
        sessionId: {
          type: 'string',
          description: 'Session ID for tracking this operation'
        },
        workspaceContext: {
          type: 'object',
          description: 'Workspace context for scoping operations'
        }
      },
      additionalProperties: false
    };
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
          description: 'Session data'
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