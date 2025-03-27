import { BaseTool } from '../BaseTool';
import { IToolContext } from '../interfaces/ToolInterfaces';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { AskQuestionCommand, CheckpointCommand, CreatePlanCommand } from './commands/ProjectCommands';

/**
 * Tool for project management operations like planning, tracking completion, and gathering information
 */
export class ProjectTool extends BaseTool {
    private askQuestionCommand: AskQuestionCommand;
    private checkpointCommand: CheckpointCommand;
    private createPlanCommand: CreatePlanCommand;

    constructor(context: IToolContext) {
        super(context, {
            name: 'projectManager',
            description: 'Manage project-related operations including planning, checkpointing, and information gathering. IMPORTANT: When using checkpoint or createPlan actions, you MUST stop execution immediately after and wait for user feedback before continuing with any other tools or actions.',
            version: '1.0.0',
            author: 'Claudesidian MCP'
        });

        // Initialize command handlers
        this.askQuestionCommand = new AskQuestionCommand();
        this.checkpointCommand = new CheckpointCommand();
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
            case 'checkpoint':
                return await this.checkpointCommand.execute(args, this.context);
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
                    enum: ['askQuestion', 'checkpoint', 'createPlan'],
                    description: 'The project management action to perform. NOTE: If using "checkpoint" or "createPlan", you MUST stop execution after this tool call and wait for user feedback before proceeding with any other tools.'
                },
                // Action-specific parameters are validated by individual command handlers
                ...this.askQuestionCommand.getSchema().properties,
                ...this.checkpointCommand.getSchema().properties,
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
                        properties: { action: { const: 'checkpoint' } },
                        required: ['action']
                    },
                    then: {
                        required: this.checkpointCommand.getSchema().required
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
