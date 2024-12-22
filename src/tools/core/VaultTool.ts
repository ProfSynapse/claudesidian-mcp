import { BaseTool, IToolContext, IToolMetadata } from '../BaseTool';

export class VaultTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'vault',
            description: 'Perform operations on the Obsidian vault',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
    }

    async execute(args: any): Promise<any> {
        const { action, path, content } = args;

        switch (action) {
            case 'searchPath':
                const foundFile = await this.context.searchEngine.searchByPath(path);
                if (!foundFile) {
                    return null;
                }
                return {
                    path: foundFile.path,
                    content: await this.context.vault.readNote(foundFile.path)
                };
            case 'create':
                return await this.context.vault.createNote(path, content);
            case 'update':
                return await this.context.vault.updateNote(path, content);
            case 'read':
                return await this.context.vault.readNote(path);
            case 'list':
                try {
                    const files = await this.context.vault.listNotes(path);
                    return files.map(file => ({
                        path: file.path,
                        name: file.basename
                    }));
                } catch (error) {
                    // If list fails, try searching instead
                    const foundFile = await this.context.searchEngine.searchByPath(path);
                    if (foundFile) {
                        return [{
                            path: foundFile.path,
                            name: foundFile.basename
                        }];
                    }
                    return [];
                }
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["create", "update", "read", "list", "searchPath"],
                    description: "The operation to perform"
                },
                path: {
                    type: "string",
                    description: "For searchPath: search query, for others: actual file/folder path"
                },
                content: {
                    type: "string",
                    description: "Content for create/update operations"
                }
            },
            required: ["action", "path"]
        };
    }
}
