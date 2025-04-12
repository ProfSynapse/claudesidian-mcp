import { BaseTool } from '../BaseTool';
import { IToolContext } from '../interfaces/ToolInterfaces';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { LineUtils } from '../../utils/LineUtils';

/**
 * Interface for note content with metadata
 */
export interface NoteContent {
    path: string;
    content: string;
    metadata?: Record<string, any>;
}

/**
 * Interface for line read results
 */
export interface LineReadResult {
    path: string;
    content: string;
    lineRange: {
        startLine: number;
        endLine: number;
    };
}

/**
 * NoteReaderTool provides three main operations:
 * 1. read - Read a single note with metadata
 * 2. batchRead - Read multiple notes at once
 * 3. lineRead - Read specific lines from a note
 */
export class NoteReaderTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'noteReader',
            description: 'Read note content and metadata, with support for full reads, batch reads, and line-specific reads.',
            version: '1.0.0',
            author: 'Claudesidian MCP'
        });
    }

    async execute(args: any): Promise<any> {
        if (!args?.action) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Action parameter is required'
            );
        }

        switch (args.action) {
            case 'read':
                return await this.readNote(args);
            case 'batchRead':
                return await this.batchReadNotes(args);
            case 'lineRead':
                return await this.readNoteLines(args);
            default:
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Unsupported action: ${args.action}`
                );
        }
    }

    private async readNote(args: any): Promise<NoteContent> {
        const { path } = args;

        if (!path) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Path parameter is required'
            );
        }

        const content = await this.context.vault.readNote(path);
        const metadata = await this.context.vault.getNoteMetadata(path);

        return {
            path,
            content,
            metadata: metadata || undefined
        };
    }

    private async batchReadNotes(args: any): Promise<NoteContent[]> {
        const { paths } = args;

        if (!Array.isArray(paths)) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'paths parameter must be an array of note paths'
            );
        }

        const results = await Promise.all(
            paths.map(async (path): Promise<NoteContent> => {
                try {
                    const content = await this.context.vault.readNote(path);
                    const metadata = await this.context.vault.getNoteMetadata(path);

                    return {
                        path,
                        content,
                        metadata: metadata || undefined
                    };
                } catch (error) {
                    console.error(`Failed to read note at ${path}:`, error);
                    return {
                        path,
                        content: '',
                        metadata: undefined
                    };
                }
            })
        );

        return results.filter(result => result.content !== '');
    }

    private async readNoteLines(args: any): Promise<LineReadResult> {
        const { path, startLine, endLine } = args;

        if (!path || !startLine) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'path and startLine parameters are required'
            );
        }

        const content = await this.context.vault.readNote(path);
        const extractedContent = LineUtils.getLines(content, { startLine, endLine });

        return {
            path,
            content: extractedContent,
            lineRange: {
                startLine,
                endLine: endLine || startLine
            }
        };
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["read", "batchRead", "lineRead"],
                    description: "The read operation to perform"
                },
                path: {
                    type: "string",
                    description: "Path to a single note"
                },
                paths: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of note paths for batch operations"
                },
                startLine: {
                    type: "number",
                    description: "First line to read (1-based)"
                },
                endLine: {
                    type: "number",
                    description: "Last line to read (1-based, optional)"
                }
            },
            required: ["action"],
            oneOf: [
                {
                    properties: { 
                        action: { const: "read" }
                    },
                    required: ["action", "path"]
                },
                {
                    properties: {
                        action: { const: "batchRead" }
                    },
                    required: ["action", "paths"]
                },
                {
                    properties: {
                        action: { const: "lineRead" }
                    },
                    required: ["action", "path", "startLine"]
                }
            ]
        };
    }
}
