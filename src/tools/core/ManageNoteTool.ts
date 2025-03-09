import { BaseTool, IToolContext } from '../BaseTool';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { CreateNoteCommand } from './commands/NoteCommands';
import { ReadNoteCommand } from './commands/NoteCommands';
import { ReplaceNoteCommand } from './commands/ReplaceNoteCommands';
import { InsertContentCommand } from './commands/InsertNoteCommands';
import { SearchNotesCommand, ListNotesCommand, MoveNoteCommand } from './commands/ManageNoteCommands';
import { DeleteNoteCommand } from './commands/DeleteNoteCommand';
import { INoteCommandHandler } from './commands/NoteCommandHandler';

/**
 * Tool for managing notes in the vault.
 * This is a high-level tool that delegates operations to specialized command handlers.
 */
export class ManageNoteTool extends BaseTool {
    private commandHandlers: Map<string, INoteCommandHandler>;

    constructor(context: IToolContext) {
        super(context, {
            name: 'manageNote',
            description: 'Manage notes with these actions: create (new notes), read (view content), insert (append/prepend/add under headings), replace (find and replace text), delete (remove notes), list (show notes), search (find content). Use insert action for adding new content, replace for modifying existing text.',
            version: '2.0.0',
            author: 'Claudesidian MCP'
        }, { allowUndo: true });

        // Initialize command handlers with explicit type
        this.commandHandlers = new Map<string, INoteCommandHandler>([
            ['create', new CreateNoteCommand()],
            ['read', new ReadNoteCommand()],
            ['replace', new ReplaceNoteCommand()],
            // Keep edit for backward compatibility, but it will eventually be deprecated
            ['edit', new ReplaceNoteCommand()],
            ['insert', new InsertContentCommand()],
            ['delete', new DeleteNoteCommand()],
            ['list', new ListNotesCommand()],
            ['search', new SearchNotesCommand(context)],
            ['move', new MoveNoteCommand()]
        ]);
    }

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
                `Unsupported manageNote action: ${args.action}`
            );
        }

        return await handler.execute(args, this.context);
    }

    async undo(args: any, previousResult: any): Promise<void> {
        if (!args?.action) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Action parameter is required for undo'
            );
        }

        const handler = this.commandHandlers.get(args.action);
        if (!handler) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Unsupported manageNote action for undo: ${args.action}`
            );
        }

        if (!handler.undo) {
            throw new McpError(
                ErrorCode.MethodNotFound,
                `Undo not supported for action: ${args.action}`
            );
        }

        await handler.undo(args, previousResult, this.context);
    }

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
                    description: "The note action to perform. Use 'insert' for adding content (append/prepend/under headings), 'replace' for finding and replacing text (formerly edit), 'create' for new notes, 'read' to view content, 'delete' to remove notes, 'list' to show notes, 'search' to find content, and 'move' to relocate notes."
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
            oneOf: Array.from(this.commandHandlers.entries()).map(([action, handler]) => ({
                properties: {
                    action: { const: action },
                    ...handler.getSchema().properties
                },
                required: ["action", ...(handler.getSchema().required || [])]
            }))
        };
    }
}
