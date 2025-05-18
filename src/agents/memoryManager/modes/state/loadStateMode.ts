import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { WorkspaceMemoryTrace, WorkspaceStateSnapshot } from '../../../../database/workspace-types';
import { LoadStateParams, StateResult } from '../../types';
import { parseWorkspaceContext } from '../../../../utils/contextUtils';
import { MemoryService } from '../../../../database/services/MemoryService';
import { WorkspaceService } from '../../../../database/services/WorkspaceService';

/**
 * Mode for loading a workspace state with comprehensive context restoration
 */
export class LoadStateMode extends BaseMode<LoadStateParams, StateResult> {
  /**
   * Create a new LoadStateMode
   * @param agent MemoryManager agent instance
   */
  constructor(private agent: MemoryManagerAgent) {
    super(
      'loadState',
      'Load State',
      'Loads a workspace state with comprehensive context restoration',
      '1.0.0'
    );
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  async execute(params: LoadStateParams): Promise<StateResult> {
    try {
      // Validate parameters
      if (!params.stateId) {
        return this.prepareResult(false, undefined, 'State ID is required');
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
      
      const stateId = params.stateId;
      const sessionName = params.sessionName;
      const sessionDescription = params.sessionDescription;
      const restorationGoal = params.restorationGoal;
      const contextDepth = params.contextDepth || 'standard';
      const tags = params.tags || [];
      
      // Default to creating a continuation session
      const createContinuationSession = params.createContinuationSession !== false;
      
      // Get the state data first to provide better context and error handling
      const state = await memoryService.getSnapshot(stateId);
      if (!state) {
        return this.prepareResult(false, undefined, `State with ID ${stateId} not found`);
      }
      
      // Store original state information for context
      const workspaceId = state.workspaceId;
      const originalSessionId = state.sessionId;
      const stateTimestamp = state.timestamp;
      const stateName = state.name;
      const stateCreatedAt = new Date(stateTimestamp).toLocaleString();
      
      // Try to get the original session information
      let originalSessionName = 'Unknown session';
      let originalSessionDescription: string | undefined;
      try {
        const originalSession = await memoryService.getSession(originalSessionId);
        if (originalSession) {
          originalSessionName = originalSession.name || 'Unnamed session';
          originalSessionDescription = originalSession.description;
        }
      } catch (error) {
        console.warn(`Failed to retrieve original session: ${error.message}`);
      }
      
      // For backward compatibility
      // Note: This is a transitional approach during Chroma integration
      const activityEmbedder = (this.agent as any).plugin?.getActivityEmbedder?.();
      
      // Since MemoryService doesn't have a direct restoreStateSnapshot method yet,
      // we'll use the activity embedder for backward compatibility
      if (activityEmbedder && typeof activityEmbedder.restoreStateSnapshot === 'function') {
        await activityEmbedder.restoreStateSnapshot(stateId);
      } else {
        console.warn('State restoration functionality not fully implemented in MemoryService');
        // In a complete implementation, we would add this functionality to MemoryService
      }
      
      // Prepare session initialization data
      let newSessionId: string;
      const restorationDate = new Date();
      
      // Create a continuation session if requested
      if (createContinuationSession) {
        // Generate a descriptive session name if not provided
        const generatedSessionName = sessionName || 
          `Continuation from "${stateName}" (${stateCreatedAt})`;
        
        // Generate a descriptive session description if not provided
        const generatedDescription = sessionDescription || 
          `Session continuing from state "${stateName}" created during "${originalSessionName}". ${
            restorationGoal ? `\nGoal: ${restorationGoal}` : ''
          }`;
        
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
        
        // For backward compatibility
        if (activityEmbedder && typeof activityEmbedder.createSession === 'function') {
          await activityEmbedder.createSession(
            workspaceId,
            generatedSessionName,
            generatedDescription
          );
        }
      } else {
        // If not creating a continuation session, just get the active session
        const activeSessions = await memoryService.getSessions(workspaceId, true);
        newSessionId = activeSessions.length > 0 ? 
          activeSessions[0].id : 
          (activityEmbedder ? activityEmbedder.getActiveSession(workspaceId) : 'unknown');
      }
      
      // Get details about the restored workspace
      const workspace = await workspaceService.getWorkspace(workspaceId);
      if (!workspace) {
        return this.prepareResult(false, undefined, `Restored workspace with ID ${workspaceId} not found`);
      }
      
      // Get details about the restored state files and context
      const stateFiles = state.state?.contextFiles || [];
      
      // Build context information
      let continuationHistory: Array<{ timestamp: number; description: string }> = [];
      let restoredTraces: WorkspaceMemoryTrace[] = [];
      
      // Get all states for this workspace to build continuity history
      let historyStates: WorkspaceStateSnapshot[] = [];
      try {
        historyStates = await memoryService.getSnapshots(workspaceId);
        
        // Sort by timestamp
        historyStates.sort((a, b) => a.timestamp - b.timestamp);
        
        // Build history timeline
        continuationHistory = historyStates.map(snap => ({
          timestamp: snap.timestamp,
          description: snap.id === stateId 
            ? `Current restoration point: "${snap.name}"`
            : `State: "${snap.name}"`
        }));
        
        // Add the current restoration point
        continuationHistory.push({
          timestamp: Date.now(),
          description: `Loaded state "${stateName}"`
        });
      } catch (error) {
        console.warn(`Failed to build state history: ${error.message}`);
      }
      
      // If comprehensive context is requested, retrieve detailed trace information
      if (contextDepth === 'comprehensive') {
        try {
          // Get traces referenced in the state
          if (state.state?.recentTraces && Array.isArray(state.state.recentTraces) && state.state.recentTraces.length > 0) {
            // Get all memory traces for the workspace
            const allTraces = await memoryService.getMemoryTraces(workspaceId, 100);
            
            // Filter to include only the ones referenced in the state
            for (const traceId of state.state.recentTraces) {
              const trace = allTraces.find(t => t.id === traceId);
              if (trace) {
                restoredTraces.push(trace);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to retrieve detailed trace information: ${error.message}`);
        }
      }
      
      // Generate a rich context summary
      const contextSummary = this.generateRestorationSummary(
        workspace,
        state,
        stateCreatedAt,
        originalSessionName,
        restorationGoal,
        stateFiles,
        restoredTraces,
        contextDepth
      );
      
      // Build the final tags list
      const resultTags = [...tags];
      resultTags.push('restored-state');
      
      // Add workspace root folder to tags
      if (workspace.rootFolder) {
        resultTags.push(`folder:${workspace.rootFolder.split('/').pop()}`);
      }
      
      // If the state had tags, add them with the 'state-' prefix
      const stateTags = state.state?.metadata?.tags;
      if (stateTags && Array.isArray(stateTags)) {
        stateTags.forEach(tag => {
          if (typeof tag === 'string' && !resultTags.includes(`state-${tag}`)) {
            resultTags.push(`state-${tag}`);
          }
        });
      }
      
      // Record a memory trace about the restoration in the new session
      if (createContinuationSession) {
        const restorationTraceContent = `Loaded from state "${stateName}" created on ${stateCreatedAt} during session "${originalSessionName}"

This state captured ${stateFiles.length} relevant files and contains workspace state from "${workspace.name}".

${restorationGoal ? `Restoration goal: ${restorationGoal}\n` : ''}

${contextSummary}`;

        try {
          // Create memory trace using MemoryService
          await memoryService.storeMemoryTrace({
            sessionId: newSessionId,
            workspaceId: workspaceId,
            timestamp: Date.now(),
            content: restorationTraceContent,
            activityType: 'checkpoint',
            metadata: {
              tool: 'memoryManager.loadState',
              params: {
                stateId,
                workspaceId,
                restorationGoal
              },
              result: {
                newSessionId,
                stateFiles,
                originalSessionId
              },
              relatedFiles: stateFiles
            },
            workspacePath: workspace.path || [],
            contextLevel: workspace.hierarchyType || 'workspace',
            importance: 0.7,
            tags: tags || []
          });
          
          // For backward compatibility
          if (activityEmbedder && typeof activityEmbedder.recordActivity === 'function') {
            await activityEmbedder.recordActivity(
              workspaceId,
              workspace.path || [],
              'checkpoint',
              restorationTraceContent,
              {
                tool: 'memoryManager.loadState',
                params: {
                  stateId,
                  workspaceId,
                  restorationGoal
                },
                result: {
                  newSessionId,
                  stateFiles,
                  originalSessionId
                }
              },
              stateFiles,
              newSessionId
            );
          }
        } catch (error) {
          console.warn(`Failed to create memory trace for restoration: ${error.message}`);
        }
      }
      
      // Return result with context
      return this.prepareResult(true, {
        stateId,
        name: stateName, 
        workspaceId,
        sessionId: originalSessionId,
        newSessionId,
        timestamp: Date.now(),
        restoredContext: {
          summary: contextSummary,
          relevantFiles: stateFiles,
          stateCreatedAt,
          originalSessionId,
          continuationHistory,
          tags: resultTags
        }
      });
    } catch (error) {
      return this.prepareResult(false, undefined, `Error loading state: ${error.message}`);
    }
  }
  
  /**
   * Generate a comprehensive restoration summary
   * @param workspace Workspace data
   * @param state State data
   * @param stateCreatedAt Formatted creation date
   * @param originalSessionName Original session name
   * @param restorationGoal Optional restoration goal
   * @param files Relevant files
   * @param traces Memory traces if available
   * @param contextDepth Depth of context to include
   * @returns Formatted summary string
   */
  private generateRestorationSummary(
    workspace: any,
    state: WorkspaceStateSnapshot,
    stateCreatedAt: string,
    originalSessionName: string,
    restorationGoal?: string,
    files: string[] = [],
    traces: WorkspaceMemoryTrace[] = [],
    contextDepth: 'minimal' | 'standard' | 'comprehensive' = 'standard'
  ): string {
    const restorationTimestamp = new Date().toLocaleString();
    
    let summary = `# Workspace Restoration Summary\n`;
    summary += `Loaded at: ${restorationTimestamp}\n`;
    summary += `From state: "${state.name}" (created on ${stateCreatedAt})\n`;
    summary += `Original session: "${originalSessionName}"\n`;
    
    if (restorationGoal) {
      summary += `\n## Restoration Goal\n${restorationGoal}\n`;
    }
    
    summary += `\n## Workspace Information\n`;
    summary += `- Name: ${workspace.name}\n`;
    if (workspace.description) {
      summary += `- Description: ${workspace.description}\n`;
    }
    summary += `- Type: ${workspace.hierarchyType} level\n`;
    summary += `- Root folder: ${workspace.rootFolder}\n`;
    
    // If not minimal context, include state metadata
    if (contextDepth !== 'minimal' && state.state.metadata) {
      summary += `\n## State Metadata\n`;
      
      const metadata = state.state.metadata;
      for (const [key, value] of Object.entries(metadata)) {
        // Skip complex objects or large text fields
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          summary += `- ${key}: ${value}\n`;
        } else if (Array.isArray(value) && value.length < 10) {
          summary += `- ${key}: ${value.join(', ')}\n`;
        }
      }
      
      // Include state description if available
      if (state.description) {
        summary += `\n## State Description\n${state.description}\n`;
      }
    }
    
    // Include files information
    if (files.length > 0) {
      summary += `\n## Relevant Files (${files.length})\n`;
      files.forEach(file => {
        summary += `- ${file}\n`;
      });
    }
    
    // If comprehensive context is requested and traces are available, include detailed information
    if (contextDepth === 'comprehensive' && traces.length > 0) {
      summary += `\n## Historical Context\n`;
      summary += `This state includes ${traces.length} memory traces from the original session.\n`;
      
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
        stateId: {
          type: 'string',
          description: 'ID of the state to load'
        },
        sessionName: {
          type: 'string',
          description: 'Custom name for the new continuation session'
        },
        sessionDescription: {
          type: 'string',
          description: 'Custom description for the new continuation session'
        },
        restorationGoal: {
          type: 'string',
          description: 'What the user intends to do after restoring'
        },
        createContinuationSession: {
          type: 'boolean',
          description: 'Whether to automatically start a new session',
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
      required: ['stateId']
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
          description: 'ID of the state that was loaded'
        },
        name: {
          type: 'string',
          description: 'Name of the state'
        },
        workspaceId: {
          type: 'string',
          description: 'ID of the restored workspace'
        },
        sessionId: {
          type: 'string',
          description: 'ID of the original session'
        },
        newSessionId: {
          type: 'string',
          description: 'ID of the newly created session'
        },
        timestamp: {
          type: 'number',
          description: 'Restoration timestamp'
        },
        restoredContext: {
          type: 'object',
          description: 'Information about the restored context',
          properties: {
            summary: {
              type: 'string',
              description: 'Summary of the restored state'
            },
            relevantFiles: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'List of key files included in the state'
            },
            stateCreatedAt: {
              type: 'string',
              description: "State's original creation date"
            },
            originalSessionId: {
              type: 'string',
              description: 'The session that created the state'
            },
            continuationHistory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  timestamp: {
                    type: 'number',
                    description: 'When the event occurred'
                  },
                  description: {
                    type: 'string',
                    description: 'Description of the event'
                  }
                }
              },
              description: 'Continuation history (timeline)'
            },
            tags: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Tags associated with this restoration'
            }
          },
          required: ['summary', 'relevantFiles', 'stateCreatedAt', 'originalSessionId', 'tags']
        }
      },
      required: ['stateId', 'workspaceId', 'newSessionId', 'timestamp', 'restoredContext']
    };
    
    return baseSchema;
  }
}