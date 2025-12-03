/**
 * Location: /src/agents/memoryManager/modes/workspaces/LoadWorkspaceMode.ts
 * Purpose: Consolidated workspace loading mode for MemoryManager
 *
 * This file handles loading a workspace by ID and restoring workspace context
 * and state for the user session. It automatically collects all files in the
 * workspace directory recursively and provides comprehensive workspace information.
 *
 * Used by: MemoryManager agent for workspace loading operations
 * Integrates with: WorkspaceService for accessing workspace data
 * Refactored: Now uses dedicated services for data fetching, agent resolution,
 *             context building, and file collection following SOLID principles
 */

import { BaseMode } from '../../../baseMode';
import {
  LoadWorkspaceParameters,
  LoadWorkspaceResult
} from '../../../../database/types/workspace/ParameterTypes';
import { ProjectWorkspace } from '../../../../database/types/workspace/WorkspaceTypes';
import { parseWorkspaceContext } from '../../../../utils/contextUtils';
import { createErrorMessage } from '../../../../utils/errorUtils';
import { PaginationHelper } from '../../../../services/pagination/PaginationHelper';
import { PaginationInfo } from '../../../../types/pagination/PaginationTypes';

// Import refactored services
import { WorkspaceDataFetcher } from '../../services/WorkspaceDataFetcher';
import { WorkspaceAgentResolver } from '../../services/WorkspaceAgentResolver';
import { WorkspaceContextBuilder } from '../../services/WorkspaceContextBuilder';
import { WorkspaceFileCollector } from '../../services/WorkspaceFileCollector';

/**
 * Mode to load and restore a workspace by ID
 * Automatically collects all files in the workspace directory and provides complete workspace information
 *
 * Follows SOLID principles with service composition:
 * - WorkspaceDataFetcher: Handles session and state data retrieval
 * - WorkspaceAgentResolver: Resolves workspace agents
 * - WorkspaceContextBuilder: Builds context briefings and workflows
 * - WorkspaceFileCollector: Collects and organizes workspace files
 */
export class LoadWorkspaceMode extends BaseMode<LoadWorkspaceParameters, LoadWorkspaceResult> {
  private agent: any;

  // Composed services following Dependency Inversion Principle
  private dataFetcher: WorkspaceDataFetcher;
  private agentResolver: WorkspaceAgentResolver;
  private contextBuilder: WorkspaceContextBuilder;
  private fileCollector: WorkspaceFileCollector;

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

