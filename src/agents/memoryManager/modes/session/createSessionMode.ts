import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { WorkspaceMemoryTrace, WorkspaceSession } from '../../../../database/workspace-types';
import { CreateSessionParams, SessionResult } from '../../types';
import { getErrorMessage, createErrorMessage } from '../../../../utils/errorUtils';

/**
 * Mode for creating a new session with rich context
 */
export class CreateSessionMode extends BaseMode<CreateSessionParams, SessionResult> {
  /**
   * Create a new CreateSessionMode
   * @param agent MemoryManager agent instance
   */
  constructor(private agent: MemoryManagerAgent) {
    super(
      'createSession',
      'Create Session',
      'Creates a new tool activity tracking session with memory context',
      '1.0.0'
    );
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  async execute(params: CreateSessionParams): Promise<SessionResult> {
    try {
      // First get the inherited workspace context using the base class method
      // This handles string parsing and ensures a consistent structure
      const inheritedContext = this.getInheritedWorkspaceContext(params);
      
      // Set workspaceId either from context or generate a default one
      let workspaceId = inheritedContext?.workspaceId;
      
      // Get the services
      const memoryService = this.agent.getMemoryService();
      const workspaceService = this.agent.getWorkspaceService();
      
      if (!memoryService || !workspaceService) {
        return this.prepareResult(false, undefined, 'Memory or workspace service not available');
      }
      
      // If no valid workspaceId was found, use default
      if (!workspaceId) {
        try {
          // Try to find the default workspace
          const workspaces = await workspaceService.getWorkspaces({ 
            sortBy: 'lastAccessed', 
            sortOrder: 'desc', 
          });
          
          if (workspaces && workspaces.length > 0) {
            workspaceId = workspaces[0].id;
          } else {
            // Create a default workspace if none exists
            const defaultWorkspace = await workspaceService.createWorkspace({
              name: 'Default Workspace',
              description: 'Automatically created default workspace',
              rootFolder: '/',
              hierarchyType: 'workspace',
              created: Date.now(),
              lastAccessed: Date.now(),
              childWorkspaces: [],
              path: [],
              relatedFolders: [],
              relevanceSettings: {
                folderProximityWeight: 0.5,
                recencyWeight: 0.7,
                frequencyWeight: 0.3
              },
              activityHistory: [],
              completionStatus: {},
              status: 'active'
            });
            workspaceId = defaultWorkspace.id;
          }
        } catch (error) {
          return this.prepareResult(false, undefined, createErrorMessage('Failed to determine workspace: ', error));
        }
      }
      
      // At this point workspaceId should be defined
      if (!workspaceId) {
        return this.prepareResult(false, undefined, 'Failed to determine workspace ID');
      }
      
      const name = params.name;
      const description = params.description;
      const sessionGoal = params.sessionGoal;
      const previousSessionId = params.previousSessionId;
      const tags = params.tags || [];
      const contextDepth = params.contextDepth || 'standard';
      const generateContextTrace = params.generateContextTrace !== false; // Default to true
      
      // Get the activity embedder for backward compatibility
      // Note: This is a transitional approach during Chroma integration
      const activityEmbedder = (this.agent as any).plugin?.getActivityEmbedder?.();
      
      // Get the workspace data
      const workspace = await workspaceService.getWorkspace(workspaceId);
      if (!workspace) {
        return this.prepareResult(
          false, 
          undefined, 
          `Workspace with ID ${workspaceId} not found`, 
          { workspaceContext: params.workspaceContext, sessionId: params.sessionId }
        );
      }
      
      // Check if a session with the provided ID already exists (if ID was provided)
      let existingSession: WorkspaceSession | undefined = undefined;
      if (params.sessionId) {
        try {
          existingSession = await memoryService.getSession(params.sessionId);
        } catch (error) {
          console.warn(`Error checking for existing session: ${getErrorMessage(error)}`);
        }
      }
      
      // If a session with this ID already exists, generate a new ID
      // This ensures we don't reuse session IDs and cause conflicts
      const finalId = existingSession ? undefined : params.sessionId;
      
      // Create the session
      const sessionToCreate = {
        workspaceId,
        name: name || `Session ${new Date().toLocaleString()}`,
        description: description || (sessionGoal ? `Goal: ${sessionGoal}` : undefined),
        startTime: Date.now(),
        isActive: true,
        toolCalls: 0,
        previousSessionId,
        id: finalId // Use provided ID if available and not already used
      };
      
      // Create session using memory service
      const session = await memoryService.createSession(sessionToCreate);
      const finalSessionId = session.id;
      
      // Prepare context data for the result
      let contextData: {
        summary: string;
        relevantFiles?: string[];
        recentActivities?: Array<{
          timestamp: number;
          description: string;
          type: string;
        }>;
        tags: string[];
      } = {
        summary: `Workspace: ${workspace.name}`,
        tags: [...tags]
      };
      
      // Add workspace root folder to tags
      if (workspace.rootFolder) {
        contextData.tags.push(`folder:${workspace.rootFolder.split('/').pop()}`);
      }
      
      // If we have a previous session, add continuity context
      let previousSessionInfo = '';
      if (previousSessionId) {
        try {
          const previousSession = await memoryService.getSession(previousSessionId);
          if (previousSession) {
            // Add previous session information to context
            previousSessionInfo = `Continues from previous session "${previousSession.name}" `;
            previousSessionInfo += previousSession.endTime 
              ? `(${new Date(previousSession.startTime).toLocaleString()} - ${new Date(previousSession.endTime).toLocaleString()})`
              : `(started ${new Date(previousSession.startTime).toLocaleString()})`;
            
            // Add previous session tags
            contextData.tags.push('continuation');
            
            // Add most relevant previous traces to context
            if (contextDepth !== 'minimal') {
              // Check if the method exists
              let previousTraces: WorkspaceMemoryTrace[] = [];
              if (typeof memoryService.getSessionTraces === 'function') {
                previousTraces = await memoryService.getSessionTraces(previousSessionId, contextDepth === 'comprehensive' ? 20 : 10);
              } else {
                // Fall back to getting traces for the workspace
                previousTraces = await memoryService.getMemoryTraces(workspaceId, contextDepth === 'comprehensive' ? 20 : 10);
              }
              
              // Get files referenced in previous session
              const relevantFiles = new Set<string>();
              previousTraces.forEach((trace: WorkspaceMemoryTrace) => {
                if (trace.metadata?.relatedFiles && Array.isArray(trace.metadata.relatedFiles)) {
                  trace.metadata.relatedFiles.forEach((file: string) => relevantFiles.add(file));
                }
              });
              
              if (relevantFiles.size > 0) {
                contextData.relevantFiles = Array.from(relevantFiles);
              }
              
              // Summarize recent activities
              contextData.recentActivities = previousTraces.map((trace: WorkspaceMemoryTrace) => ({
                timestamp: trace.timestamp,
                description: this.summarizeTrace(trace),
                type: trace.activityType
              }));
            }
          }
        } catch (error) {
          console.warn(`Failed to retrieve previous session data: ${getErrorMessage(error)}`);
        }
      }
      
      // Build a comprehensive context summary
      let contextSummary = `Workspace: ${workspace.name}\n`;
      
      if (workspace.description) {
        contextSummary += `Description: ${workspace.description}\n`;
      }
      
      if (previousSessionInfo) {
        contextSummary += `${previousSessionInfo}\n`;
      }
      
      if (sessionGoal) {
        contextSummary += `Goal: ${sessionGoal}\n`;
      }
      
      // Include summary of workspace hierarchy
      contextSummary += `Type: ${workspace.hierarchyType} level`;
      if (workspace.parentId) {
        try {
          const parent = await workspaceService.getWorkspace(workspace.parentId);
          if (parent) {
            contextSummary += ` within "${parent.name}"`;
          }
        } catch (error) {
          console.warn(`Failed to retrieve parent workspace: ${getErrorMessage(error)}`);
        }
      }
      
      if (workspace.childWorkspaces && workspace.childWorkspaces.length > 0) {
        contextSummary += `\nContains ${workspace.childWorkspaces.length} sub-items`;
      }
      
      // If contextDepth > minimal, include activity history summary
      if (contextDepth !== 'minimal' && workspace.activityHistory && workspace.activityHistory.length > 0) {
        // Get recent activities (last 5 for standard, last 10 for comprehensive)
        const recentActivities = workspace.activityHistory
          .sort((a: any, b: any) => b.timestamp - a.timestamp)
          .slice(0, contextDepth === 'comprehensive' ? 10 : 5);
        
        if (recentActivities.length > 0) {
          contextSummary += '\n\nRecent workspace activities:';
          recentActivities.forEach((activity: any) => {
            const date = new Date(activity.timestamp).toLocaleString();
            let activityDesc = `\n- ${date}: `;
            
            switch (activity.action) {
              case 'view':
                activityDesc += 'Viewed content';
                break;
              case 'edit':
                activityDesc += 'Modified content';
                break;
              case 'create':
                activityDesc += 'Created content';
                break;
              case 'tool':
                activityDesc += `Used ${activity.toolName || 'a tool'}`;
                break;
              default:
                activityDesc += 'Interacted with workspace';
            }
            
            contextSummary += activityDesc;
          });
        }
      }
      
      // Update the context summary
      contextData.summary = contextSummary;
      
      // If enabled, create an initial memory trace to establish session context
      if (generateContextTrace) {
        try {
          const contextTraceContent = `Session initialized with the following context:
          
${contextSummary}

${sessionGoal ? `This session's goal is to: ${sessionGoal}` : ''}
${previousSessionId ? 'This session continues work from a previous session.' : 'This is a new session starting from scratch.'}`;

          // Create a memory trace
          await memoryService.storeMemoryTrace({
            sessionId: finalSessionId,
            workspaceId: workspaceId,
            timestamp: Date.now(),
            content: contextTraceContent,
            activityType: 'project_plan', // Using project_plan as the type for session initialization
            metadata: {
              tool: 'memoryManager.createSession',
              params: {
                name,
                description,
                sessionGoal,
                previousSessionId,
                workspaceId
              },
              result: {
                sessionId: finalSessionId,
                workspaceId
              },
              relatedFiles: contextData.relevantFiles || []
            },
            workspacePath: workspace.path || [],
            contextLevel: workspace.hierarchyType || 'workspace',
            importance: 0.7,
            tags: contextData.tags || []
          });
          
          // For backward compatibility, also use the activity embedder if available
          if (activityEmbedder && typeof activityEmbedder.recordActivity === 'function') {
            await activityEmbedder.recordActivity(
              workspaceId,
              workspace.path,
              'project_plan',
              contextTraceContent,
              {
                tool: 'memoryManager.createSession',
                params: {
                  name,
                  description,
                  sessionGoal,
                  previousSessionId,
                  workspaceId
                },
                result: {
                  sessionId: finalSessionId,
                  workspaceId
                }
              },
              contextData.relevantFiles || [],
              finalSessionId
            );
          }
        } catch (error) {
          console.warn(`Failed to create initial memory trace: ${getErrorMessage(error)}`);
        }
      }
      
      // Return result with context
      return this.prepareResult(true, {
        sessionId: finalSessionId,
        name: name || `Session ${new Date().toLocaleString()}`,
        workspaceId,
        startTime: Date.now(),
        previousSessionId,
        memoryContext: contextData
      });
    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Error creating session: ', error));
    }
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
          description: 'Name for the session'
        },
        description: {
          type: 'string',
          description: 'Description of the session purpose'
        },
        generateContextTrace: {
          type: 'boolean',
          description: 'Whether to generate an initial memory trace with session context',
          default: true
        },
        sessionGoal: {
          type: 'string',
          description: 'The goal or purpose of this session (for memory context)'
        },
        previousSessionId: {
          type: 'string',
          description: 'Reference to previous session ID to establish continuity'
        },
        tags: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Tags to associate with this session'
        },
        contextDepth: {
          type: 'string',
          enum: ['minimal', 'standard', 'comprehensive'],
          description: 'How much context to include in the initial memory trace',
          default: 'standard'
        },
        workspaceContext: {
          oneOf: [
            {
              type: 'object',
              properties: {
                workspaceId: { 
                  type: 'string',
                  description: 'Workspace identifier (optional - uses default workspace if not provided)' 
                },
                workspacePath: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Path from root workspace to specific phase/task'
                }
              },
              description: 'Optional workspace context object - if not provided, uses a default workspace'
            },
            {
              type: 'string',
              description: 'Optional workspace context as JSON string - must contain workspaceId field'
            }
          ],
          description: 'Optional workspace context - if not provided, uses a default workspace'
        }
      }
    };
    
    // Merge with common schema (session id and handoff)
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
          description: 'ID of the created session'
        },
        name: {
          type: 'string',
          description: 'Name of the created session'
        },
        workspaceId: {
          type: 'string',
          description: 'ID of the workspace'
        },
        startTime: {
          type: 'number',
          description: 'Session start timestamp'
        },
        previousSessionId: {
          type: 'string',
          description: 'ID of the previous session (if continuing)'
        },
        context: {
          type: 'string',
          description: 'Contextual information about the operation (from CommonResult)'
        },
        memoryContext: {
          type: 'object',
          description: 'Detailed contextual information about the session',
          properties: {
            summary: {
              type: 'string',
              description: 'Summary of the workspace state at session start'
            },
            relevantFiles: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Key files relevant to this session'
            },
            recentActivities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  timestamp: {
                    type: 'number',
                    description: 'When the activity occurred'
                  },
                  description: {
                    type: 'string',
                    description: 'Description of the activity'
                  },
                  type: {
                    type: 'string',
                    description: 'Type of activity'
                  }
                }
              },
              description: 'Recent activities in the workspace'
            },
            tags: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Tags describing this session'
            }
          },
          required: ['summary', 'tags']
        }
      },
      required: ['sessionId', 'workspaceId', 'startTime']
    };
    
    return baseSchema;
  }
}