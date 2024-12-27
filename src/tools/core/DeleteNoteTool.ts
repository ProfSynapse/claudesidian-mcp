import { BaseTool, IToolContext } from '../BaseTool';

export class DeleteNoteTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'deleteNote',
            description: 'Delete a note from the vault',
            version: '1.0.0',
            author: 'Bridge MCP'
        }, { allowUndo: true });
    }

    private async ensureTrashFolder(): Promise<void> {
        const trashPath = 'Trash';
        if (!(await this.context.app.vault.adapter.exists(trashPath))) {
            await this.context.app.vault.createFolder(trashPath);
        }
    }

    async execute(args: any): Promise<any> {
        const { path, permanent } = args;
        const file = await this.context.vault.getFile(path);
        if (!file) {
            throw new Error(`Note not found: ${path}`);
        }

        // Store content for undo
        const oldContent = await this.context.vault.readNote(path);
        const oldPath = file.path;

        if (!permanent) {
            await this.ensureTrashFolder();
        }
        
        // Delete the file
        await this.context.app.vault.trash(file, permanent);

        return {
            oldPath,
            oldContent
        };
    }

    async undo(args: any, previousResult: any): Promise<void> {
        if (previousResult?.oldPath && previousResult?.oldContent) {
            await this.context.vault.createNote(
                previousResult.oldPath,
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
                    description: "Whether to permanently delete or move to trash",
                    default: false
                }
            },
            required: ["path"]
        };
    }
}
