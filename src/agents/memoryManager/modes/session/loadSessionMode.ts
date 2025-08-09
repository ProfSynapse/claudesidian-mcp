import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../MemoryManager';
import { WorkspaceMemoryTrace, WorkspaceSession } from '../../../../database/workspace-types';
import { LoadSessionParams, SessionResult } from '../../types';
import { parseWorkspaceContext } from '../../../../utils/contextUtils';
import { MetadataSearchService } from '../../../../database/services/search/MetadataSearchService';

import { extractContextFromParams } from '../../../../utils/contextUtils';
/**
 * Mode for loading a session with comprehensive context restoration
 */
export class LoadSessionMode extends BaseMode<LoadSessionParams, SessionResult> {
  /**
   * Create a new LoadSessionMode
   * @param agent MemoryManager agent instance
   */
  constructor(private agent: MemoryManagerAgent) {
    super(
      'loadSession',
      'Load Session',
      'Loads a session with comprehensive context restoration',
      '1.0.0'
    );
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  async execute(params: LoadSessionParams): Promise<SessionResult> {
    try {
      // Validate parameters
      if (!params.sessionId) {
        return this.prepareResult(false, undefined, 'Session ID is required');
      }
      
      // Get services
      const memoryService = this.agent.getMemoryService();
      const workspaceService = this.agent.getWorkspaceService();
      
      if (!memoryService || !workspaceService) {
        return this.prepareResult(false, undefined, 'Memory or workspace services not available');
      }
      
      // If no workspace context is provided, initialize it to default
      if (!params.workspaceContext) {
        params.workspaceContext = { workspaceId: 'system' };
      } else {
        const parsedContext = parseWorkspaceContext(params.workspaceContext);
        if (!parsedContext?.workspaceId) {
          params.workspaceContext = {
            ...(typeof params.workspaceContext === 'object' ? params.workspaceContext : {}),
            workspaceId: 'system'
          };
        }
      }
      
      const sessionId = params.sessionId;
      const sessionName = params.sessionName;
      const sessionDescription = params.sessionDescription;
      const contextDepth = params.contextDepth || 'standard';
      const tags = params.tags || [];
      
      // Default to creating a continuation session
      const createContinuationSession = params.createContinuationSession !== false;
      
      // Get the session data first
      const session = await memoryService.getSession(sessionId);
      if (!session) {
        return this.prepareResult(false, undefined, `Session with ID ${sessionId} not found`);
      }
      
      // Store session information for context
      const workspaceId = session.workspaceId;
      const originalSessionName = session.name || 'Unnamed session';
      const sessionTimestamp = session.startTime;
      // sessionEndTimestamp is not used
      const isActive = session.isActive;
      const sessionCreatedAt = new Date(sessionTimestamp).toLocaleString();
      
      // Get workspace info
      const workspace = await workspaceService.getWorkspace(workspaceId);
      if (!workspace) {
        return this.prepareResult(false, undefined, `Workspace with ID ${workspaceId} not found`);
      }
      
      // Get session memory traces based on context depth
      let sessionTraces: WorkspaceMemoryTrace[] = [];
      const traceLimit = contextDepth === 'comprehensive' ? 100 : 
                        contextDepth === 'standard' ? 20 : 5;
      
      try {
        sessionTraces = await memoryService.getSessionTraces(sessionId, traceLimit);
      } catch (error) {
        console.warn(`Failed to retrieve session traces: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Extract associated notes from traces
      const associatedNotes = new Set<string>();
      for (const trace of sessionTraces) {
        if (trace.metadata && trace.metadata.relatedFiles) {
          for (const file of trace.metadata.relatedFiles) {
            if (file) {
              associatedNotes.add(file);
            }
          }
        }
      }
      
      // Try to get key files based on the workspace root folder
      if (workspace && workspace.rootFolder) {
        try {
          const app = this.agent.getApp();
          if (app) {
            const metadataSearchService = new MetadataSearchService(app);
            
            // Search for files with 'key: true' property
            const keyFiles = await metadataSearchService.searchByProperty('key', 'true', {
              path: workspace.rootFolder,
              limit: 10
            });
            
            for (const file of keyFiles) {
              associatedNotes.add(file.path);
            }
            
            // Add common key file patterns
            const commonKeyFilePatterns = [
              /readme\.md$/i, 
              /index\.md$/i, 
              /summary\.md$/i, 
              /moc\.md$/i, 
              /map(?:\s|_|-)*of(?:\s|_|-)*contents\.md$/i
            ];
            
            const files = app.vault.getMarkdownFiles()
              .filter((file: { path: string }) => file.path.startsWith(workspace.rootFolder));
              
            for (const file of files) {
              for (const pattern of commonKeyFilePatterns) {
                if (pattern.test(file.path) && !associatedNotes.has(file.path)) {
                  associatedNotes.add(file.path);
                  break;
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to get key files: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // Prepare session initialization data
      let newSessionId: string;
      
      // Create a continuation session if requested and original is inactive
      if (createContinuationSession && !isActive) {
        // Generate a descriptive session name if not provided
        const generatedSessionName = sessionName || 
          `Continuation from "${originalSessionName}" (${sessionCreatedAt})`;
        
        // Generate a descriptive session description if not provided
        const generatedDescription = sessionDescription || 
          `Session continuing from "${originalSessionName}" in workspace "${workspace.name}".`;
        
        // Create the continuation session
        const newSession = await memoryService.createSession({
          workspaceId,
          name: generatedSessionName,
          description: generatedDescription,
          startTime: Date.now(),
          isActive: true,
          toolCalls: 0,
        });
        
        newSessionId = newSession.id;
      } else {
        // If session is active or continuation not requested, use the original
        newSessionId = sessionId;
      }
      
      // Generate session summary
      const sessionSummary = this.generateSessionSummary(
        workspace,
        session,
        sessionCreatedAt,
        sessionTraces,
        Array.from(associatedNotes),
        contextDepth
      );
      
      // Create a trace of the session loading operation
      if (createContinuationSession && newSessionId !== sessionId) {
        try {
          await memoryService.storeMemoryTrace({
            sessionId: newSessionId,
            workspaceId: workspaceId,
            timestamp: Date.now(),
            content: `Loaded session "${originalSessionName}" created on ${sessionCreatedAt} in workspace "${workspace.name}".\n\nThis session contains ${sessionTraces.length} memory traces and ${associatedNotes.size} associated notes.`,
            activityType: 'checkpoint',
            metadata: {
              tool: 'memoryManager.loadSession',
              params: {
                sessionId,
                workspaceId
              },
              result: {
                newSessionId,
                sessionTraces: sessionTraces.length,
                associatedNotes: Array.from(associatedNotes)
              },
              relatedFiles: Array.from(associatedNotes)
            },
            workspacePath: workspace.path || [],
            contextLevel: workspace.hierarchyType || 'workspace',
            importance: 0.7,
            tags: tags || []
          });
        } catch (error) {
          console.warn(`Failed to create memory trace for session loading: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // Return result with context
      return this.prepareResult(true, {
        sessionId,
        name: originalSessionName,
        workspaceId,
        newSessionId,
        isActive: session.isActive,
        timestamp: Date.now(),
        sessionContext: {
          summary: sessionSummary,
          associatedNotes: Array.from(associatedNotes),
          sessionCreatedAt,
          traces: contextDepth === 'comprehensive' ? this.summarizeTraces(sessionTraces) : undefined,
          tags: [...tags, 'loaded-session', `workspace:${workspace.name}`]
        }
      });
    } catch (error) {
      return this.prepareResult(false, undefined, `Error loading session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Generate a comprehensive session summary
   * @param workspace Workspace data
   * @param session Session data
   * @param sessionCreatedAt Formatted creation date
   * @param traces Memory traces
   * @param associatedNotes Associated notes
   * @param contextDepth Depth of context to include
   * @returns Formatted summary string
   */
  private generateSessionSummary(
    workspace: any,
    session: WorkspaceSession,
    sessionCreatedAt: string,
    traces: WorkspaceMemoryTrace[],
    associatedNotes: string[],
    contextDepth: 'minimal' | 'standard' | 'comprehensive' = 'standard'
  ): string {
    const loadedTimestamp = new Date().toLocaleString();
    
    let summary = `# Session Context Summary\n`;
    summary += `Loaded at: ${loadedTimestamp}\n`;
    summary += `Session: "${session.name || 'Unnamed session'}" (created on ${sessionCreatedAt})\n`;
    summary += `Status: ${session.isActive ? 'Active' : 'Completed'}\n`;
    
    if (session.description) {
      summary += `\n## Session Description\n${session.description}\n`;
    }
    
    summary += `\n## Workspace Information\n`;
    summary += `- Name: ${workspace.name}\n`;
    if (workspace.description) {
      summary += `- Description: ${workspace.description}\n`;
    }
    summary += `- Type: ${workspace.hierarchyType} level\n`;
    summary += `- Root folder: ${workspace.rootFolder}\n`;
    
    // Include activity information if not minimal context
    if (contextDepth !== 'minimal' && traces.length > 0) {
      summary += `\n## Session Activity\n`;
      summary += `This session includes ${traces.length} memory traces.\n`;
      
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
      
      // If comprehensive, include more detailed trace information
      if (contextDepth === 'comprehensive') {
        // List most significant traces (by importance)
        summary += `\n### Key Activities\n`;
        traces
          .sort((a, b) => b.importance - a.importance)
          .slice(0, 5)
          .forEach(trace => {
            const date = new Date(trace.timestamp).toLocaleString();
            const tool = trace.metadata?.tool || 'unknown tool';
            summary += `- ${date}: ${this.summarizeTrace(trace)} (using ${tool})\n`;
          });
      }
    }
    
    // Include files information
    if (associatedNotes.length > 0) {
      summary += `\n## Associated Notes (${associatedNotes.length})\n`;
      associatedNotes.forEach(file => {
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
   * Summarize traces for inclusion in the result
   * @param traces Traces to summarize
   * @returns Array of summarized traces
   */
  private summarizeTraces(traces: WorkspaceMemoryTrace[]): Array<{
    timestamp: number;
    content: string;
    type: string;
    importance: number;
  }> {
    return traces
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(trace => ({
        timestamp: trace.timestamp,
        content: trace.content.substring(0, 150) + (trace.content.length > 150 ? '...' : ''),
        type: trace.activityType,
        importance: trace.importance
      }))
      .slice(0, 10); // Limit to 10 most recent traces
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
        sessionId: {
          type: 'string',
          description: 'ID of the session to load'
        },
        sessionName: {
          type: 'string',
          description: 'Custom name for the new continuation session'
        },
        sessionDescription: {
          type: 'string',
          description: 'Custom description for the new continuation session'
        },
        createContinuationSession: {
          type: 'boolean',
          description: 'Whether to automatically start a new session if the original is inactive',
          default: true
        },
        contextDepth: {
          type: 'string',
          enum: ['minimal', 'standard', 'comprehensive'],
          description: 'Depth of context to include in the restoration',
          default: 'standard'
        },
        tags: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Tags to associate with the continuation session'
        }
      },
      required: ['sessionId']
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
        sessionId: {
          type: 'string',
          description: 'ID of the session that was loaded'
        },
        name: {
          type: 'string',
          description: 'Name of the session'
        },
        workspaceId: {
          type: 'string',
          description: 'ID of the workspace'
        },
        newSessionId: {
          type: 'string',
          description: 'ID of the newly created session (if applicable)'
        },
        isActive: {
          type: 'boolean',
          description: 'Whether the session is active'
        },
        timestamp: {
          type: 'number',
          description: 'Loading timestamp'
        },
        sessionContext: {
          type: 'object',
          description: 'Information about the session context',
          properties: {
            summary: {
              type: 'string',
              description: 'Summary of the session'
            },
            associatedNotes: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'List of notes associated with the session'
            },
            sessionCreatedAt: {
              type: 'string',
              description: "Session's original creation date"
            },
            traces: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  timestamp: {
                    type: 'number',
                    description: 'When the trace was created'
                  },
                  content: {
                    type: 'string',
                    description: 'Content of the trace'
                  },
                  type: {
                    type: 'string',
                    description: 'Type of activity'
                  },
                  importance: {
                    type: 'number',
                    description: 'Importance score of the trace'
                  }
                }
              },
              description: 'Summarized memory traces'
            },
            tags: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Tags associated with this session context'
            }
          },
          required: ['summary', 'associatedNotes', 'sessionCreatedAt', 'tags']
        }
      },
      required: ['sessionId', 'workspaceId', 'newSessionId', 'timestamp', 'sessionContext']
    };
    
    return baseSchema;
  }
}