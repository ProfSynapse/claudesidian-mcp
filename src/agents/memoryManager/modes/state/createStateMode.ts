import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { WorkspaceMemoryTrace } from '../../../../database/workspace-types';
import { CreateStateParams, StateResult } from '../../types';
import { parseWorkspaceContext } from '../../../../utils/contextUtils';

/**
 * Mode for creating a workspace state with rich context
 */
export class CreateStateMode extends BaseMode<CreateStateParams, StateResult> {
  /**
   * Create a new CreateStateMode
   * @param agent MemoryManager agent instance
   */
  constructor(private agent: MemoryManagerAgent) {
    super(
      'createState',
      'Create State',
      'Creates a workspace state with rich context',
      '1.0.0'
    );
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  async execute(params: CreateStateParams): Promise<StateResult> {
    try {
      // Validate parameters
      if (!params.name) {
        return this.prepareResult(false, undefined, 'State name is required');
      }
      
      // Get workspace database early so we can find an active workspace
      const workspaceDb = this.agent.getWorkspaceDb();
      if (!workspaceDb) {
        return this.prepareResult(false, undefined, 'Workspace database not available');
      }
      
      // Initialize workspace database if needed
      if (typeof workspaceDb.initialize === 'function') {
        await workspaceDb.initialize();
      }
      
      // Parse the workspace context using the utility function
      const workspaceCtx = parseWorkspaceContext(params.workspaceContext);
      
      // Get a workspaceId, either from context or by finding a default
      let workspaceId: string;
      
      // First check if it's in the parsed context
      if (workspaceCtx && workspaceCtx.workspaceId) {
        workspaceId = workspaceCtx.workspaceId;
      } else {
        // Try to find the first available workspace
        try {
          const workspaces = await workspaceDb.getWorkspaces({ limit: 1 });
          if (workspaces && workspaces.length > 0) {
            workspaceId = workspaces[0].id;
          } else {
            // Create a default workspace if none exists
            const defaultWorkspace = await workspaceDb.createWorkspace({
              name: 'Default Workspace',
              description: 'Automatically created default workspace',
              rootFolder: '/',
              hierarchyType: 'workspace'
            });
            workspaceId = defaultWorkspace.id;
          }
        } catch (error) {
          return this.prepareResult(
            false, 
            undefined, 
            `Failed to determine workspace: ${error.message}`,
            { sessionId: params.sessionId } // Pass session ID back in error
          );
        }
      }
      const name = params.name;
      const description = params.description || '';
      const targetSessionId = params.targetSessionId;
      const includeSummary = params.includeSummary !== false; // Default to true
      const includeFileContents = params.includeFileContents || false; // Default to false due to potential size
      const maxFiles = params.maxFiles || 10;
      const maxTraces = params.maxTraces || 20;
      const tags = params.tags || [];
      const reason = params.reason;
      
      // Get the activity embedder
      const activityEmbedder = this.agent.getActivityEmbedder();
      if (!activityEmbedder) {
        return this.prepareResult(false, undefined, 'Activity embedder not available');
      }
      
      // We've already initialized the workspaceDb above
      
      // Get the workspace data
      const workspace = await workspaceDb.getWorkspace(workspaceId);
      if (!workspace) {
        return this.prepareResult(
          false, 
          undefined, 
          `Workspace with ID ${workspaceId} not found`,
          { sessionId: params.sessionId, workspaceContext: params.workspaceContext }
        );
      }
      
      // Get the active session ID (either the one provided or the active one)
      let usedSessionId = targetSessionId;
      if (!usedSessionId) {
        usedSessionId = activityEmbedder.getActiveSession(workspaceId);
        
        // If still no active session, fail more gracefully
        if (!usedSessionId) {
          return this.prepareResult(
            false, 
            undefined, 
            'No active session found and no target session ID provided',
            { sessionId: params.sessionId, workspaceContext: params.workspaceContext }
          );
        }
      }
      
      // Check if the session exists
      const session = await workspaceDb.getSession(usedSessionId);
      if (!session) {
        return this.prepareResult(
          false, 
          undefined, 
          `Session with ID ${usedSessionId} not found`,
          { 
            sessionId: params.sessionId, 
            workspaceContext: params.workspaceContext 
          }
        );
      }
      
      // Enhance the state description with context if not provided
      let enhancedDescription = description;
      const stateDate = new Date().toLocaleString();
      
      if (!enhancedDescription) {
        enhancedDescription = `State created on ${stateDate}`;
        if (reason) {
          enhancedDescription += ` - Reason: ${reason}`;
        }
        enhancedDescription += ` - Session: ${session.name}`;
      }
      
      // Get recent traces for enhanced context
      const recentTraces = await workspaceDb.getSessionTraces(usedSessionId, maxTraces);
      
      // Extract key files
      const keyFiles = new Set<string>();
      recentTraces.forEach((trace: WorkspaceMemoryTrace) => {
        if (trace.metadata?.relatedFiles && Array.isArray(trace.metadata.relatedFiles)) {
          trace.metadata.relatedFiles.forEach((file: string) => keyFiles.add(file));
        }
      });
      
      // Limit to maximum number of files
      const includedFiles = Array.from(keyFiles).slice(0, maxFiles);
      
      // Generate a context summary if requested
      let contextSummary = '';
      if (includeSummary) {
        contextSummary = this.generateContextSummary(
          workspace,
          session,
          recentTraces,
          includedFiles,
          reason
        );
      }
      
      // Prepare enhanced metadata for the state
      const enhancedMetadata = {
        stateSource: 'memoryManager.createState',
        createdAt: stateDate,
        sessionName: session.name,
        sessionStartTime: new Date(session.startTime).toLocaleString(),
        workspaceName: workspace.name,
        reason: reason || 'Manual state save',
        summary: contextSummary,
        includedFiles,
        includesFileContents: includeFileContents,
        traceCount: recentTraces.length,
        tags: [...tags],
        contextPath: workspace.path
      };
      
      // Add the root folder as a tag if it exists
      if (workspace.rootFolder) {
        enhancedMetadata.tags.push(`folder:${workspace.rootFolder.split('/').pop()}`);
      }
      
      // Create the enhanced state (using the snapshot functionality)
      const stateId = await activityEmbedder.createStateSnapshot(
        workspaceId, 
        name, 
        enhancedDescription, 
        usedSessionId
      );
      
      // Record a memory trace about the state creation
      const stateTraceContent = `Created state "${name}" of workspace "${workspace.name}" at ${stateDate}
${reason ? `Reason: ${reason}` : ''}

This state captures the workspace state after ${recentTraces.length} activities in session "${session.name}"
and includes ${includedFiles.length} relevant files.

${contextSummary}`;

      try {
        await activityEmbedder.recordActivity(
          workspaceId,
          workspace.path,
          'checkpoint', // Using checkpoint type for states
          stateTraceContent,
          {
            tool: 'memoryManager.createState',
            params: {
              name,
              description: enhancedDescription,
              sessionId: usedSessionId,
              workspaceId,
              reason
            },
            result: {
              stateId,
              includedFiles,
              traceCount: recentTraces.length
            }
          },
          includedFiles,
          usedSessionId
        );
      } catch (error) {
        console.warn(`Failed to create memory trace for state: ${error.message}`);
      }
      
      // Return result with enhanced context
      return this.prepareResult(true, {
        stateId,
        name,
        workspaceId,
        sessionId: usedSessionId,
        timestamp: Date.now(),
        capturedContext: {
          summary: contextSummary,
          files: includedFiles,
          traceCount: recentTraces.length,
          tags: enhancedMetadata.tags,
          reason
        }
      });
    } catch (error) {
      return this.prepareResult(false, undefined, `Error creating state: ${error.message}`);
    }
  }
  
  /**
   * Generate a comprehensive context summary of the workspace state
   * @param workspace Workspace data
   * @param session Session data
   * @param traces Recent memory traces
   * @param files Relevant files
   * @param reason State reason
   * @returns Formatted summary string
   */
  private generateContextSummary(
    workspace: any,
    session: any,
    traces: WorkspaceMemoryTrace[],
    files: string[],
    reason?: string
  ): string {
    const timestamp = new Date().toLocaleString();
    
    let summary = `# Workspace State: ${workspace.name}\n`;
    summary += `Created: ${timestamp}\n`;
    
    if (reason) {
      summary += `Reason: ${reason}\n`;
    }
    
    summary += `\n## Workspace Information\n`;
    summary += `- Name: ${workspace.name}\n`;
    if (workspace.description) {
      summary += `- Description: ${workspace.description}\n`;
    }
    summary += `- Type: ${workspace.hierarchyType} level\n`;
    summary += `- Root folder: ${workspace.rootFolder}\n`;
    summary += `- Created: ${new Date(workspace.created).toLocaleString()}\n`;
    summary += `- Last accessed: ${new Date(workspace.lastAccessed).toLocaleString()}\n`;
    
    summary += `\n## Session Information\n`;
    summary += `- Session: ${session.name || 'Unnamed session'}\n`;
    summary += `- Started: ${new Date(session.startTime).toLocaleString()}\n`;
    if (session.description) {
      summary += `- Description: ${session.description}\n`;
    }
    summary += `- Tool calls in session: ${session.toolCalls || 0}\n`;
    
    // Add activity summary
    if (traces.length > 0) {
      summary += `\n## Recent Activities (${traces.length})\n`;
      
      // Group traces by activity type
      const groupedActivities: Record<string, number> = {};
      traces.forEach(trace => {
        const activityType = trace.activityType;
        groupedActivities[activityType] = (groupedActivities[activityType] || 0) + 1;
      });
      
      // Show activity type counts
      for (const [activityType, count] of Object.entries(groupedActivities)) {
        summary += `- ${count} ${activityType.replace('_', ' ')} activities\n`;
      }
      
      // List most recent traces
      summary += `\n### Most Recent Activities\n`;
      traces
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5)
        .forEach(trace => {
          const date = new Date(trace.timestamp).toLocaleString();
          const tool = trace.metadata?.tool || 'unknown tool';
          summary += `- ${date}: ${this.summarizeTrace(trace)} (using ${tool})\n`;
        });
    }
    
    // Add file information
    if (files.length > 0) {
      summary += `\n## Relevant Files (${files.length})\n`;
      files.forEach(file => {
        summary += `- ${file}\n`;
      });
    }
    
    return summary;
  }
  
