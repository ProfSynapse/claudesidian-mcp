import { BaseTool, IToolContext } from '../BaseTool';

export class ManageMetadataTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'manageMetadata',
            description: 'Manage Metadata fields in a note. The reviewIndex tool from memory must be used prior to using any tool at the beginning of a conversation.',
            version: '1.1.0',
            author: 'Claudesidian MCP'
        }, { allowUndo: true });
    }

    async execute(args: any): Promise<any> {
        const { path, updates, removes } = args;
        const currentContent = await this.context.vault.readNote(path);
        const currentMetadata = await this.context.vault.getNoteMetadata(path) || {};

        // Store old state for undo
        const oldMetadata = { ...currentMetadata };
        const newMetadata = { ...currentMetadata };

        // Handle updates
        if (updates) {
            for (const [key, value] of Object.entries(updates)) {
                if (Array.isArray(value)) {
                    // Special handling for arrays (like tags)
                    const currentArray = Array.isArray(newMetadata[key]) ? newMetadata[key] : [];
                    newMetadata[key] = [...new Set([...currentArray, ...value])];
                } else {
                    newMetadata[key] = value;
                }
            }
        }

        // Handle removes
        if (removes) {
            if (Array.isArray(removes)) {
                // Remove entire fields
                removes.forEach(field => delete newMetadata[field]);
            } else {
                // Remove specific values from arrays
                Object.entries(removes).forEach(([key, values]) => {
                    if (Array.isArray(values) && Array.isArray(newMetadata[key])) {
                        newMetadata[key] = newMetadata[key].filter(item => !values.includes(item));
                    }
                });
            }
        }

        await this.context.vault.updateNote(path, currentContent, {
            frontmatter: newMetadata
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
                updates: {
                    type: "object",
                    description: "Fields to update or add. For arrays, values will be added to existing array",
                    additionalProperties: true
                },
                removes: {
                    oneOf: [
                        {
                            type: "array",
                            items: { type: "string" },
                            description: "Fields to remove entirely"
                        },
                        {
                            type: "object",
                            description: "Values to remove from array fields",
                            additionalProperties: {
                                type: "array",
                                items: {}
                            }
                        }
                    ]
                }
            },
            required: ["path"]
        };
    }
}
