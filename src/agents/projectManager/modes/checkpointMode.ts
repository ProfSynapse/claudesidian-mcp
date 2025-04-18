import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CheckpointArgs, CheckpointResult } from '../types';

/**
 * Mode for creating a project checkpoint
 */
export class CheckpointMode extends BaseMode<CheckpointArgs, CheckpointResult> {
  private app: App;

  /**
   * Create a new CheckpointMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'checkpoint',
      'Checkpoint',
      'Create a checkpoint for a project. IMPORTANT: When using this mode, you MUST stop execution immediately after and wait for user feedback before continuing with any other modes or actions.',
      '1.0.0'
    );

    this.app = app;
  }

  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of creating the checkpoint
   */
  async execute(params: CheckpointArgs): Promise<CheckpointResult> {
    const { description, progressSummary = '', checkpointReason = '', nextStep = '', projectPath } = params;

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
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    return {
      type: "object",
      properties: {
        description: {
          type: 'string',
          description: 'IMPORTANT: After sending this checkpoint, you MUST wait for user feedback before using any other modes. Describe what has been completed and why feedback is needed.'
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
          description: 'Suggested next steps to discuss with the user. You are MANDATED to stop using modes. Do not execute these steps until after user feedback.'
        },
        projectPath: {
          type: 'string',
          description: 'Path to the project file'
        }
      },
      required: ['description'],
      description: 'Create a checkpoint for a project. IMPORTANT: This command is designed to pause execution and require user feedback before proceeding. When this mode is used, you MUST stop execution immediately after and wait for user feedback before continuing with any other modes or actions.'
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
        description: {
          type: 'string',
          description: 'Description of what has been completed'
        },
        progressSummary: {
          type: 'string',
          description: 'Summary of accomplished work'
        },
        checkpointReason: {
          type: 'string',
          description: 'Why you are stopping at this point'
        },
        nextStep: {
          type: 'string',
          description: 'Suggested next steps to discuss with the user'
        },
        projectPath: {
          type: 'string',
          description: 'Path to the project file'
        },
        success: {
          type: 'boolean',
          description: 'Whether the checkpoint was created successfully'
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