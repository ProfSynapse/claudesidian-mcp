import { BaseTool } from '../BaseTool';
import { IToolContext } from '../interfaces/ToolInterfaces';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { TFile, TAbstractFile } from 'obsidian';
import { TextOperationProcessor, TextOperation, TextOperationType } from './editor/TextOperationProcessor';
import { EditorPosition } from './editor/EditorInterfaces';

/**
 * Arguments for the NoteEditorTool
 */
interface NoteEditorArgs {
    path: string;
    operations: TextOperation[];
}

/**
 * Tool for performing precise text operations on notes using Obsidian's APIs
 */
export class NoteEditorTool extends BaseTool {
    private processor: TextOperationProcessor;
    
    constructor(context: IToolContext) {
        super(context, {
            name: 'noteEditor',
            description: 'Edit notes with precise operations using Obsidian\'s APIs. Supports inserting at headings (including wiki-links), replacing text, and more.',
            version: '2.0.0',
            author: 'Claudesidian MCP'
        }, { allowUndo: true });
        
        this.processor = new TextOperationProcessor(context.app);
    }
    
    async execute(args: any): Promise<any> {
        // Validate arguments
        this.validateArgs(args, this.getSchema());
        
        const { path, operations } = args as NoteEditorArgs;
        
        // Process the operations
        return await this.processor.processOperations(path, operations);
    }
    
    async undo(args: any, previousResult: any): Promise<void> {
        if (previousResult?.oldContent) {
            const { path } = args as NoteEditorArgs;
            // Get the file
            const file = this.context.app.vault.getAbstractFileByPath(path);
            if (!file || !(file instanceof TFile)) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `File not found: ${path}`
                );
            }
            
            // Restore the original content
            await this.context.app.vault.modify(file, previousResult.oldContent);
            await this.context.app.vault.modify(file, previousResult.oldContent);
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
                operations: {
                    type: "array",
                    items: {
                        type: "object",
                        oneOf: [
                            {
                                properties: {
                                    type: { const: "insertAtHeading" },
                                    heading: { 
                                        type: "string",
                                        description: "Heading to insert under, including any ## markers and [[wiki-links]]"
                                    },
                                    content: { 
                                        type: "string",
                                        description: "Content to insert under the heading"
                                    }
                                },
                                required: ["type", "heading", "content"]
                            },
                            {
                                properties: {
                                    type: { const: "insertAtPosition" },
                                    position: { 
                                        type: "object",
                                        properties: {
                                            line: {
                                                type: "number",
                                                description: "Line number (0-based)"
                                            },
                                            ch: {
                                                type: "number",
                                                description: "Character position within the line (0-based)"
                                            }
                                        },
                                        required: ["line", "ch"],
                                        description: "Position to insert at"
                                    },
                                    content: { 
                                        type: "string",
                                        description: "Content to insert at the specified position"
                                    }
                                },
                                required: ["type", "position", "content"]
                            },
                            {
                                properties: {
                                    type: { const: "replaceText" },
                                    search: { 
                                        type: "string",
                                        description: "Text to search for (only the first occurrence will be replaced)"
                                    },
                                    replace: { 
                                        type: "string",
                                        description: "Text to replace with"
                                    }
                                },
                                required: ["type", "search", "replace"]
                            },
                            {
                                properties: {
                                    type: { const: "replaceAllText" },
                                    search: { 
                                        type: "string",
                                        description: "Text to search for (all occurrences will be replaced)"
                                    },
                                    replace: { 
                                        type: "string",
                                        description: "Text to replace with"
                                    }
                                },
                                required: ["type", "search", "replace"]
                            },
                            {
                                properties: {
                                    type: { const: "appendToFile" },
                                    content: { 
                                        type: "string",
                                        description: "Content to append to the end of the file"
                                    }
                                },
                                required: ["type", "content"]
                            },
                            {
                                properties: {
                                    type: { const: "prependToFile" },
                                    content: { 
                                        type: "string",
                                        description: "Content to prepend to the beginning of the file"
                                    }
                                },
                                required: ["type", "content"]
                            }
                        ]
                    },
                    description: "List of operations to perform on the note"
                }
            },
            required: ["path", "operations"],
            examples: [
                {
                    path: "Notes/Example.md",
                    operations: [
                        {
                            type: "insertAtHeading",
                            heading: "## [[05. Interlude I]]",
                            content: "Content to insert under the heading"
                        }
                    ]
                },
                {
                    path: "Notes/Example.md",
                    operations: [
                        {
                            type: "replaceAllText",
                            search: "old text",
                            replace: "new text"
                        }
                    ]
                }
            ]
        };
    }
}