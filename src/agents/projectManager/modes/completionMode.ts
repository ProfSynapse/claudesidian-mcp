import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CompletionArgs, CompletionResult } from '../types';

/**
 * Mode for marking a project as complete
 */
export class CompletionMode extends BaseMode<CompletionArgs, CompletionResult> {

  /**
   * Create a new CompletionMode
   * @param _app Obsidian app instance (not used)
   */
  constructor(_app: App) {
    super(
      'completion',
      'Completion',
      'Mark a project as complete and provide a summary of everything that was accomplished. This tool does NOT interact with the Obsidian vault. IMPORTANT: When using this mode, you MUST stop execution immediately after, report directly back to the user, and wait for user feedback before continuing with any other modes or actions.',
      '1.0.0'
    );

  }

  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of completing the project
   */
  async execute(params: CompletionArgs): Promise<CompletionResult> {
    const { 
      summary, 
      accomplishments = [], 
      challenges = [], 
      learnings = [], 
      futureWork = [], 
      projectPath = 'internal-planning-only' 
    } = params;

    // Return the completion summary with the required flags
    return {
      summary,
      accomplishments,
      challenges,
      learnings,
      futureWork,
      projectPath,
      success: true,
      requiresUserInput: true, // Signal that user input is required
      pauseExecution: true, // Explicit signal to pause execution
      message: "PROJECT COMPLETED: This is a final project completion summary. STOP HERE and report directly to the user. No further tools should be used after this one."
    };
  }

  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    // Create the mode-specific schema
    const modeSchema = {
      type: "object",
      properties: {
        summary: {
          type: 'string',
          description: 'High-level summary of the completed project. After sending this completion, you MUST stop immediately, report directly to the user, and wait for user feedback.'
        },
        accomplishments: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'List of specific accomplishments achieved during the project.'
        },
        challenges: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'List of challenges encountered and how they were addressed.'
        },
        learnings: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Key insights, learnings, or discoveries from the project.'
        },
        futureWork: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Suggestions for future work, improvements, or next steps.'
        },
        projectPath: {
          type: 'string',
          description: 'Optional: For internal reference only. This does NOT interact with the Obsidian vault.'
        }
      },
      required: ['summary'],
      description: 'Mark a project as complete and provide a summary of everything that was accomplished. This tool does NOT interact with the Obsidian vault. IMPORTANT: This command is designed to finalize project execution. When this mode is used, you MUST stop execution immediately after, report directly back to the user, and wait for user feedback. No other tools should be used after this one.'
    };
    
    // Merge with common schema (workspace context and handoff)
    return this.getMergedSchema(modeSchema);
  }

  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    return {
      type: "object",
      properties: {
        summary: {
          type: 'string',
          description: 'High-level summary of the completed project'
        },
        accomplishments: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'List of specific accomplishments achieved during the project'
        },
        challenges: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'List of challenges encountered and how they were addressed'
        },
        learnings: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Key insights, learnings, or discoveries from the project'
        },
        futureWork: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Suggestions for future work, improvements, or next steps'
        },
        projectPath: {
          type: 'string',
          description: 'Internal reference only (not an actual vault path)'
        },
        success: {
          type: 'boolean',
          description: 'Whether the completion was created successfully'
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