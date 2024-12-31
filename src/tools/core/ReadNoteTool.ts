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
        const { path, includeFrontmatter, findSections } = args;
        
        const content = await this.context.vault.readNote(path);
        let result: any = content;

        if (findSections?.length > 0) {
            const sections = findSections.map((section: {start: string, end: string}) => {
                const startIdx = content.indexOf(section.start);
                if (startIdx === -1) return null;

                const endIdx = content.indexOf(section.end, startIdx + section.start.length);
                if (endIdx === -1) return null;

                return {
                    start: section.start,
                    end: section.end,
                    content: content.substring(startIdx + section.start.length, endIdx)
                };
            }).filter(Boolean);

            result = { content, sections };
        }

        if (includeFrontmatter) {
            const metadata = await this.context.vault.getNoteMetadata(path);
            return {
                ...(typeof result === 'string' ? { content: result } : result),
                frontmatter: metadata
            };
        }

        return result;
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
                },
                findSections: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            start: {
                                type: "string",
                                description: "Starting marker text of the section"
                            },
                            end: {
                                type: "string",
                                description: "Ending marker text of the section"
                            }
                        },
                        required: ["start", "end"]
                    },
                    description: "Find content between these section markers"
                }
            },
            required: ["path"]
        };
    }
}
