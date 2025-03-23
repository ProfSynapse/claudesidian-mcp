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
                    description: 'Array of follow-up questions to ask the user. Each question should be clear, specific, and directly related to the context.',
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
 * Command handler for creating checkpoints in task execution
 * Used to pause for user feedback, summarize progress, and suggest next steps
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

        // Return the checkpoint status
        return {
            description: args.description,
            progressSummary: args.progressSummary || '',
            checkpointReason: args.checkpointReason || '',
            nextStep: args.nextStep || ''
        };
    }

    getSchema(): any {
        return {
            properties: {
                description: {
                    type: 'string',
                    description: 'Description of the checkpoint - what has been completed and why feedback is needed'
                },
                progressSummary: {
                    type: 'string',
                    description: 'Summary of what has been accomplished up to this point'
                },
                checkpointReason: {
                    type: 'string',
                    description: 'Explanation of why this is a good point to pause and get feedback'
                },
                nextStep: {
                    type: 'string',
                    description: 'Suggested next step or action after this checkpoint'
                }
            },
            required: ['description']
        };
    }
}

/**
 * Command handler for creating structured project plans
 * Used to break down objectives into sequenced subgoals with multiple steps and dependencies
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

        // Return the plan
        return {
            plan: {
                primaryGoal: args.primaryGoal,
                subgoals: args.subgoals || []
            }
        };
    }

    getSchema(): any {
        return {
            properties: {
                primaryGoal: {
                    type: 'string',
                    description: 'The primary goal of the plan. Be specific about what you want to accomplish overall.'
                },
                subgoals: {
                    type: 'array',
                    description: 'Sequenced subgoals to accomplish the primary goal. Each subgoal represents a distinct phase or component of the overall plan.',
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