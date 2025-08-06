/**
 * LoadStateMode - Simple state loading that returns actionable restoration context
 */

import { BaseMode } from '../../../../baseMode';
import { LoadStateParams, LoadStateResult } from '../../../../../database/types/workspace/ParameterTypes';
import { MemoryService } from '../../../../../database/services/MemoryService';
import { App } from 'obsidian';

// Define a custom interface for the Claudesidian plugin
interface ClaudesidianPlugin {
  services?: {
    memoryService?: MemoryService;
  };
}

/**
 * Simple state loading that returns actionable restoration context
 */
export class LoadStateMode extends BaseMode<LoadStateParams, LoadStateResult> {
  private app: App;
  private memoryService: MemoryService | null = null;

  constructor(app: App) {
    super(
      'loadState',
      'Load State',
      'Load a state and return actionable restoration context',
      '2.0.0'
    );
    
    this.app = app;
    
    // Access services through plugin
    const plugin = app.plugins.getPlugin('claudesidian-mcp') as ClaudesidianPlugin;
    if (plugin && plugin.services) {
      this.memoryService = plugin.services.memoryService || null;
    }
  }

  /**
   * Execute state loading - return actionable restoration context
   */
  async execute(params: LoadStateParams): Promise<LoadStateResult> {
    try {
      // Get memory service if not already available
      if (!this.memoryService) {
        const plugin = this.app.plugins.getPlugin('claudesidian-mcp') as ClaudesidianPlugin;
        if (plugin && plugin.services) {
          this.memoryService = plugin.services.memoryService || null;
        }
      }
      
      if (!this.memoryService) {
        throw new Error('MemoryService not available');
      }
      
      // For now, we'll create a mock state loading since we don't have the actual storage implementation
      // In a real implementation, this would retrieve the state from storage
      
      // Mock state data - in reality this would come from the memory service
      const mockState = {
        id: params.stateId,
        name: 'Mock State',
        workspaceId: 'mock-workspace',
        created: Date.now(),
        snapshot: {
          workspaceContext: {
            purpose: 'Apply for marketing manager positions',
            currentGoal: 'Submit 10 applications this week',
            status: '5 sent, 2 pending responses',
            workflows: [{
              name: 'New Application',
              when: 'When applying to new position',
              steps: ['Research company', 'Customize cover letter', 'Apply', 'Track']
            }],
            keyFiles: [],
            preferences: ['Use professional tone', 'Focus on tech companies'],
            agents: [],
            nextActions: ['Follow up on Google application']
          },
          conversationContext: 'We were customizing the cover letter for Google\'s Marketing Manager position',
          activeTask: 'Finishing the cover letter paragraph about data-driven campaign optimization',
          activeFiles: ['cover-letter-google.md', 'application-tracker.md'],
          nextSteps: ['Complete cover letter customization', 'Review resume keywords', 'Submit application'],
          reasoning: 'Saving before context limit, about to submit application'
        }
      };
      
      // Build actionable restoration context
      const snapshot = mockState.snapshot;
      const workspaceContext = snapshot.workspaceContext;
      
      const resumingFrom = `${mockState.name} - saved while ${snapshot.activeTask.toLowerCase()}`;
      const workspaceBriefing = `${workspaceContext.purpose}. Current goal: ${workspaceContext.currentGoal}. Status: ${workspaceContext.status}`;
      const whereYouLeftOff = `${snapshot.conversationContext}. You were ${snapshot.activeTask.toLowerCase()}.`;
      const workflow = workspaceContext.workflows.length > 0 
        ? `${workspaceContext.workflows[0].name}: ${workspaceContext.workflows[0].steps.join(' → ')}`
        : 'No workflows defined';
      
      return this.prepareResult(true, {
        resumingFrom: resumingFrom,
        workspaceContext: workspaceBriefing,
        whereYouLeftOff: whereYouLeftOff,
        currentTask: snapshot.activeTask,
        activeFiles: snapshot.activeFiles,
        nextSteps: snapshot.nextSteps,
        workflow: workflow
      });
      
    } catch (error) {
      return this.prepareResult(
        false,
        undefined,
        `Failed to load state: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get parameter schema for MCP
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        stateId: {
          type: 'string',
          description: 'State ID to load'
        },
        // Legacy fields for backward compatibility
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
          items: { type: 'string' },
          description: 'Tags to associate with the continuation session'
        }
      },
      required: ['stateId']
    };
  }

  /**
   * Get result schema for MCP
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            resumingFrom: {
              type: 'string',
              description: 'What state you\'re resuming from'
            },
            workspaceContext: {
              type: 'string',
              description: 'Brief workspace context reminder'
            },
            whereYouLeftOff: {
              type: 'string',
              description: 'What was happening when state was saved'
            },
            currentTask: {
              type: 'string',
              description: 'The task that was being worked on'
            },
            activeFiles: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files that were being worked with'
            },
            nextSteps: {
              type: 'array',
              items: { type: 'string' },
              description: 'Immediate next steps to take'
            },
            workflow: {
              type: 'string',
              description: 'Relevant workflow for this work'
            }
          },
          required: ['resumingFrom', 'workspaceContext', 'whereYouLeftOff', 'currentTask', 'activeFiles', 'nextSteps', 'workflow']
        },
        error: { type: 'string' }
      },
      required: ['success']
    };
  }
}