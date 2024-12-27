import { BaseTool, IToolContext } from '../BaseTool';

export class TagsTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'tags',
            description: 'Manage tags in note frontmatter',
            version: '1.0.0',
            author: 'Bridge MCP'
        }, { allowUndo: true });
    }

    async execute(args: any): Promise<any> {
        const { path, action, tags } = args;
        const currentContent = await this.context.vault.readNote(path);
        const metadata = await this.context.vault.getNoteMetadata(path) || {};
        
        // Store old state for undo
        const oldMetadata = { ...metadata };
        const currentTags = Array.isArray(metadata.tags) ? metadata.tags : [];

        switch (action) {
            case 'add':
                metadata.tags = [...new Set([...currentTags, ...tags])];
                break;
            case 'remove':
                metadata.tags = currentTags.filter(tag => !tags.includes(tag));
                break;
            case 'set':
                metadata.tags = tags;
                break;
            default:
                throw new Error(`Unknown action: ${action}`);
        }

        await this.context.vault.updateNote(path, currentContent, {
            frontmatter: metadata
        });

        return { oldMetadata };
    }

    async undo(args: any, previousResult: any): Promise<void> {
        if (previousResult?.oldMetadata) {
            const currentContent = await this.context.vault.readNote(args.path);
            await this.context.vault.updateNote(args.path, currentContent, {
                frontmatter: previousResult.oldMetadata
            });
        }
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Path to the note"
                },
                action: {
                    type: "string",
                    enum: ["add", "remove", "set"],
                    description: "Action to perform on tags"
                },
                tags: {
                    type: "array",
                    items: {
                        type: "string"
                    },
                    description: "Tags to add, remove, or set"
                }
            },
            required: ["path", "action", "tags"]
        };
    }
}
