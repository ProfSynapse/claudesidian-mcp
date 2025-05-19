import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { AskQuestionArgs, AskQuestionResult } from '../types';

/**
 * Mode for asking questions about a project
 */
export class AskQuestionMode extends BaseMode<AskQuestionArgs, AskQuestionResult> {

  /**
   * Create a new AskQuestionMode
   * @param _app Obsidian app instance (not used)
   */
  constructor(_app: App) {
    super(
      'askQuestion',
      'Ask Question',
      'Ask a question about a project for internal planning purposes only. This tool does NOT interact with the Obsidian vault. IMPORTANT: When using this mode, you MUST stop execution immediately after, report directly back to the user, and wait for user response before continuing with any other modes or actions. No other tools should be used after this one.',
      '1.0.0'
    );

  }

  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the answer to the question
   */
  async execute(params: AskQuestionArgs): Promise<AskQuestionResult> {
    const { context, questions = [] } = params;

    // Simply return the input parameters with the required flags
    return {
      success: true,
      questions,
      context,
      requiresUserInput: true, // Signal that user input is required
      pauseExecution: true, // Explicit signal to pause execution
      message: "QUESTION: This is an internal planning tool only. STOP HERE and report directly to the user. Please review the questions and provide feedback before continuing. No further tools should be used after this one." // Clear message about expected behavior
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
        context: {
          type: 'string',
          description: 'The current context or topic that needs clarification. Provide detailed information about what you need to clarify.'
        },
        questions: {
          type: 'array',
          description: 'Array of follow-up questions to ask the user. Each question should be clear, specific, and directly related to the context. You are MANDATED to stop using modes after generating your questions and report directly back to the user with these questions.',
          items: {
            type: 'string'
          }
        }
      },
      required: ['context'],
      description: 'Ask questions to clarify user intent or gather more information for internal planning purposes only. This tool does NOT interact with the Obsidian vault. IMPORTANT: When using this mode, you MUST stop execution immediately after, report directly back to the user, and wait for user response before continuing with any other modes or actions. No other tools should be used after this one.'
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
        questions: {
          type: 'array',
          description: 'The questions that were asked',
          items: {
            type: 'string'
          }
        },
        context: {
          type: 'string',
          description: 'The context that was provided'
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