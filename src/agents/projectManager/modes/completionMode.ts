import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CompletionArgs, CompletionResult } from '../types';

/**
 * Mode for indicating task completion and summarizing work done
 */
export class CompletionMode extends BaseMode<CompletionArgs, CompletionResult> {
  private app: App;

  /**
   * Create a new CompletionMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'completion',
      'Completion',
      'Signal completion of a task and summarize work that was done. This tool does NOT interact with the Obsidian vault. Use this when you believe you have completed a requested task. IMPORTANT: When using this mode, report the completion to the user, summarize what was accomplished, and wait for user confirmation before continuing with any other modes or actions.',
      '1.0.0'
    );

    this.app = app;
  }

  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of the completion
   */
  async execute(params: CompletionArgs): Promise<CompletionResult> {
    const { 
      taskName, 
      completionSummary, 
      changesImplemented = [], 
      challenges = [], 
      projectPath = 'internal-reference-only' 
    } = params;

    return {
      taskName,
      completionSummary,
      changesImplemented,
      challenges,
      projectPath,
      success: true,
      requiresUserInput: true,
      pauseExecution: true,
      message: "TASK COMPLETED: This summarizes the completed work. Please review the changes and provide feedback or further instructions."
    };
  }

  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    return {
      type: "object",
      properties: {
        taskName: {
          type: 'string',
          description: 'Name of the completed task'
        },
        completionSummary: {
          type: 'string',
          description: 'Comprehensive summary of what was accomplished and how'
        },
        changesImplemented: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'List of specific changes that were implemented'
        },
        challenges: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Any challenges encountered and how they were resolved'
        },
        projectPath: {
          type: 'string',
          description: 'Optional: For internal reference only. This does NOT interact with the Obsidian vault.'
        }
      },
      required: ['taskName', 'completionSummary'],
      description: 'Signal the completion of a task and provide a comprehensive summary of work that was done. This tool does NOT interact with the Obsidian vault.'
    };
  }

  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    return {
      type: "object",
      properties: {
        taskName: {
          type: 'string',
          description: 'Name of the completed task'
        },
        completionSummary: {
          type: 'string',
          description: 'Comprehensive summary of what was accomplished and how'
        },
        changesImplemented: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'List of specific changes that were implemented'
        },
        challenges: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Any challenges encountered and how they were resolved'
        },
        projectPath: {
          type: 'string',
          description: 'Internal reference only (not an actual vault path)'
        },
        success: {
          type: 'boolean',
          description: 'Whether the completion report was created successfully'
        },
        requiresUserInput: {
          type: 'boolean',
          description: 'Signal that user input is required before continuing'
        },
        pauseExecution: {
          type: 'boolean',
          description: 'Signal to pause execution until user provides feedback'
        },
        message: {
          type: 'string',
          description: 'Message to display to the user about expected behavior'
        }
      }
    };
  }
}