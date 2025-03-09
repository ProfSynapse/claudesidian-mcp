import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IToolContext } from '../../interfaces/ToolInterfaces';
import { BaseNoteCommand } from './NoteCommandHandler';
import { sanitizeName } from '../../../utils/pathUtils';
import { trackNoteAccess } from '../../../utils/noteAccessTracker';
import { join } from 'path';

/**
 * Command for creating new notes
 */
export class CreateNoteCommand extends BaseNoteCommand {
    async execute(args: any, context: IToolContext): Promise<any> {
        this.validateArgs(args);
        
        try {
            const { title, path: rawPath, content, frontmatter } = args;

            if (content === undefined || content === null) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    'Content cannot be null or undefined'
                );
            }

            // Handle no path case and prepare path
            let finalPath: string;
            if (!rawPath) {
                const fileName = title ? sanitizeName(title) : `note_${Date.now()}`;
                finalPath = join('claudesidian/inbox', fileName);
            } else {
                finalPath = rawPath;
            }
            finalPath = this.preparePath(finalPath, context);
            
            // Create note with frontmatter
            const result = await context.vault.createNote(finalPath, content, {
                frontmatter,
                createFolders: true
            });

            return {
                success: true,
                path: finalPath
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async undo(args: any, previousResult: any, context: IToolContext): Promise<void> {
        if (previousResult?.path) {
            await context.vault.deleteNote(previousResult.path);
        }
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                title: {
                    type: "string",
                    description: "Title for the new note"
                },
                path: {
                    type: "string",
                    description: "Path where the note should be created"
                },
                content: {
                    type: "string",
                    description: "Content of the note"
                },
                frontmatter: {
                    type: "object",
                    description: "YAML frontmatter to add to the note",
                    additionalProperties: true
                }
            },
            required: ["content"]
        };
    }
}

/**
 * Command for reading notes
 */
export class ReadNoteCommand extends BaseNoteCommand {
    async execute(args: any, context: IToolContext): Promise<any> {
        this.validateArgs(args);
        
        const { path: rawPath, includeFrontmatter, findSections } = args;
        
        // Prepare and validate path
        const finalPath = this.preparePath(rawPath, context);
        const content = await context.vault.readNote(finalPath);
        
        // Only track access when actually reading content
        if (content) {
            await trackNoteAccess(context.app.vault, finalPath);
        }

        let result: any = content;

        // Handle section finding
        if (findSections?.length > 0) {
            const sections = findSections
                .map((section: {start: string, end: string}) => {
                    const startIdx = content.indexOf(section.start);
                    if (startIdx === -1) return null;

                    const endIdx = content.indexOf(section.end, startIdx + section.start.length);
                    if (endIdx === -1) return null;

                    return {
                        start: section.start,
                        end: section.end,
                        content: content.substring(startIdx + section.start.length, endIdx)
                    };
                })
                .filter(Boolean);

            result = { content, sections };
        }

        // Include frontmatter if requested
        if (includeFrontmatter) {
            const metadata = await context.vault.getNoteMetadata(finalPath);
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
                    description: "Whether to include YAML frontmatter in the result"
                },
                findSections: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            start: {
                                type: "string",
                                description: "Start marker for the section"
                            },
                            end: {
                                type: "string",
                                description: "End marker for the section"
                            }
                        },
                        required: ["start", "end"]
                    },
                    description: "Sections to find in the note content"
                }
            },
            required: ["path"]
        };
    }
}
