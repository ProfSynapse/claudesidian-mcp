import { BaseTool, IToolContext } from '../BaseTool';
import { join } from 'path';

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
        let { operation, path, title, newPath, forceMcpRoot = false } = args;
        
        // If no path specified but title exists, create in inbox
        if (!path && title) {
            path = join('inbox', title);
            forceMcpRoot = true;
        }
        
        // Ensure inbox folder exists
        const inboxPath = join(this.context.settings.rootPath, 'inbox');
        if (!await this.context.vault.folderExists(inboxPath)) {
            await this.context.vault.createFolder(inboxPath);
        }

        // If no path is specified, use inbox folder
        if (!path) {
            path = 'inbox';
            forceMcpRoot = true;
        }

        // Only enforce MCP root path if explicitly requested or using inbox
        const fullPath = forceMcpRoot 
            ? (path.startsWith(this.context.settings.rootPath)
                ? path
                : join(this.context.settings.rootPath, path))
            : path;
            
        const fullNewPath = newPath && (forceMcpRoot
            ? (newPath.startsWith(this.context.settings.rootPath)
                ? newPath
                : join(this.context.settings.rootPath, newPath))
            : newPath);

        switch (operation) {
            case 'create':
                await this.context.vault.createFolder(fullPath);
                return { success: true, path: fullPath };

            case 'delete':
                await this.context.vault.cleanupEmptyFolders(fullPath);
                return { success: true, path: fullPath };

            case 'rename':
                if (!fullNewPath) {
                    throw new Error('newPath is required for rename operation');
                }
                await this.context.vault.renameFolder(fullPath, fullNewPath);
                return { success: true, oldPath: fullPath, newPath: fullNewPath };

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
                title: {
                    type: "string",
                    description: "Name of the folder to create (will be placed in inbox if no path specified)"
                },
                path: {
                    type: "string",
                    description: "Path of the folder (relative to root if not absolute)",
                    default: `${this.context.settings.rootPath}/inbox`
                },
                newPath: {
                    type: "string",
                    description: "New path for the folder (only used with rename operation)"
                },
                forceMcpRoot: {
                    type: "boolean",
                    description: "If true, forces the path to be relative to MCP root folder",
                    default: true
                }
            },
            required: ["operation"]
        };
    }
}
