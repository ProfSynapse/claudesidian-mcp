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
        try {
            const { path, content, frontmatter, createFolders } = args;
            
            if (!path || typeof path !== 'string') {
                throw new Error('Invalid path provided');
            }
            
            if (content === undefined || content === null) {
                throw new Error('Content cannot be null or undefined');
            }

            const result = await this.context.vault.createNote(path, content, {
                frontmatter,
                createFolders
            });

            // Return a simplified response to avoid circular references
            return {
                success: true,
                path: path
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
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
