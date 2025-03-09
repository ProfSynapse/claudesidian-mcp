import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IToolContext } from '../../interfaces/ToolInterfaces';
import { BaseNoteCommand } from './NoteCommandHandler';

/**
 * Command for deleting notes
 */
export class DeleteNoteCommand extends BaseNoteCommand {
    async execute(args: any, context: IToolContext): Promise<any> {
        this.validateArgs(args);
        
        const { path: rawPath, permanent } = args;
        const finalPath = this.preparePath(rawPath, context);
        
        const file = await context.vault.getFile(finalPath);
        if (!file) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Note not found: ${finalPath}`
            );
        }

        // Store content for undo
        const oldContent = await context.vault.readNote(finalPath);
        const oldPath = file.path;

        if (!permanent) {
            await this.ensureTrashFolder(context);
        }
        
        // Delete the file
        await context.app.vault.trash(file, permanent);

        return {
            oldPath,
            oldContent
        };
    }

    async undo(args: any, previousResult: any, context: IToolContext): Promise<void> {
        if (previousResult?.oldPath && previousResult?.oldContent) {
            const finalPath = this.preparePath(previousResult.oldPath, context);
            await context.vault.createNote(
                finalPath,
                previousResult.oldContent
            );
        }
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Path to the note to delete"
                },
                permanent: {
                    type: "boolean",
                    description: "Permanently delete instead of moving to trash",
                    default: false
                }
            },
            required: ["path"]
        };
    }

    private async ensureTrashFolder(context: IToolContext): Promise<void> {
        const trashPath = 'Trash';
        if (!(await context.app.vault.adapter.exists(trashPath))) {
            await context.app.vault.createFolder(trashPath);
        }
    }
}
