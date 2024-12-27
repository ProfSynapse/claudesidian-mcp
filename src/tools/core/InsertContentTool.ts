import { BaseTool, IToolContext } from '../BaseTool';

export class InsertContentTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'insertContent',
            description: 'Insert content into a note at a specific position',
            version: '1.0.0',
            author: 'Bridge MCP'
        }, { allowUndo: true });
    }

    async execute(args: any): Promise<any> {
        const { path, content, mode, heading } = args;
        const currentContent = await this.context.vault.readNote(path);
        let newContent: string;

        switch (mode) {
            case 'prepend':
                newContent = `${content}\n\n${currentContent}`;
                break;

            case 'append':
                newContent = `${currentContent}\n\n${content}`;
                break;

            case 'underHeading':
                if (!heading) throw new Error('Heading is required for underHeading mode');
                const headingRegex = new RegExp(`(#+\\s*${heading}\\s*\n)([^#]*)?`, 'i');
                const match = currentContent.match(headingRegex);
                if (!match) {
                    throw new Error(`Heading "${heading}" not found in note`);
                }
                const [fullMatch, headingLine, existingContent = ''] = match;
                newContent = currentContent.replace(
                    fullMatch,
                    `${headingLine}${existingContent}\n${content}\n`
                );
                break;

            default:
                throw new Error(`Unknown insertion mode: ${mode}`);
        }

        await this.context.vault.updateNote(path, newContent);
        return { oldContent: currentContent };
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
                    description: "Path to the note to modify"
                },
                content: {
                    type: "string",
                    description: "Content to insert"
                },
                mode: {
                    type: "string",
                    enum: ["prepend", "append", "underHeading"],
                    description: "Where to insert the content"
                },
                heading: {
                    type: "string",
                    description: "Required for underHeading mode: heading to insert under"
                }
            },
            required: ["path", "content", "mode"]
        };
    }
}
