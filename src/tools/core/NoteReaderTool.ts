import { BaseTool } from '../BaseTool';
import { IToolContext } from '../interfaces/ToolInterfaces';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { TFile } from 'obsidian';

export interface NoteContent {
    path: string;
    content: string;
    metadata?: Record<string, any>;
}

export class NoteReaderTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'noteReader',
            description: 'Read note content and metadata, supporting both single and batch operations.',
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
            case 'readWithMetadata':
                return await this.readNoteWithMetadata(args);
            case 'readAllInFolder':
                return await this.readAllInFolder(args);
            default:
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Unsupported action: ${args.action}`
                );
        }
    }

    private async readNote(args: any): Promise<string> {
        const { path } = args;

        if (!path) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Path parameter is required'
            );
        }

        return await this.context.vault.readNote(path);
    }

    private async readNoteWithMetadata(args: any): Promise<NoteContent> {
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
        const { paths, includeMetadata = true } = args;

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
                    const metadata = includeMetadata ? 
                        await this.context.vault.getNoteMetadata(path) : 
                        undefined;

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

    private async readAllInFolder(args: any): Promise<NoteContent[]> {
        const { folderPath, includeMetadata = true, recursive = false } = args;

        if (!folderPath) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'folderPath parameter is required'
            );
        }

        const files = this.context.app.vault.getMarkdownFiles()
            .filter(file => {
                if (recursive) {
                    return file.path.startsWith(folderPath);
                }
                return file.parent?.path === folderPath;
            });

        return this.batchReadNotes({
            paths: files.map(f => f.path),
            includeMetadata
        });
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["read", "batchRead", "readWithMetadata", "readAllInFolder"],
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
                folderPath: {
                    type: "string",
                    description: "Path to folder for reading all notes"
                },
                includeMetadata: {
                    type: "boolean",
                    description: "Include note metadata in results",
                    default: true
                },
                recursive: {
                    type: "boolean",
                    description: "Include notes in subfolders when reading folder",
                    default: false
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
                        action: { const: "readWithMetadata" }
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
                        action: { const: "readAllInFolder" }
                    },
                    required: ["action", "folderPath"]
                }
            ]
        };
    }
}