import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IToolContext } from '../../interfaces/ToolInterfaces';
import { BaseNoteCommand } from './NoteCommandHandler';
import { trackNoteAccess } from '../../../utils/noteAccessTracker';

interface ReplaceRequest {
    text: string;
    instruction: string;
    content: string;
}

interface MappedReplacement extends ReplaceRequest {
    startIndex: number;
}

/**
 * Command for replacing text in notes with multiple replacements
 */
export class ReplaceNoteCommand extends BaseNoteCommand {
    async execute(args: any, context: IToolContext): Promise<any> {
        this.validateArgs(args);
        
        const { path: rawPath, replacements: rawReplacements, frontmatter } = args;

        // Handle backwards compatibility with edits parameter
        const replacements = rawReplacements || args.edits;

        // Validate replacements is an array
        if (!Array.isArray(replacements)) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'replacements parameter must be an array'
            );
        }
        
        // Prepare and validate path
        const finalPath = this.preparePath(rawPath, context);
        
        // Read the original content
        const oldContent = await context.vault.readNote(finalPath);
        let newContent = oldContent;
        let totalReplacementsApplied = 0;
        
        // Process replacements in batches of 100
        for (let i = 0; i < replacements.length; i += 100) {
            const batchReplacements = replacements.slice(i, i + 100);
            
            // Process from bottom to top to maintain positions for this batch
            const sortedBatchReplacements = batchReplacements
                .map((replacement: ReplaceRequest) => ({
                    ...replacement,
                    startIndex: newContent.indexOf(replacement.text)
                }))
                .filter((replacement: MappedReplacement) => replacement.startIndex !== -1)
                .sort((a: MappedReplacement, b: MappedReplacement) => b.startIndex - a.startIndex);

            for (const replacement of sortedBatchReplacements) {
                try {
                    // Direct replacement with provided content
                    newContent = 
                        newContent.substring(0, replacement.startIndex) +
                        replacement.content +
                        newContent.substring(replacement.startIndex + replacement.text.length);
                    totalReplacementsApplied++;
                } catch (error) {
                    console.error(`Error processing replacement: ${error}`);
                }
            }
            
            // Save progress after each batch
            await context.vault.updateNote(finalPath, newContent, { frontmatter });
        }
        
        // Track access only after all replacements are complete
        await trackNoteAccess(context.app.vault, finalPath);
        
        return { 
            oldContent,
            newContent,
            replacementsApplied: totalReplacementsApplied
        };
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
                    description: "Path to the note to modify"
                },
                replacements: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            text: {
                                type: "string",
                                description: "Text to replace"
                            },
                            instruction: {
                                type: "string",
                                description: "Description of the replacement"
                            },
                            content: {
                                type: "string",
                                description: "New content to insert"
                            }
                        },
                        required: ["text", "content"]
                    },
                    description: "List of replacements to apply"
                },
                frontmatter: {
                    type: "object",
                    description: "Updated frontmatter",
                    additionalProperties: true
                }
            },
            required: ["path", "replacements"]
        };
    }
}
