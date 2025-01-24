import { BaseTool, IToolContext } from '../BaseTool';
import { join } from 'path';
import { TFolder, TAbstractFile, prepareFuzzySearch } from 'obsidian';

interface SearchFolderResult {
    path: string;
    name: string;
    score: number;
    matches?: string[];
}

export class ManageFolderTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'manageFolder',
            description: 'Manage folders by creating, listing, searching, moving and deleting.',
            version: '1.0.0',
            author: 'Claudesidian MCP'
        }, { allowUndo: true });
    }

    async execute(args: any): Promise<any> {
        const { action } = args;
        switch (action) {
            case 'create':
                return await this.createFolder(args);
            case 'list':
                return await this.listFolders(args);
            case 'search':
                return await this.searchFolders(args);
            case 'move':
                return await this.moveFolder(args);
            case 'delete':
                return await this.deleteFolder(args);
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }

    private async createFolder(args: any): Promise<any> {
        let { path, title, forceMcpRoot = false } = args;
        
        // If no path specified but title exists, create in inbox
        if (!path && title) {
            path = join('inbox', title);
            forceMcpRoot = true;
        }
        
        // Ensure inbox folder exists
        const inboxPath = join(this.context.settings.rootPath, 'inbox');
        if (!await this.context.vault.folderExists(inboxPath)) {
            await this.context.vault.createFolder(inboxPath);
        }

        const fullPath = this.getFullPath(path, forceMcpRoot);
        await this.context.vault.createFolder(fullPath);
        return { success: true, path: fullPath };
    }

    private async listFolders(args: any): Promise<string[]> {
        const { includeFiles, path } = args;
        const folders = this.context.app.vault.getAllLoadedFiles()
            .filter(file => file instanceof TFolder)
            .map(folder => folder.path);

        if (path) {
            return folders.filter(folder => folder.startsWith(path));
        }
        return folders;
    }

    private async searchFolders(args: any): Promise<SearchFolderResult[]> {
        const { query } = args;
        const folders = this.context.app.vault.getAllLoadedFiles()
            .filter(file => file instanceof TFolder);

        // Break query into individual words and remove common words
        const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to']);
        const queryWords = query.toLowerCase()
            .split(/\s+/)
            .filter((word: string) => !stopWords.has(word) && word.length > 1);

        const results = folders.map(folder => {
            const pathLower = folder.path.toLowerCase();
            let score = 0;
            let matches: string[] = [];

            // Score each word separately
            for (const word of queryWords) {
                const fuzzyMatch = prepareFuzzySearch(word)(pathLower);
                if (fuzzyMatch && fuzzyMatch.score > 0) {
                    score += fuzzyMatch.score;
                    matches.push(`"${word}": ${fuzzyMatch.score.toFixed(2)}`);
                }
            }

            // Boost score for exact matches
            queryWords.forEach((word: string) => {
                if (pathLower.includes(word)) {
                    score += 1;
                    matches.push(`exact "${word}"`);
                }
            });

            return {
                path: folder.path,
                name: folder.name,
                score,
                matches
            };
        })
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score);

        return results;
    }

    private async moveFolder(args: any): Promise<any> {
        const { fromPath, toPath, createParents = true } = args;
        
        const source = this.context.app.vault.getAbstractFileByPath(fromPath);
        if (!source || !(source instanceof TFolder)) {
            throw new Error(`Folder not found: ${fromPath}`);
        }

        if (createParents) {
            const parentPath = toPath.split('/').slice(0, -1).join('/');
            if (parentPath) {
                await this.context.vault.createFolder(parentPath);
            }
        }

        // Store old path for undo
        const oldPath = source.path;
        await this.context.app.vault.rename(source, toPath);
        
        return { success: true, oldPath, newPath: toPath };
    }

    private async deleteFolder(args: any): Promise<any> {
        const { path, force = false } = args;
        const folder = this.context.app.vault.getAbstractFileByPath(path);
        
        if (!folder || !(folder instanceof TFolder)) {
            throw new Error(`Folder not found: ${path}`);
        }

        // Store folder info for potential undo
        const folderInfo = {
            path: folder.path,
            files: await this.getFolderContents(folder)
        };

        if (force) {
            await this.context.app.vault.delete(folder, true);
        } else {
            await this.context.vault.cleanupEmptyFolders(path);
        }

        return { success: true, folderInfo };
    }

    private async getFolderContents(folder: TFolder): Promise<{path: string, content?: string}[]> {
        const files = folder.children
            .filter(file => file instanceof TAbstractFile)
            .map(async file => ({
                path: file.path,
                content: file instanceof TFolder ? undefined : 
                    await this.context.vault.readNote(file.path)
            }));
        return Promise.all(files);
    }

    private getFullPath(path: string, forceMcpRoot: boolean): string {
        return forceMcpRoot 
            ? (path.startsWith(this.context.settings.rootPath)
                ? path
                : join(this.context.settings.rootPath, path))
            : path;
    }

    async undo(args: any, previousResult: any): Promise<void> {
        switch (args.action) {
            case 'create':
                await this.context.vault.cleanupEmptyFolders(previousResult.path);
                break;
            case 'move':
                if (previousResult?.oldPath) {
                    const folder = this.context.app.vault.getAbstractFileByPath(previousResult.newPath);
                    if (folder && folder instanceof TFolder) {
                        await this.context.app.vault.rename(folder, previousResult.oldPath);
                    }
                }
                break;
            case 'delete':
                if (previousResult?.folderInfo) {
                    // Recreate folder and its contents
                    await this.context.vault.createFolder(previousResult.folderInfo.path);
                    for (const file of previousResult.folderInfo.files) {
                        if (file.content !== undefined) {
                            await this.context.vault.createNote(file.path, file.content);
                        }
                    }
                }
                break;
        }
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["create", "list", "search", "move", "delete"],
                    description: "The folder action to perform"
                },
                path: {
                    type: "string",
                    description: "Target folder path"
                },
                title: {
                    type: "string",
                    description: "Folder name for creation (will be placed in inbox if no path)"
                },
                query: {
                    type: "string",
                    description: "Search query for finding folders"
                },
                fromPath: {
                    type: "string",
                    description: "Source path for move operation"
                },
                toPath: {
                    type: "string", 
                    description: "Destination path for move operation"
                },
                includeFiles: {
                    type: "boolean",
                    description: "Include files in listing results",
                    default: false
                },
                force: {
                    type: "boolean",
                    description: "Force delete non-empty folders",
                    default: false
                },
                createParents: {
                    type: "boolean",
                    description: "Create parent folders if they don't exist",
                    default: true
                },
                forceMcpRoot: {
                    type: "boolean",
                    description: "Force paths to be relative to MCP root folder",
                    default: false
                }
            },
            required: ["action"]
        };
    }
}
