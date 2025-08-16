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
 */

import { BaseMode } from '../../../baseMode';
import { 
  LoadWorkspaceParameters, 
  LoadWorkspaceResult 
} from '../../../../database/types/workspace/ParameterTypes';
import { ProjectWorkspace } from '../../../../database/types/workspace/WorkspaceTypes';
import { parseWorkspaceContext } from '../../../../utils/contextUtils';
import { createErrorMessage } from '../../../../utils/errorUtils';

/**
 * Mode to load and restore a workspace by ID
 * Automatically collects all files in the workspace directory and provides complete workspace information
 */
export class LoadWorkspaceMode extends BaseMode<LoadWorkspaceParameters, LoadWorkspaceResult> {
  private agent: any;
  
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
        return {
          success: false,
          error: 'WorkspaceService not available',
          data: {
            context: {
              name: 'Unknown',
              rootFolder: '',
              recentActivity: ['WorkspaceService not available']
            },
            workflow: '',
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
      
      // Get the workspace by ID
      let workspace: ProjectWorkspace | undefined;
      try {
        workspace = await workspaceService.getWorkspace(params.id);
      } catch (queryError) {
        console.error('[LoadWorkspaceMode] Failed to load workspace:', queryError);
        return {
          success: false,
          error: `Failed to load workspace: ${queryError instanceof Error ? queryError.message : String(queryError)}`,
          data: {
            context: {
              name: 'Unknown',
              rootFolder: '',
              recentActivity: ['Failed to load workspace']
            },
            workflow: '',
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
      
      if (!workspace) {
        console.error('[LoadWorkspaceMode] Workspace not found:', params.id);
        return {
          success: false,
          error: `Workspace with ID '${params.id}' not found`,
          data: {
            context: {
              name: 'Unknown',
              rootFolder: '',
              recentActivity: ['Workspace not found']
            },
            workflow: '',
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
      
      
      // Update last accessed timestamp
      try {
        await workspaceService.updateLastAccessed(params.id);
      } catch (updateError) {
        console.warn('[LoadWorkspaceMode] Failed to update last accessed timestamp:', updateError);
        // Continue - this is not critical
      }
      
      // Build actionable context briefing
      const context = await this.buildContextBriefing(workspace);
      
      // Build workflow summary
      const workflow = this.buildWorkflowSummary(workspace);
      
      // Extract key files
      const keyFiles = this.extractKeyFiles(workspace);
      
      // Build preferences summary
      const preferences = this.buildPreferences(workspace);
      
      // Get memory service for sessions and states data
      const memoryService = this.agent.getMemoryService();
      
      // Fetch sessions for this workspace
      const sessions = await this.fetchWorkspaceSessions(workspace.id, memoryService);
      
      // Fetch states for this workspace
      const states = await this.fetchWorkspaceStates(workspace.id, memoryService);
      
      // Fetch agent data if workspace has associated agents
      const agent = await this.fetchWorkspaceAgent(workspace);
      
      // Update workspace context
      const workspacePathResult = await this.buildWorkspacePath(workspace.rootFolder);
      const workspaceContext = {
        workspaceId: workspace.id,
        workspacePath: workspacePathResult.path
      };
      
      const result = {
        success: true,
        data: {
          context: context,
          workflow: workflow,
          keyFiles: keyFiles,
          preferences: preferences,
          sessions: sessions,
          states: states,
          ...(agent && { agent: agent })
        },
        workspaceContext: workspaceContext
      };

      // Add navigation fallback message if workspace path building failed
      if (workspacePathResult.failed) {
        (result.data.context as any).recentActivity.push("Note: Workspace directory navigation unavailable. Use vaultManager listDirectoryMode to explore the workspace folder structure.");
      }
      
      // CRITICAL: Force memory cleanup after workspace loading
      // This is essential because memory traces can consume 10MB+ with embeddings
      this.forceMemoryCleanup(`LoadWorkspaceMode completed for workspace ${params.id}`);
      
      return result;
      
    } catch (error: any) {
      console.error(`[LoadWorkspaceMode] Unexpected error after ${Date.now() - startTime}ms:`, {
        message: error.message,
        stack: error.stack,
        params: params
      });
      
      // CRITICAL: Force cleanup even on error to prevent memory leaks
      this.forceMemoryCleanup(`LoadWorkspaceMode error cleanup for workspace ${params.id}`);
      
      return {
        success: false,
        error: createErrorMessage('Unexpected error loading workspace: ', error),
        data: {
          context: {
            name: 'Unknown',
            rootFolder: '',
            recentActivity: ['Unexpected error loading workspace']
          },
          workflow: '',
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
  }
  
  /**
   * Build a contextual briefing for the workspace as JSON object
   */
  private async buildContextBriefing(workspace: ProjectWorkspace): Promise<{
    name: string;
    description?: string;
    purpose?: string;
    rootFolder: string;
    recentActivity: string[];
  }> {
    console.log(`[LoadWorkspaceMode] 🔍 DEBUG: Building context briefing for workspace ${workspace.id}`);
    
    // Get memory service for recent activity
    const memoryService = this.agent.getMemoryService();
    console.log(`[LoadWorkspaceMode] 🔍 DEBUG: Memory service available: ${!!memoryService}`);
    
    let recentActivity: string[] = [];
    
    if (memoryService) {
      console.log(`[LoadWorkspaceMode] 🔍 DEBUG: Calling getRecentActivity for workspace ${workspace.id}`);
      try {
        recentActivity = await this.getRecentActivity(workspace.id, memoryService);
        console.log(`[LoadWorkspaceMode] 🔍 DEBUG: getRecentActivity returned ${recentActivity.length} items:`, recentActivity);
      } catch (error) {
        console.error(`[LoadWorkspaceMode] 🔍 DEBUG: getRecentActivity failed:`, error);
        recentActivity = [`Recent activity error: ${error instanceof Error ? error.message : String(error)}`];
      }
    } else {
      console.log(`[LoadWorkspaceMode] 🔍 DEBUG: No memory service - using fallback`);
      recentActivity = ["No recent activity"];
    }
    
    const finalActivity = recentActivity.length > 0 ? recentActivity : ["No recent activity"];
    console.log(`[LoadWorkspaceMode] 🔍 DEBUG: Final recent activity:`, finalActivity);

    return {
      name: workspace.name,
      description: workspace.description || undefined,
      purpose: workspace.context?.purpose || undefined,
      rootFolder: workspace.rootFolder,
      recentActivity: finalActivity
    };
  }
  
  /**
   * Build a workflow summary
   */
  private buildWorkflowSummary(workspace: ProjectWorkspace): string {
    if (!workspace.context?.workflows || workspace.context.workflows.length === 0) {
      return 'No workflows defined';
    }
    
    const workflows = workspace.context.workflows.map(workflow => {
      const steps = workflow.steps.map(step => `  - ${step}`).join('\n');
      return `**${workflow.name}** (${workflow.when}):\n${steps}`;
    }).join('\n\n');
    
    return workflows;
  }
  
  /**
   * Extract key files into a flat structure
   */
  private extractKeyFiles(workspace: ProjectWorkspace): Record<string, string> {
    const keyFiles: Record<string, string> = {};
    
    if (workspace.context?.keyFiles) {
      workspace.context.keyFiles.forEach(category => {
        Object.entries(category.files).forEach(([name, path]) => {
          keyFiles[name] = path;
        });
      });
    }
    
    return keyFiles;
  }
  
  /**
   * Build preferences summary
   */
  private buildPreferences(workspace: ProjectWorkspace): string {
    const prefs: string[] = [];
    
    if (workspace.context?.preferences && workspace.context.preferences.length > 0) {
      prefs.push(...workspace.context.preferences);
    }
    
    if (workspace.preferences?.userPreferences) {
      prefs.push(...workspace.preferences.userPreferences);
    }
    
    return prefs.length > 0 ? prefs.join('\n- ') : 'No preferences set';
  }
  
  
  
  /**
   * Build workspace path with folder path and flat files list
   */
  private async buildWorkspacePath(rootFolder: string): Promise<{path: any, failed: boolean}> {
    try {
      const app = this.agent.getApp();
      const folder = app.vault.getAbstractFileByPath(rootFolder);
      
      if (!folder || !('children' in folder)) {
        console.warn('[LoadWorkspaceMode] Workspace root folder not found or empty:', rootFolder);
        return { path: { folder: rootFolder, files: [] }, failed: true };
      }
      
      // Collect all files recursively with relative paths
      const files = this.collectAllFiles(folder as any, rootFolder);
      
      return { 
        path: {
          folder: rootFolder,
          files: files
        }, 
        failed: false 
      };
      
    } catch (error) {
      console.warn('[LoadWorkspaceMode] Failed to build workspace path:', error);
      return { path: { folder: rootFolder, files: [] }, failed: true };
    }
  }

  /**
   * Collect all files recursively as flat list with relative paths
   */
  private collectAllFiles(folder: any, basePath: string): string[] {
    const files: string[] = [];
    
    if (!folder.children) {
      return files;
    }
    
    for (const child of folder.children) {
      if ('children' in child) {
        // It's a folder - recurse into it
        const subFiles = this.collectAllFiles(child, basePath);
        files.push(...subFiles);
      } else {
        // It's a file - add with relative path from base
        const relativePath = child.path.replace(basePath + '/', '');
        files.push(relativePath);
      }
    }
    
    return files.sort();
  }

  /**
   * Get recent activity from memory traces
   */
  private async getRecentActivity(workspaceId: string, memoryService: any): Promise<string[]> {
    console.log(`[LoadWorkspaceMode] 🔍 DEBUG: getRecentActivity called with workspaceId: ${workspaceId}`);
    let traces: any[] = [];
    try {
      console.log(`[LoadWorkspaceMode] 🔍 DEBUG: Calling memoryService.getMemoryTraces`);
      traces = await memoryService.getMemoryTraces(workspaceId, 5);
      console.log(`[LoadWorkspaceMode] 🔍 DEBUG: getMemoryTraces returned ${traces.length} traces`);
      
      if (traces.length > 0) {
        console.log(`[LoadWorkspaceMode] 🔍 DEBUG: Sample trace structure:`, {
          id: traces[0].id,
          hasDocument: !!traces[0].document,
          hasMetadata: !!traces[0].metadata,
          workspaceIdInMetadata: traces[0].metadata?.workspaceId,
          workspaceInMetadata: traces[0].metadata?.workspace
        });
      }
      
      console.log(`[LoadWorkspaceMode] 🔍 DEBUG: Calling extractSessionMemories`);
      const sessionMemories = this.extractSessionMemories(traces);
      console.log(`[LoadWorkspaceMode] 🔍 DEBUG: extractSessionMemories returned ${sessionMemories.length} activities:`, sessionMemories);
      
      // CRITICAL MEMORY CLEANUP: Clear large trace data immediately after processing
      this.cleanupTraceMemory(traces);
      
      return sessionMemories;
    } catch (error) {
      console.warn('[LoadWorkspaceMode] 🔍 DEBUG: Failed to get recent activity:', error);
      // Cleanup traces even on error
      if (traces.length > 0) {
        this.cleanupTraceMemory(traces);
      }
      return ["Recent activity unavailable"];
    }
  }

  /**
   * Clean up memory trace data to prevent memory leaks
   * This is critical because each trace contains large embedding arrays (~6KB each)
   */
  private cleanupTraceMemory(traces: any[]): void {
    if (!traces || traces.length === 0) return;
    
    // Clear embedding arrays (these are the largest memory consumers)
    traces.forEach(trace => {
      if (trace.embedding) {
        trace.embedding.length = 0;
        trace.embedding = null;
      }
      
      // Clear large document content after we've extracted what we need
      if (trace.content && trace.content.length > 1000) {
        trace.content = null;
      }
      
      // Clear large metadata objects
      if (trace.metadata) {
        // Keep essential fields, clear large ones
        if (trace.metadata.params) trace.metadata.params = null;
        if (trace.metadata.result) trace.metadata.result = null;
      }
    });
    
    // Clear the array itself
    traces.length = 0;
  }

  /**
   * Force garbage collection and memory cleanup
   * This is critical after loading memory traces to prevent memory bloat
   */
  private forceMemoryCleanup(operation: string): void {
    try {
      // Log memory usage before cleanup (if available)
      if (typeof (global as any).gc === 'function') {
        console.debug(`[LoadWorkspaceMode] ${operation} - Forcing garbage collection`);
        (global as any).gc();
      } else if (typeof window !== 'undefined' && (window as any).gc) {
        console.debug(`[LoadWorkspaceMode] ${operation} - Forcing browser garbage collection`);
        (window as any).gc();
      }
      
      // Additional cleanup hints
      if (typeof global !== 'undefined' && global.gc) {
        global.gc();
      }
      
      // Schedule delayed cleanup to catch any remaining references
      setTimeout(() => {
        try {
          if (typeof (global as any).gc === 'function') {
            (global as any).gc();
          }
        } catch (e) {
          // Ignore GC errors
        }
      }, 100);
      
    } catch (error) {
      // Garbage collection is not always available, that's fine
      console.debug(`[LoadWorkspaceMode] ${operation} - GC not available, relying on natural cleanup`);
    }
  }

  /**
   * Extract sessionMemory values from memory traces
   */
  private extractSessionMemories(traces: any[]): string[] {
    console.log(`[LoadWorkspaceMode] 🔍 DEBUG: extractSessionMemories called with ${traces.length} traces`);
    const sessionMemories: string[] = [];
    
    for (let i = 0; i < traces.length; i++) {
      const trace = traces[i];
      console.log(`[LoadWorkspaceMode] 🔍 DEBUG: Processing trace ${i + 1}/${traces.length}:`, {
        id: trace.id,
        hasContent: !!trace.content,
        contentPreview: trace.content?.substring(0, 100)
      });
      
      try {
        // Parse the structured document from content
        let document: any;
        try {
          document = JSON.parse(trace.content);
          console.log(`[LoadWorkspaceMode] 🔍 DEBUG: Parsed structured document:`, {
            hasRequest: !!document.request,
            hasContext: !!document.request?.context,
            hasSessionMemory: !!document.request?.context?.sessionMemory
          });
        } catch (parseError) {
          console.log(`[LoadWorkspaceMode] 🔍 DEBUG: Could not parse as JSON, skipping trace`);
          continue;
        }
        
        // Extract sessionMemory from structured document
        if (document.request?.context?.sessionMemory) {
          const sessionMemory = document.request.context.sessionMemory;
          console.log(`[LoadWorkspaceMode] 🔍 DEBUG: Found sessionMemory: ${sessionMemory}`);
          sessionMemories.push(sessionMemory);
        } else {
          console.log(`[LoadWorkspaceMode] 🔍 DEBUG: No sessionMemory found in structured document`);
        }
      } catch (error) {
        console.log(`[LoadWorkspaceMode] 🔍 DEBUG: Error processing trace ${i + 1}:`, error instanceof Error ? error.message : String(error));
        continue;
      }
    }
    
    console.log(`[LoadWorkspaceMode] 🔍 DEBUG: extractSessionMemories found ${sessionMemories.length} session memories`);
    return sessionMemories.slice(0, 5);
  }

  
  /**
   * Fetch sessions for a workspace
   */
  private async fetchWorkspaceSessions(workspaceId: string, memoryService: any): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    created: number;
  }>> {
    try {
      if (!memoryService) {
        return [];
      }
      
      const sessions = await memoryService.getSessions(workspaceId, false); // Get all sessions, not just active
      
      return sessions.map((session: any) => ({
        id: session.id,
        name: session.name,
        description: session.description,
        created: session.startTime
      }));
      
    } catch (error) {
      console.warn('[LoadWorkspaceMode] Failed to fetch sessions:', error);
      return [];
    }
  }

  /**
   * Fetch states for a workspace
   */
  private async fetchWorkspaceStates(workspaceId: string, memoryService: any): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    sessionId: string;
    created: number;
    tags?: string[];
  }>> {
    try {
      if (!memoryService) {
        return [];
      }
      
      const states = await memoryService.getStates(workspaceId);
      
      return states.map((state: any) => ({
        id: state.id,
        name: state.name,
        description: state.description,
        sessionId: state.sessionId,
        created: state.created || state.timestamp,
        tags: state.state?.metadata?.tags || []
      }));
      
    } catch (error) {
      console.warn('[LoadWorkspaceMode] Failed to fetch states:', error);
      return [];
    }
  }

  /**
   * Fetch workspace agent data if available
   */
  private async fetchWorkspaceAgent(workspace: ProjectWorkspace): Promise<{
    id: string;
    name: string;
    systemPrompt: string;
  } | null> {
    try {
      // Check if workspace has associated agents
      if (!workspace.context?.agents || workspace.context.agents.length === 0) {
        return null;
      }

      // Get the first agent (primary workspace agent)
      const agentRef = workspace.context.agents[0];
      
      // Get CustomPromptStorageService through plugin's agentManager
      const plugin = this.agent.getApp().plugins.getPlugin('claudesidian-mcp') as any;
      if (!plugin || !plugin.agentManager) {
        console.warn('[LoadWorkspaceMode] AgentManager not available');
        return null;
      }
      
      const agentManagerAgent = plugin.agentManager.getAgent('agentManager');
      if (!agentManagerAgent || !agentManagerAgent.storageService) {
        console.warn('[LoadWorkspaceMode] AgentManagerAgent or storage service not available');
        return null;
      }

      // Fetch agent by name
      const agent = agentManagerAgent.storageService.getPromptByName(agentRef.name);
      if (!agent) {
        console.warn(`[LoadWorkspaceMode] Agent '${agentRef.name}' not found in storage`);
        return null;
      }

      return {
        id: agent.id,
        name: agent.name,
        systemPrompt: agent.prompt
      };

    } catch (error) {
      console.warn('[LoadWorkspaceMode] Failed to fetch workspace agent:', error);
      return null;
    }
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
          description: 'Workspace ID to load (REQUIRED)'
        }
      },
      required: ['id']
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
            context: {
              type: 'string',
              description: 'Formatted contextual briefing about the workspace'
            },
            workflow: {
              type: 'string',
              description: 'Formatted workflow information'
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