import { BaseTool, IToolContext } from '../BaseTool';

export class UpdateFrontmatterTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'updateFrontmatter',
            description: 'Update YAML frontmatter in a note',
            version: '1.0.0',
            author: 'Bridge MCP'
        }, { allowUndo: true });
    }

    async execute(args: any): Promise<any> {
        const { path, frontmatter, mode = 'merge' } = args;
        const currentContent = await this.context.vault.readNote(path);
        const currentMetadata = await this.context.vault.getNoteMetadata(path) || {};

        // Store old state for undo
        const oldMetadata = { ...currentMetadata };

        // Update frontmatter based on mode
        const newMetadata = mode === 'replace' 
            ? frontmatter 
            : { ...currentMetadata, ...frontmatter };

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
                frontmatter: {
                    type: "object",
                    description: "Frontmatter fields to update",
                    additionalProperties: true
                },
                mode: {
                    type: "string",
                    enum: ["merge", "replace"],
                    description: "Whether to merge with existing frontmatter or replace it entirely",
                    default: "merge"
                }
            },
            required: ["path", "frontmatter"]
        };
    }
}
