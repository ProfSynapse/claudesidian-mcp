import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IToolContext } from '../../interfaces/ToolInterfaces';
import { BaseNoteCommand } from './NoteCommandHandler';

/**
 * Command for inserting content into notes
 */
export class InsertContentCommand extends BaseNoteCommand {
    async execute(args: any, context: IToolContext): Promise<any> {
        this.validateArgs(args);
        
        const { path: rawPath, content, mode, heading } = args;
        
        // Prepare and validate path
        const finalPath = this.preparePath(rawPath, context);
        const currentContent = await context.vault.readNote(finalPath);
        let newContent: string;

        switch (mode) {
            case 'prepend':
                newContent = `${content}\n\n${currentContent}`;
                break;

            case 'append':
                newContent = `${currentContent}\n\n${content}`;
                break;

            case 'underHeading':
                if (!heading) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        'Heading is required for underHeading mode'
                    );
                }
                const headingRegex = new RegExp(`(#+\\s*${heading}\\s*\n)([^#]*)?`, 'i');
                const match = currentContent.match(headingRegex);
                if (!match) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Heading "${heading}" not found in note`
                    );
                }
                const [fullMatch, headingLine, existingContent = ''] = match;
                newContent = currentContent.replace(
                    fullMatch,
                    `${headingLine}${existingContent}\n${content}\n`
                );
                break;

            default:
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Unknown insertion mode: ${mode}`
                );
        }

        await context.vault.updateNote(finalPath, newContent);
        return { oldContent: currentContent };
    }

    async undo(args: any, previousResult: any, context: IToolContext): Promise<void> {
        if (previousResult?.oldContent) {
            const finalPath = this.preparePath(args.path, context);
            await context.vault.updateNote(finalPath, previousResult.oldContent);
        }
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Path to the note to insert content into"
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
                    description: "Target heading for underHeading mode"
                }
            },
            required: ["path", "content", "mode"]
        };
    }
}
