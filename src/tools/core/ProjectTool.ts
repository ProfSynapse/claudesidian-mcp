import { BaseTool } from '../BaseTool';
import { IToolContext } from '../interfaces/ToolInterfaces';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { AskQuestionCommand, CheckCompletionCommand, CreatePlanCommand } from './commands/ProjectCommands';
import { IProjectCommandHandler } from './commands/ProjectCommandHandler';

/**
 * Tool for managing projects and tasks
 * Provides actions for asking questions, checking task completion, and creating plans
 */
export class ProjectTool extends BaseTool {
    private commandHandlers: Map<string, IProjectCommandHandler>;

    constructor(context: IToolContext) {
        super(context, {
            name: 'project',
            description: 'Manage projects and tasks with these actions: askQuestion (generate follow-up questions), checkCompletion (verify task completion), and createPlan (structure project plans with a primary goal, sequenced subgoals, and detailed steps with dependencies).',
            version: '1.0.0',
            author: 'Claudesidian MCP'
        }, { requireConfirmation: false });

        // Initialize command handlers
        this.commandHandlers = new Map<string, IProjectCommandHandler>([
            ['askQuestion', new AskQuestionCommand()],
            ['checkCompletion', new CheckCompletionCommand()],
            ['createPlan', new CreatePlanCommand()]
        ]);
    }

    /**
     * Executes the project tool with the given arguments
     * @param args Tool arguments including action and action-specific parameters
     * @returns Tool execution result
     * @throws McpError if arguments are invalid or action is not supported
     */
    async execute(args: any): Promise<any> {
        if (!args) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Tool arguments are required'
            );
        }

        if (!args.action) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Action parameter is required'
            );
        }

        const handler = this.commandHandlers.get(args.action);
        if (!handler) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Unsupported project action: ${args.action}. Available actions: ${Array.from(this.commandHandlers.keys()).join(', ')}`
            );
        }

        try {
            return await handler.execute(args, this.context);
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            throw new McpError(
                ErrorCode.InternalError,
                `Error executing ${args.action}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Gets the JSON schema for tool arguments
     * @returns JSON schema object
     */
    getSchema(): any {
        // Combine schemas from all command handlers
        const actionSchemas: Record<string, any> = {};
        
        for (const [action, handler] of this.commandHandlers) {
            actionSchemas[action] = handler.getSchema();
        }

        return {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: Array.from(this.commandHandlers.keys()),
                    description: "The project action to perform. Use 'askQuestion' to generate follow-up questions for clarification, 'checkCompletion' to verify if a task is complete, or 'createPlan' to structure a project plan with a primary goal, sequenced subgoals, and detailed steps with dependencies."
                },
                // Each action's schema is referenced here
                ...Object.fromEntries(
                    Array.from(this.commandHandlers.entries()).map(([action, handler]) => [
                        action,
                        {
                            type: "object",
                            properties: handler.getSchema().properties,
                            required: handler.getSchema().required
                        }
                    ])
                )
            },
            required: ["action"],
            // Use oneOf to indicate that parameters depend on the action
            oneOf: Array.from(this.commandHandlers.entries()).map(([action, handler]) => {
                return {
                    properties: {
                        action: { const: action },
                        ...handler.getSchema().properties
                    },
                    required: ["action", ...(handler.getSchema().required || [])]
                };
            })
        };
    }
}