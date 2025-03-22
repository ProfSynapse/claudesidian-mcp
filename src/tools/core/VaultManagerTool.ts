import { BaseTool } from '../BaseTool';
import { IToolContext } from '../interfaces/ToolInterfaces';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { TFolder, TAbstractFile } from 'obsidian';
import { join } from 'path';
import { getFolderPath } from '../../utils/pathUtils';

export class VaultManagerTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'vaultManager',
            description: 'Manage vault content with operations for notes and folders: create, delete, and move.',
            version: '1.0.0',
            author: 'Claudesidian MCP'
        }, { allowUndo: true });
    }

    async execute(args: any): Promise<any> {
        if (!args?.action) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Action parameter is required'
            );
        }

        switch (args.action) {
            case 'createNote':
                return await this.createNote(args);
            case 'createFolder':
                return await this.createFolder(args);
            case 'deleteNote':
                return await this.deleteNote(args);
            case 'deleteFolder':
                return await this.deleteFolder(args);
            case 'moveNote':
                return await this.moveNote(args);
            case 'moveFolder':
                return await this.moveFolder(args);
            default:
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Unsupported action: ${args.action}`
                );
        }
    }

    private async createNote(args: any): Promise<any> {
        const { path, content = '', createFolders = true } = args;

        if (!path) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Path parameter is required'
            );
        }

        // Create parent folders if needed
        if (createFolders) {
            const folderPath = getFolderPath(path);
            if (folderPath) {
                await this.context.vault.createFolder(folderPath);
            }
        }

        // Create the note
        await this.context.vault.createNote(path, content);
        return { success: true, path };
    }

    private async createFolder(args: any): Promise<any> {
        const { path } = args;

        if (!path) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Path parameter is required'
            );
        }

        // Create the folder
        await this.context.vault.createFolder(path);
        return { success: true, path };
    }


    private async deleteNote(args: any): Promise<any> {
        const { path } = args;

        if (!path) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Path parameter is required'
            );
        }

        // Delete the note
        await this.context.vault.deleteNote(path);
        
        return { success: true, path };
    }

    private async deleteFolder(args: any): Promise<any> {
        const { path, force = false } = args;

        if (!path) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Path parameter is required'
            );
        }

        const folder = this.context.app.vault.getAbstractFileByPath(path);
        if (!folder || !(folder instanceof TFolder)) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Folder not found: ${path}`
            );
        }

        // Check if folder is empty
        if (!force && folder.children.length > 0) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Folder is not empty. Use force=true to delete anyway.`
            );
        }

        // Delete the folder
        await this.context.app.vault.delete(folder, force);
        return { success: true, path };
    }

    private async moveNote(args: any): Promise<any> {
        const { fromPath, toPath, createFolders = true } = args;

        if (!fromPath || !toPath) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Both fromPath and toPath parameters are required'
            );
        }

        // Create parent folders if needed
        if (createFolders) {
            const folderPath = getFolderPath(toPath);
            if (folderPath) {
                await this.context.vault.createFolder(folderPath);
            }
        }

        // Get the source file
        const source = this.context.app.vault.getAbstractFileByPath(fromPath);
        if (!source) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Note not found: ${fromPath}`
            );
        }

        // Store old path for undo
        const oldPath = source.path;

        // Move the note
        await this.context.app.fileManager.renameFile(source, toPath);

        return { success: true, oldPath, newPath: toPath };
    }

    private async moveFolder(args: any): Promise<any> {
        const { fromPath, toPath, createFolders = true } = args;

        if (!fromPath || !toPath) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Both fromPath and toPath parameters are required'
            );
        }

        const source = this.context.app.vault.getAbstractFileByPath(fromPath);
        if (!source || !(source instanceof TFolder)) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Folder not found: ${fromPath}`
            );
        }

        if (createFolders) {
            const parentPath = getFolderPath(toPath);
            if (parentPath) {
                await this.context.vault.createFolder(parentPath);
            }
        }

        // Store old path for undo
        const oldPath = source.path;
        await this.context.app.vault.rename(source, toPath);
        
        return { success: true, oldPath, newPath: toPath };
    }


    getSchema(): any {
        return {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["createNote", "createFolder", "deleteNote", "deleteFolder", "moveNote", "moveFolder"],
                    description: "The vault management action to perform"
                },
                paths: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of note paths for batch operations"
                },
                path: {
                    type: "string",
                    description: "Target path for the operation"
                },
                content: {
                    type: "string",
                    description: "Content for new notes"
                },
                fromPath: {
                    type: "string",
                    description: "Source path for move operations"
                },
                toPath: {
                    type: "string",
                    description: "Destination path for move operations"
                },
                createFolders: {
                    type: "boolean",
                    description: "Create parent folders if they don't exist",
                    default: true
                },
                force: {
                    type: "boolean",
                    description: "Force delete non-empty folders",
                    default: false
                }
            },
            required: ["action"],
            oneOf: [
                {
                    properties: {
                        action: { const: "createNote" }
                    },
                    required: ["action", "path"]
                },
                {
                    properties: {
                        action: { const: "createFolder" }
                    },
                    required: ["action", "path"]
                },
                {
                    properties: {
                        action: { const: "deleteNote" }
                    },
                    required: ["action", "path"]
                },
                {
                    properties: {
                        action: { const: "deleteFolder" }
                    },
                    required: ["action", "path"]
                },
                {
                    properties: {
                        action: { const: "moveNote" }
                    },
                    required: ["action", "fromPath", "toPath"]
                },
                {
                    properties: {
                        action: { const: "moveFolder" }
                    },
                    required: ["action", "fromPath", "toPath"]
                }
            ]
        };
    }
}