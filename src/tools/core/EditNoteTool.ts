import { BaseTool, IToolContext } from '../BaseTool';

interface Section {
    start: string;
    end?: string;
    content: string;
}

export class EditNoteTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'editNote',
            description: 'Edit specific sections in a note',
            version: '1.0.0',
            author: 'Bridge MCP'
        }, { allowUndo: true });
    }

    async execute(args: any): Promise<any> {
        const { path, sections, frontmatter } = args;
        const oldContent = await this.context.vault.readNote(path);
        let newContent = oldContent;

        for (const section of sections) {
            const startIndex = newContent.indexOf(section.start);
            if (startIndex === -1) {
                throw new Error(`Section starting with "${section.start}" not found`);
            }

            let endIndex: number;
            if (section.end) {
                endIndex = newContent.indexOf(section.end, startIndex);
                if (endIndex === -1) {
                    throw new Error(`Section ending with "${section.end}" not found`);
                }
                endIndex += section.end.length;
            } else {
                // If no end marker, replace until next section or end of content
                const nextSectionIndex = sections
                    .map((s: Section) => newContent.indexOf(s.start, startIndex + 1))
                    .filter((i: number) => i > -1)
                    .sort((a: number, b: number) => a - b)[0];
                endIndex = nextSectionIndex || newContent.length;
            }

            newContent = newContent.substring(0, startIndex) + 
                        section.content +
                        newContent.substring(endIndex);
        }

        await this.context.vault.updateNote(path, newContent, { frontmatter });
        return { oldContent };
    }

    async undo(args: any, previousResult: any): Promise<void> {
        if (previousResult?.oldContent) {
            await this.context.vault.updateNote(args.path, previousResult.oldContent);
        }
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Path to the note to edit"
                },
                sections: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            start: {
                                type: "string",
                                description: "Starting text of the section to replace"
                            },
                            end: {
                                type: "string",
                                description: "Optional ending text of the section"
                            },
                            content: {
                                type: "string",
                                description: "New content to replace the section with"
                            }
                        },
                        required: ["start", "content"]
                    },
                    description: "Sections to edit in the note"
                },
                frontmatter: {
                    type: "object",
                    description: "YAML frontmatter to update",
                    additionalProperties: true
                }
            },
            required: ["path", "sections"]
        };
    }
}
