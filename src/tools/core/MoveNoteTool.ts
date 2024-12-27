import { BaseTool, IToolContext } from '../BaseTool';

export class MoveNoteTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'moveNote',
            description: 'Move or rename a note in the vault',
            version: '1.0.0',
            author: 'Bridge MCP'
        }, { allowUndo: true });
    }

    async execute(args: any): Promise<any> {
        const { fromPath, toPath, createFolders } = args;
        const file = await this.context.vault.getFile(fromPath);
        if (!file) {
            throw new Error(`Note not found: ${fromPath}`);
        }

        if (createFolders) {
            const toFolder = toPath.split('/').slice(0, -1).join('/');
            await this.context.vault.createFolder(toFolder);
        }

        // Save old path for undo
        const oldPath = file.path;
        await this.context.app.fileManager.renameFile(file, toPath);
        return { oldPath };
    }

    async undo(args: any, previousResult: any): Promise<void> {
        if (previousResult?.oldPath) {
            const file = await this.context.vault.getFile(args.toPath);
            if (file) {
                await this.context.app.fileManager.renameFile(file, previousResult.oldPath);
            }
        }
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                fromPath: {
                    type: "string",
                    description: "Current path of the note"
                },
                toPath: {
                    type: "string",
                    description: "New path for the note"
                },
                createFolders: {
                    type: "boolean",
                    description: "Whether to create parent folders if they don't exist",
                    default: true
                }
            },
            required: ["fromPath", "toPath"]
        };
    }
}
