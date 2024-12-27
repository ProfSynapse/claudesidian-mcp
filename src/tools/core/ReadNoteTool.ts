import { BaseTool, IToolContext } from '../BaseTool';

export class ReadNoteTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'readNote',
            description: 'Read a note from the vault',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
    }

    async execute(args: any): Promise<any> {
        const { path, includeFrontmatter } = args;
        
        const content = await this.context.vault.readNote(path);
        if (!includeFrontmatter) {
            // Strip frontmatter if not requested
            return content.replace(/^---\n[\s\S]*?\n---\n/, '');
        }
        
        if (includeFrontmatter) {
            const metadata = await this.context.vault.getNoteMetadata(path);
            return {
                content,
                frontmatter: metadata
            };
        }

        return content;
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Path to the note to read"
                },
                includeFrontmatter: {
                    type: "boolean",
                    description: "Whether to include YAML frontmatter in the response",
                    default: false
                }
            },
            required: ["path"]
        };
    }
}