    // Initialize composed services
    this.dataFetcher = new WorkspaceDataFetcher();
    this.agentResolver = new WorkspaceAgentResolver();
    this.contextBuilder = new WorkspaceContextBuilder();
    this.fileCollector = new WorkspaceFileCollector();
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
        return this.createErrorResult('WorkspaceService not available', params);
      }

      // Get the workspace by ID or name (unified lookup)
      let workspace: ProjectWorkspace | undefined;
      try {
        workspace = await workspaceService.getWorkspaceByNameOrId(params.id);
      } catch (queryError) {
        console.error('[LoadWorkspaceMode] Failed to load workspace:', queryError);
        return this.createErrorResult(
          `Failed to load workspace: ${queryError instanceof Error ? queryError.message : String(queryError)}`,
          params
        );
      }

      if (!workspace) {
        console.error('[LoadWorkspaceMode] Workspace not found:', params.id);
        return this.createErrorResult(`Workspace '${params.id}' not found (searched by both name and ID)`, params);
      }

      // Update last accessed timestamp (use actual workspace ID, not the identifier)
      try {
        await workspaceService.updateLastAccessed(workspace.id);
      } catch (updateError) {
        console.warn('[LoadWorkspaceMode] Failed to update last accessed timestamp:', updateError);
        // Continue - this is not critical
      }

      // Get limit from params (default to 3)
      const limit = params.limit ?? 3;

      // Get memory service for data operations
      const memoryService = this.agent.getMemoryService();

      // Build context using services
      const context = await this.contextBuilder.buildContextBriefing(
        workspace,
        memoryService,
        limit
      );

      const workflows = this.contextBuilder.buildWorkflows(workspace);
      const keyFiles = this.contextBuilder.extractKeyFiles(workspace);
      const preferences = this.contextBuilder.buildPreferences(workspace);

      // Fetch sessions and states using data fetcher
      const sessions = await this.dataFetcher.fetchWorkspaceSessions(workspace.id, memoryService);
      const limitedSessions = sessions.slice(0, limit);

      const states = await this.dataFetcher.fetchWorkspaceStates(workspace.id, memoryService);
      const limitedStates = states.slice(0, limit);

      // Fetch agent data using agent resolver
      const app = this.agent.getApp();
      const agent = await this.agentResolver.fetchWorkspaceAgent(workspace, app);

      // Collect files using file collector
      const cacheManager = this.agent.getCacheManager();
      const recentFiles = await this.fileCollector.getRecentFilesInWorkspace(workspace, cacheManager);

      // Build workspace structure using file collector
      const workspacePathResult = await this.fileCollector.buildWorkspacePath(
        workspace.rootFolder,
        app
      );
      const allFiles = workspacePathResult.path?.files || [];

      // Apply pagination to workspace structure
      let structureFiles: string[];
      let structurePagination: PaginationInfo | undefined;

      const useStructurePagination = params.structurePage !== undefined || params.structurePageSize !== undefined;
      if (useStructurePagination || allFiles.length > PaginationHelper.DEFAULT_PAGE_SIZE) {
        // Use pagination for structure
        const paginated = PaginationHelper.paginate(allFiles, {
          page: params.structurePage ?? 0,
          pageSize: params.structurePageSize ?? PaginationHelper.DEFAULT_PAGE_SIZE
        });
        structureFiles = paginated.items;
        structurePagination = paginated.pagination;
      } else {
        // Small enough to return all
        structureFiles = allFiles;
      }

      const workspaceContext = {
        workspaceId: workspace.id,
        workspacePath: structureFiles  // Use string[] not WorkspacePath object
      };

      const result = {
        success: true,
        data: {
          context: context,
          workflows: workflows,
          workspaceStructure: {
            files: structureFiles,
            ...(structurePagination && { pagination: structurePagination })
          },
          recentFiles: recentFiles,
          keyFiles: keyFiles,
          preferences: preferences,
          sessions: limitedSessions,
          states: limitedStates,
          ...(agent && { agent: agent })
        },
        workspaceContext: workspaceContext
      };

      // Add navigation fallback message if workspace path building failed
      if (workspacePathResult.failed) {
        (result.data.context as any).recentActivity.push(
          "Note: Workspace directory navigation unavailable. Use vaultManager listDirectoryMode to explore the workspace folder structure."
        );
      }

      return result;

    } catch (error: any) {
      console.error(`[LoadWorkspaceMode] Unexpected error after ${Date.now() - startTime}ms:`, {
        message: error.message,
        stack: error.stack,
        params: params
      });

      return this.createErrorResult(
        createErrorMessage('Unexpected error loading workspace: ', error),
        params
      );
    }
  }

  /**
   * Create an error result with default data structure
   * Follows DRY principle by consolidating error result creation
   */
  protected createErrorResult(errorMessage: string, params: LoadWorkspaceParameters): LoadWorkspaceResult {
    return {
      success: false,
      error: errorMessage,
      data: {
        context: {
          name: 'Unknown',
          rootFolder: '',
          recentActivity: [errorMessage]
        },
        workflows: [],
        workspaceStructure: [],
        recentFiles: [],
        keyFiles: {},
        preferences: '',
        sessions: [],
        states: [],
      },
      workspaceContext: typeof params.workspaceContext === 'string'
        ? parseWorkspaceContext(params.workspaceContext) || undefined
        : params.workspaceContext
    };
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
          description: 'Workspace ID or name to load (REQUIRED). Accepts either the unique workspace ID or the workspace name.'
        },
        limit: {
          type: 'number',
          description: 'Optional limit for sessions, states, and recentActivity returned (default: 3)',
          default: 3,
          minimum: 1,
          maximum: 20
        },
        structurePage: {
          type: 'number',
          description: 'Page number (0-indexed) for workspaceStructure pagination. Use with structurePageSize.'
        },
        structurePageSize: {
          type: 'number',
          description: 'Items per page for workspaceStructure (default: 25, max: 200). Use with structurePage.'
        }
      },
      required: ['id']
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
            context: {
              type: 'string',
              description: 'Formatted contextual briefing about the workspace'
            },
            workflows: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of workflow strings - one per workflow (e.g. "**Daily Review** (Every morning): - Check inbox - Review calendar - Plan day")'
            },
            workspaceStructure: {
              type: 'array',
              items: { type: 'string' },
              description: 'Complete file structure of workspace with folder paths (e.g. "folder/subfolder/file.md")'
            },
            recentFiles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: {
                    type: 'string',
                    description: 'File path relative to workspace root'
                  },
                  modified: {
                    type: 'number',
                    description: 'Last modified timestamp'
                  }
                },
                required: ['path', 'modified']
              },
              description: 'Most recently modified files in workspace (up to 5)'
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
            sessions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Session ID'
                  },
                  name: {
                    type: 'string',
                    description: 'Session name'
                  },
                  description: {
                    type: 'string',
                    description: 'Session description'
                  },
                  created: {
                    type: 'number',
                    description: 'Session creation timestamp'
                  }
                },
                required: ['id', 'name', 'created']
              },
              description: 'Sessions in this workspace'
            },
            states: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'State ID'
                  },
                  name: {
                    type: 'string',
                    description: 'State name'
                  },
                  description: {
                    type: 'string',
                    description: 'State description'
                  },
                  sessionId: {
                    type: 'string',
                    description: 'Session ID this state belongs to'
                  },
                  created: {
                    type: 'number',
                    description: 'State creation timestamp'
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'State tags'
                  }
                },
                required: ['id', 'name', 'sessionId', 'created']
              },
              description: 'States in this workspace'
            },
            agent: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Agent ID'
                },
                name: {
                  type: 'string',
                  description: 'Agent name'
                },
                systemPrompt: {
                  type: 'string',
                  description: 'Agent system prompt'
                }
              },
              required: ['id', 'name', 'systemPrompt'],
              description: 'Associated workspace agent (if available)'
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
