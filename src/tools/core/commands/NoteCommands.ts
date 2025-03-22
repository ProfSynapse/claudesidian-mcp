import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IToolContext } from '../../interfaces/ToolInterfaces';
import { BaseNoteCommand } from './NoteCommandHandler';
import { sanitizeName } from '../../../utils/pathUtils';
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
        
        const { path: rawPath, findSections } = args;
        
        // Parse paths from the input
        const paths = this.parsePaths(rawPath);
        
        // Process all notes in parallel and concatenate their contents
        const contents = await Promise.all(
            paths.map(path => this.readSingleNote(path, findSections, context))
        );

        // Filter out nulls (failed reads) and combine contents
        const combinedContent = contents
            .filter(content => content !== null)
            .join('');

        return combinedContent || '';
    }

    /**
     * Parse the path parameter which could be a string path, array of paths,
     * or a JSON string containing an array of paths
     */
    private parsePaths(rawPath: any): string[] {
        if (typeof rawPath === 'string') {
            try {
                // Attempt to parse as JSON
                const parsed = JSON.parse(rawPath);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
            } catch (e) {
                // Not JSON, treat as single path
                return [rawPath];
            }
        }
        if (Array.isArray(rawPath)) {
            return rawPath;
        }
        return [rawPath];
    }

    /**
     * Read a single note and process its content
     */
    private async readSingleNote(
        path: string,
        findSections: Array<{start: string, end: string}> | undefined,
        context: IToolContext
    ): Promise<string | null> {
        try {
            const finalPath = this.preparePath(path, context);
            const content = await context.vault.readNote(finalPath);

            // Handle section finding if specified
            if (findSections && findSections.length > 0) {
                const sections = findSections
                    .map(section => {
                        const startIdx = content.indexOf(section.start);
                        if (startIdx === -1) return null;

                        const endIdx = content.indexOf(section.end, startIdx + section.start.length);
                        if (endIdx === -1) return null;

                        return content.substring(startIdx + section.start.length, endIdx);
                    })
                    .filter(Boolean);

                return sections.join('\n');
            }

            return content;
        } catch (error) {
            console.error(`Error reading note ${path}: ${error}`);
            return null;
        }
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                path: {
                    oneOf: [
                        {
                            type: "string",
                            description: "Path to a single note to read"
                        },
                        {
                            type: "array",
                            items: {
                                type: "string"
                            },
                            description: "Array of paths to read multiple notes"
                        }
                    ]
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
