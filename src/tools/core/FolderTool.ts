import { BaseTool, IToolContext } from '../BaseTool';

export class FolderTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'folder',
            description: 'Create, rename, or delete folders in the vault',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
    }

    async execute(args: any): Promise<any> {
        const { operation, path, newPath } = args;

        switch (operation) {
            case 'create':
                await this.context.vault.createFolder(path);
                return { success: true, path };

            case 'delete':
                await this.context.vault.cleanupEmptyFolders(path);
                return { success: true, path };

            case 'rename':
                if (!newPath) {
                    throw new Error('newPath is required for rename operation');
                }
                await this.context.vault.renameFolder(path, newPath);
                return { success: true, oldPath: path, newPath };

            default:
                throw new Error(`Unknown operation: ${operation}`);
        }
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                operation: {
                    type: "string",
                    enum: ["create", "delete", "rename"],
                    description: "The folder operation to perform"
                },
                path: {
                    type: "string",
                    description: "Path of the folder"
                },
                newPath: {
                    type: "string",
                    description: "New path for the folder (only used with rename operation)"
                }
            },
            required: ["operation", "path"]
        };
    }
}
