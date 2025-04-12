import { IProjectCommandHandler } from './ProjectCommandHandler';
import { IToolContext } from '../../interfaces/ToolInterfaces';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Command handler for generating follow-up questions
 * Used when the AI needs to clarify user intent or gather more information
 */
export class AskQuestionCommand implements IProjectCommandHandler {
    async execute(args: any, context: IToolContext): Promise<any> {
        // Validate args
        if (!args.context || typeof args.context !== 'string') {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Context parameter is required and must be a string'
            );
        }

        // Return the questions array
        return {
            questions: args.questions || [],
            context: args.context
        };
    }

    getSchema(): any {
        return {
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
            required: ['context']
        };
    }
}

/**
 * Command handler for creating checkpoints in task execution.
 * 
 * IMPORTANT: This command is designed to pause execution and require user feedback
 * before proceeding. When this command is executed, the MCP client MUST:
 * 1. Stop current execution
 * 2. Present the checkpoint information to the user
 * 3. Wait for explicit user confirmation before continuing
 * 
 * This ensures proper reflection on progress and validation of next steps.
 */
export class CheckpointCommand implements IProjectCommandHandler {
    async execute(args: any, context: IToolContext): Promise<any> {
        // Validate args
        if (!args.description || typeof args.description !== 'string') {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Description parameter is required and must be a string'
            );
        }

        // Return the checkpoint status with explicit pause indicators
        return {
            description: args.description,
            progressSummary: args.progressSummary || '',
            checkpointReason: args.checkpointReason || '',
            nextStep: args.nextStep || '',
            requiresUserInput: true, // Signal that user input is required
            pauseExecution: true, // Explicit signal to pause execution
            message: "CHECKPOINT: Please review progress and provide feedback before continuing." // Clear message about expected behavior
        };
    }

    getSchema(): any {
        return {
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
                }
            },
            required: ['description']
        };
    }
}

/**
 * Command handler for creating structured project plans.
 * 
 * IMPORTANT: This command is designed to pause execution and require user approval
 * of the plan before proceeding. When this command is executed, the MCP client MUST:
 * 1. Stop current execution
 * 2. Present the proposed plan to the user
 * 3. Wait for explicit user approval before implementing the plan
 * 
 * This ensures the plan meets user requirements and expectations before execution.
 */
export class CreatePlanCommand implements IProjectCommandHandler {
    async execute(args: any, context: IToolContext): Promise<any> {
        // Validate args
        if (!args.primaryGoal || typeof args.primaryGoal !== 'string') {
            throw new McpError(
                ErrorCode.InvalidParams,
                'primaryGoal parameter is required and must be a string'
            );
        }

        // Return the plan with pause indicators
        return {
            plan: {
                primaryGoal: args.primaryGoal,
                subgoals: args.subgoals || []
            },
            requiresUserInput: true, // Signal that user approval is required
            pauseExecution: true, // Explicit signal to pause execution
            message: "PLAN REVIEW: Please review and approve this plan before proceeding with implementation." // Clear message about expected behavior
        };
    }

    getSchema(): any {
        return {
            properties: {
                primaryGoal: {
                    type: 'string',
                    description: 'IMPORTANT: After creating this plan, you MUST wait for user approval before executing any tools. Describe the overall goal you want to accomplish.'
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
                }
            },
            required: ['primaryGoal']
        };
    }
}
