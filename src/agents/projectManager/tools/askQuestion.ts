import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { AskQuestionArgs, AskQuestionResult } from '../types';

/**
 * Tool for asking questions about a project
 */
export class AskQuestionTool extends BaseTool<AskQuestionArgs, AskQuestionResult> {
  private app: App;

  /**
   * Create a new AskQuestionTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'askQuestion',
      'Ask a question about a project. IMPORTANT: When using this tool, you MUST stop execution immediately after and wait for user response before continuing with any other tools or actions.',
      '1.0.0'
    );

    this.app = app;
  }

  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the answer to the question
   */
  async execute(args: AskQuestionArgs): Promise<AskQuestionResult> {
    const { context, questions = [] } = args;

    // Simply return the input parameters with the required flags
    return {
      questions,
      context,
      requiresUserInput: true, // Signal that user input is required
      pauseExecution: true, // Explicit signal to pause execution
      message: "QUESTION: Please review the answer and provide feedback before continuing." // Clear message about expected behavior
    };
  }

  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any {
    return {
      type: "object",
      properties: {
        context: {
          type: 'string',
          description: 'The current context or topic that needs clarification. Provide detailed information about what you need to clarify.'
        },
        questions: {
          type: 'array',
          description: 'Array of follow-up questions to ask the user. Each question should be clear, specific, and directly related to the context. You are MANDATED to stop using tools after generating your questions, so you can directly ask the user the question(s)',
          items: {
            type: 'string'
          }
        }
      },
      required: ['context'],
      description: 'Ask questions to clarify user intent or gather more information. IMPORTANT: When using this tool, you MUST stop execution immediately after and wait for user response before continuing with any other tools or actions.'
    };
  }
}