  /**
   * Generate a human-readable summary of a memory trace
   * @param trace The memory trace to summarize
   * @returns Summary string
   */
  private summarizeTrace(trace: WorkspaceMemoryTrace): string {
    // Extract key information from the trace
    const tool = trace.metadata?.tool || 'unknown tool';
    
    // Create a summary based on activity type
    switch (trace.activityType) {
      case 'project_plan':
        return `Project planning with ${tool}`;
      case 'question':
        return `Research/questions using ${tool}`;
      case 'checkpoint':
        return `Progress checkpoint using ${tool}`;
      case 'completion':
        return `Completion status update using ${tool}`;
      case 'research':
        return `Research using ${tool}`;
      default:
        // Extract a short summary from content
        const contentPreview = trace.content.substring(0, 50).trim();
        return contentPreview ? `${contentPreview}...` : `Activity using ${tool}`;
    }
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    // Create the mode-specific schema
    const modeSchema = {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the state'
        },
        description: {
          type: 'string',
          description: 'Description of the state'
        },
        targetSessionId: {
          type: 'string',
          description: 'Optional target session ID to associate with this state'
        },
        includeSummary: {
          type: 'boolean',
          description: 'Whether to include state summary',
          default: true
        },
        includeFileContents: {
          type: 'boolean',
          description: 'Whether to include files content in the state',
          default: false
        },
        maxFiles: {
          type: 'number',
          description: 'Maximum number of files to include',
          default: 10
        },
        maxTraces: {
          type: 'number',
          description: 'Maximum number of memory traces to include',
          default: 20
        },
        tags: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Tags to associate with this state'
        },
        reason: {
          type: 'string',
          description: 'Optional reason for creating this state'
        },
        workspaceContext: {
          oneOf: [
            {
              type: 'object',
              properties: {
                workspaceId: { 
                  type: 'string',
                  description: 'Workspace identifier (optional - uses first available workspace if not provided)' 
                },
                workspacePath: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Path from root workspace to specific phase/task'
                }
              },
              description: 'Optional workspace context object'
            },
            {
              type: 'string',
              description: 'Optional workspace context as JSON string - should contain workspaceId field'
            }
          ],
          description: 'Optional workspace context - if not provided, uses the first available workspace'
        },
        sessionId: {
          type: 'string',
          description: 'Session ID for tracking this tool call (distinct from targetSessionId which is the session to create the state from)'
        }
      },
      required: ['name']
    };
    
    // Merge with common schema
    return this.getMergedSchema(modeSchema);
  }
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    // Use the base result schema from BaseMode
    const baseSchema = super.getResultSchema();
    
    // Add mode-specific data properties
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        stateId: {
          type: 'string',
          description: 'ID of the created state'
        },
        name: {
          type: 'string',
          description: 'Name of the state'
        },
        workspaceId: {
          type: 'string',
          description: 'ID of the workspace'
        },
        sessionId: {
          type: 'string',
          description: 'ID of the associated session'
        },
        timestamp: {
          type: 'number',
          description: 'State creation timestamp'
        },
        capturedContext: {
          type: 'object',
          description: 'Information about the captured context',
          properties: {
            summary: {
              type: 'string',
              description: 'Summary of the workspace state at save time'
            },
            files: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'List of key files included in the state'
            },
            traceCount: {
              type: 'number',
              description: 'Number of memory traces included'
            },
            tags: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Tags associated with this state'
            },
            reason: {
              type: 'string',
              description: 'State creation reason'
            }
          },
          required: ['files', 'traceCount', 'tags']
        }
      },
      required: ['stateId', 'name', 'workspaceId', 'timestamp', 'capturedContext']
    };
    
    return baseSchema;
  }
}