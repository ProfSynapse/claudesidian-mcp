import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ProjectPlanArgs, ProjectPlanResult } from '../types';

/**
 * Mode for creating a project plan
 */
export class ProjectPlanMode extends BaseMode<ProjectPlanArgs, ProjectPlanResult> {
  private app: App;
  
  /**
   * Create a new ProjectPlanMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'projectPlan',
      'Project Plan',
      'Create a project plan. IMPORTANT: When using this mode, you MUST stop execution immediately after and wait for user approval before continuing with any other modes or actions.',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of creating the project plan
   */
  async execute(params: ProjectPlanArgs): Promise<ProjectPlanResult> {
    const { primaryGoal, subgoals = [], path } = params;
    
    // Create the project plan
    const plan = {
      primaryGoal,
      subgoals
    };
    
    // Simply return the plan with the required flags
    return {
      plan,
      path,
      success: true,
      requiresUserInput: true, // Signal that user input is required
      pauseExecution: true, // Explicit signal to pause execution
      message: "PLAN REVIEW: Please review and approve this plan before proceeding with implementation." // Clear message about expected behavior
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
        primaryGoal: {
          type: 'string',
          description: 'IMPORTANT: After creating this plan, you MUST wait for user approval before executing any modes. Describe the overall goal you want to accomplish.'
        },
        subgoals: {
          type: 'array',
          description: 'Proposed subgoals to accomplish the primary goal. These are suggestions that require user approval before execution.',
          items: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'Overall description of the subgoal. Explain what this subgoal aims to accomplish.'
              },
              dependencies: {
                type: 'array',
                description: 'IDs or indices of other subgoals that must be completed before this one can start. Use this to establish the correct sequence.',
                items: {
                  type: 'number'
                }
              },
              steps: {
                type: 'array',
                description: 'Detailed steps to accomplish this subgoal. Break down the subgoal into specific, actionable steps.',
                items: {
                  type: 'object',
                  properties: {
                    stepDescription: {
                      type: 'string',
                      description: 'Detailed description of this step. Provide specific actions and considerations.'
                    },
                    needsTool: {
                      type: 'boolean',
                      description: 'Whether this step requires specific tools to complete. Set to true if tools are needed, false otherwise.'
                    },
                    dependencies: {
                      type: 'array',
                      description: 'IDs or indices of other steps within this subgoal that must be completed before this one can start.',
                      items: {
                        type: 'number'
                      }
                    },
                    toolsNeeded: {
                      type: 'array',
                      description: 'Optional: Specific tools needed for this step. Only include if needsTool is true.',
                      items: {
                        type: 'string'
                      }
                    }
                  },
                  required: ['stepDescription', 'needsTool']
                }
              }
            },
            required: ['description', 'steps']
          }
        },
        path: {
          type: 'string',
          description: 'Path to save the project plan'
        }
      },
      required: ['primaryGoal', 'path'],
      description: 'Create a project plan. IMPORTANT: When using this mode, you MUST stop execution immediately after and wait for user approval before continuing with any other modes or actions. This mode is designed to pause execution and require user approval of the plan before proceeding.'
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
        plan: {
          type: 'object',
          description: 'The created plan',
          properties: {
            primaryGoal: {
              type: 'string',
              description: 'Overall goal of the project'
            },
            subgoals: {
              type: 'array',
              description: 'Subgoals to accomplish the primary goal'
            }
          }
        },
        path: {
          type: 'string',
          description: 'Path to the saved project plan'
        },
        success: {
          type: 'boolean',
          description: 'Whether the plan was saved successfully'
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