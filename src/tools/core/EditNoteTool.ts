import { BaseTool, IToolContext } from '../BaseTool';

interface EditRequest {
    text: string;
    instruction: string;
    content: string;
}

interface MappedEdit extends EditRequest {
    startIndex: number;
}

export class EditNoteTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'editNote',
            description: 'Replace sections of text with improved versions based on instructions',
            version: '1.0.0',
            author: 'Bridge MCP'
        }, { allowUndo: true });
    }

    async execute(args: any): Promise<any> {
        const { path, edits, frontmatter } = args;
        
        if (edits.length > 100) {
            throw new Error('Too many edits to process at once (limit: 100)');
        }

        const oldContent = await this.context.vault.readNote(path);
        let newContent = oldContent;

        // Process from bottom to top to maintain positions
        const sortedEdits = edits
            .map((edit: EditRequest) => ({
                ...edit,
                startIndex: newContent.indexOf(edit.text)
            }))
            .filter((edit: MappedEdit) => edit.startIndex !== -1)
            .sort((a: MappedEdit, b: MappedEdit) => b.startIndex - a.startIndex);

        for (const edit of sortedEdits) {
            try {
                // Direct replacement with provided content
                newContent = 
                    newContent.substring(0, edit.startIndex) +
                    edit.content +
                    newContent.substring(edit.startIndex + edit.text.length);
            } catch (error) {
                console.error(`Error processing edit: ${error}`);
            }
        }

        await this.context.vault.updateNote(path, newContent, { frontmatter });
        return { 
            oldContent,
            newContent,
            editsApplied: sortedEdits.length
        };
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Path to the note to edit"
                },
                edits: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            text: {
                                type: "string",
                                description: "The original text to find and replace"
                            },
                            instruction: {
                                type: "string",
                                description: "The instruction that was used (e.g. 'make more formal')"
                            },
                            content: {
                                type: "string",
                                description: "The improved content to replace the original text with"
                            }
                        },
                        required: ["text", "instruction", "content"]
                    },
                    description: "Text sections with their improvements"
                },
                frontmatter: {
                    type: "object",
                    description: "YAML frontmatter to update",
                    additionalProperties: true
                }
            },
            required: ["path", "edits"]
        };
    }

    async undo(args: any, previousResult: any): Promise<void> {
        if (previousResult?.oldContent) {
            await this.context.vault.updateNote(args.path, previousResult.oldContent);
        }
    }
}
