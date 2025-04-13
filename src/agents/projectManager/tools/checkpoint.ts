import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { CheckpointArgs, CheckpointResult, ProjectCheckpoint, CheckpointStatus } from '../types';

/**
 * Tool for creating a project checkpoint
 */
export class CheckpointTool extends BaseTool<CheckpointArgs, CheckpointResult> {
  private app: App;

  /**
   * Create a new CheckpointTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'checkpoint',
      'Create a checkpoint for a project. IMPORTANT: When using this tool, you MUST stop execution immediately after and wait for user feedback before continuing with any other tools or actions.',
      '1.0.0'
    );

    this.app = app;
  }

  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the result of creating the checkpoint
   */
  async execute(args: CheckpointArgs): Promise<CheckpointResult> {
    const { description, progressSummary = '', checkpointReason = '', nextStep = '', projectPath } = args;

    // Simply return the checkpoint with the required flags
    return {
      description,
      progressSummary,
      checkpointReason,
      nextStep,
      projectPath,
      success: true,
      requiresUserInput: true, // Signal that user input is required
      pauseExecution: true, // Explicit signal to pause execution
      message: "CHECKPOINT: Please review progress and provide feedback before continuing." // Clear message about expected behavior
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
        description: {
          type: 'string',
          description: 'IMPORTANT: After sending this checkpoint, you MUST wait for user feedback before using any other tools. Describe what has been completed and why feedback is needed.'
        },
        progressSummary: {
          type: 'string',
          description: 'Summary of accomplished work. After the checkpoint, STOP and wait for user review before continuing.'
        },
        checkpointReason: {
          type: 'string',
          description: 'Why you are stopping at this point. You MUST pause here and get user feedback before proceeding.'
        },
        nextStep: {
          type: 'string',
          description: 'Suggested next steps to discuss with the user. You are MANDATED to stop using tools. Do not execute these steps until after user feedback.'
        },
        projectPath: {
          type: 'string',
          description: 'Path to the project file'
        }
      },
      required: ['description'],
      description: 'Create a checkpoint for a project. IMPORTANT: This command is designed to pause execution and require user feedback before proceeding. When this tool is used, you MUST stop execution immediately after and wait for user feedback before continuing with any other tools or actions.'
    };
  }
}