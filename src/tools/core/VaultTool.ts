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
            case 'create':
                return await this.context.vault.createNote(path, content);
            case 'update':
                return await this.context.vault.updateNote(path, content);
            case 'read':
                return await this.context.vault.readNote(path);
            case 'list':
                return await this.context.vault.listNotes(path);
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }
}
