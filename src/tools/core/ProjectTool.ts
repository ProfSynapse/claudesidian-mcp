import { BaseTool } from '../BaseTool';
import { IToolContext } from '../interfaces/ToolInterfaces';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { AskQuestionCommand, CheckCompletionCommand, CreatePlanCommand } from './commands/ProjectCommands';

/**
 * Tool for project management operations like planning, tracking completion, and gathering information
 */
export class ProjectTool extends BaseTool {
    private askQuestionCommand: AskQuestionCommand;
    private checkCompletionCommand: CheckCompletionCommand;
    private createPlanCommand: CreatePlanCommand;

    constructor(context: IToolContext) {
        super(context, {
            name: '📋 projectManager',
            description: 'Manage project-related operations including planning, completion tracking, and information gathering.',
            version: '1.0.0',
            author: 'Claudesidian MCP'
        });

        // Initialize command handlers
        this.askQuestionCommand = new AskQuestionCommand();
        this.checkCompletionCommand = new CheckCompletionCommand();
        this.createPlanCommand = new CreatePlanCommand();
    }

    async execute(args: any): Promise<any> {
        if (!args?.action) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Action parameter is required'
            );
        }

        switch (args.action) {
            case 'askQuestion':
                return await this.askQuestionCommand.execute(args, this.context);
            case 'checkCompletion':
                return await this.checkCompletionCommand.execute(args, this.context);
            case 'createPlan':
                return await this.createPlanCommand.execute(args, this.context);
            default:
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Unsupported action: ${args.action}`
                );
        }
    }

    getSchema(): any {
        return {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['askQuestion', 'checkCompletion', 'createPlan'],
                    description: 'The project management action to perform'
                },
                // Action-specific parameters are validated by individual command handlers
                ...this.askQuestionCommand.getSchema().properties,
                ...this.checkCompletionCommand.getSchema().properties,
                ...this.createPlanCommand.getSchema().properties
            },
            required: ['action'],
            allOf: [
                {
                    if: {
                        properties: { action: { const: 'askQuestion' } },
                        required: ['action']
                    },
                    then: {
                        required: this.askQuestionCommand.getSchema().required
                    }
                },
                {
                    if: {
                        properties: { action: { const: 'checkCompletion' } },
                        required: ['action']
                    },
                    then: {
                        required: this.checkCompletionCommand.getSchema().required
                    }
                },
                {
                    if: {
                        properties: { action: { const: 'createPlan' } },
                        required: ['action']
                    },
                    then: {
                        required: this.createPlanCommand.getSchema().required
                    }
                }
            ]
        };
    }
}