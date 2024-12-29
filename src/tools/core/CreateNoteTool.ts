import { BaseTool, IToolContext } from '../BaseTool';

export class CreateNoteTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'createNote',
            description: 'Create a new note in the vault. If the user uses the hotkey `/+` use the create note tool.',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
    }

    async execute(args: any): Promise<any> {
        const { path, content, frontmatter, createFolders } = args;
        return await this.context.vault.createNote(path, content, {
            frontmatter,
            createFolders
        });
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Path where to create the note"
                },
                content: {
                    type: "string",
                    description: "Content of the note"
                },
                frontmatter: {
                    type: "object",
                    description: "YAML frontmatter to add to the note",
                    additionalProperties: true
                },
                createFolders: {
                    type: "boolean",
                    description: "Whether to create parent folders if they don't exist",
                    default: false
                }
            },
            required: ["path", "content"]
        };
    }
}
