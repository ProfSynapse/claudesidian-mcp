import { BaseTool } from '../BaseTool';
import { IToolContext } from '../interfaces/ToolInterfaces';
import { Command } from 'obsidian';

interface PaletteCommanderArgs {
    action: 'list' | 'execute';
    commandId?: string;
}

export class PaletteCommanderTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: '🎮 paletteCommander',
            description: 'Access and execute Obsidian commands',
            version: '1.0.0'
        }, {
            requireConfirmation: false,
            allowUndo: false
        });
    }

    async execute(args: PaletteCommanderArgs): Promise<any> {
        // Validate arguments using schema
        if (!this.validateArgs(args, this.getSchema())) {
            throw new Error('Invalid arguments');
        }

        switch (args.action) {
            case 'list':
                return this.listCommands();
            case 'execute':
                if (!args.commandId) {
                    throw new Error('commandId is required for execute action');
                }
                return this.executeCommand(args.commandId);
            default:
                throw new Error(`Unknown action: ${args.action}`);
        }
    }

    private async listCommands(): Promise<Array<{ id: string; name: string }>> {
        const commands = this.context.app.commands.listCommands();
        return commands.map(cmd => ({
            id: cmd.id,
            name: cmd.name
        }));
    }

    private async executeCommand(commandId: string): Promise<void> {
        // Check if command exists
        const command = this.context.app.commands.commands[commandId];
        if (!command) {
            throw new Error(`Command not found: ${commandId}`);
        }

        // Execute the command
        await this.context.app.commands.executeCommandById(commandId);
    }

    getSchema(): any {
        return {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'execute'],
                    description: 'Whether to list commands or execute a specific command'
                },
                commandId: {
                    type: 'string',
                    description: 'ID of the command to execute (required for execute action)'
                }
            },
            required: ['action'],
            additionalProperties: false
        };
    }
}