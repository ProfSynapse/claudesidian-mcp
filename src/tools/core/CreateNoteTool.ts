import { BaseTool, IToolContext } from '../BaseTool';
import { join } from 'path';

export class CreateNoteTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'createNote',
            description: 'Create a new note in the vault. If the user uses the hotkey `/+` use the create note tool.',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
    }

    private ensureMdExtension(path: string): string {
        if (!path.toLowerCase().endsWith('.md')) {
            return path + '.md';
        }
        return path;
    }

    async execute(args: any): Promise<any> {
        try {
            let { title, path, content, frontmatter, createFolders } = args;
            
            // If no path specified but title exists, create in inbox
            if (!path && title) {
                path = join(this.context.settings.rootPath, 'inbox', this.ensureMdExtension(title));
            } else if (!path) {
                // Fallback if neither path nor title specified
                path = join(this.context.settings.rootPath, 'inbox', `${Date.now()}.md`);
            } else if (!path.startsWith(this.context.settings.rootPath)) {
                // If path provided but not absolute, prefix with root path
                path = join(this.context.settings.rootPath, path);
            }

            if (content === undefined || content === null) {
                throw new Error('Content cannot be null or undefined');
            }

            // Ensure path has .md extension
            const finalPath = this.ensureMdExtension(path);

            const result = await this.context.vault.createNote(finalPath, content, {
                frontmatter,
                createFolders
            });

            // Return a simplified response to avoid circular references
            return {
                success: true,
                path: finalPath
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
                title: {
                    type: "string",
                    description: "Title of the note (will be used as filename if path not specified)"
                },
                path: {
                    type: "string",
                    description: "Full path where to create the note (overrides title-based path)",
                    default: `${this.context.settings.rootPath}/inbox`
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
            required: ["content"]
        };
    }
}
