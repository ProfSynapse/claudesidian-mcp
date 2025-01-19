import { BaseTool, IToolContext } from '../BaseTool';
import { join } from 'path';
import { TFile, TFolder, TAbstractFile, prepareFuzzySearch } from 'obsidian';
import { trackNoteAccess } from '../../utils/noteAccessTracker';
import { SearchUtil } from '../../utils/searchUtil';

interface EditRequest {
    text: string;
    instruction: string;
    content: string;
}

interface MappedEdit extends EditRequest {
    startIndex: number;
}

export class ManageNoteTool extends BaseTool {
    private searchUtil: SearchUtil;

    constructor(context: IToolContext) {
        super(context, {
            name: 'manageNote',
            description: 'Manage notes by creating, reading, inserting, editing, deleting, listing and searching in one tool.',
            version: '1.0.0',
            author: 'Bridge MCP'
        }, { allowUndo: true });

        this.searchUtil = new SearchUtil(context.vault);
    }

    private ensureMdExtension(path: string): string {
        if (!path.toLowerCase().endsWith('.md')) {
            return path + '.md';
        }
        return path;
    }

    private async ensureTrashFolder(): Promise<void> {
        const trashPath = 'Trash';
        if (!(await this.context.app.vault.adapter.exists(trashPath))) {
            await this.context.app.vault.createFolder(trashPath);
        }
    }

    async execute(args: any): Promise<any> {
        const { action } = args;
        switch (action) {
            case 'move':
                return await this.moveNote(args);
            case 'create':
                // ...use existing CreateNoteTool logic...
                return await this.createNote(args);
            case 'read':
                // ...use existing ReadNoteTool logic...
                return await this.readNote(args);
            case 'insert':
                // ...use existing InsertContentTool logic...
                return await this.insertContent(args);
            case 'edit':
                // ...use existing EditNoteTool logic...
                return await this.editNote(args);
            case 'delete':
                // ...use existing DeleteNoteTool logic...
                return await this.deleteNote(args);
            case 'list':
                return await this.listNotes(args);
            case 'search':
                return await this.searchNotes(args);
            default:
                throw new Error(`Unsupported manageNote action: ${action}`);
        }
    }

    private async createNote(args: any): Promise<any> {
        try {
            let { title, path, content, frontmatter, createFolders } = args;

            // If no path specified but title exists, create in inbox
            if (!path && title) {
                path = join(this.context.settings.rootPath, 'inbox', this.ensureMdExtension(title));
            } else if (!path) {
                // Fallback if neither path nor title specified
                path = join(this.context.settings.rootPath, 'inbox', `${Date.now()}.md`);
            } else if (!path.startsWith(this.context.settings.rootPath)) {
                // If path provided but not absolute, prefix with root path
                path = join(this.context.settings.rootPath, path);
            }

            if (content === undefined || content === null) {
                throw new Error('Content cannot be null or undefined');
            }

            // Ensure path has .md extension
            const finalPath = this.ensureMdExtension(path);

            const result = await this.context.vault.createNote(finalPath, content, {
                frontmatter,
                createFolders
            });

            // Add tracking after creation
            await trackNoteAccess(this.context.app.vault, finalPath, this.context.app);

            // Return a simplified response to avoid circular references
            return {
                success: true,
                path: finalPath
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    private async readNote(args: any): Promise<any> {
        const { path, includeFrontmatter, findSections } = args;
        
        await trackNoteAccess(this.context.app.vault, path);
        const content = await this.context.vault.readNote(path);
        let result: any = content;

        if (findSections?.length > 0) {
            const sections = findSections.map((section: {start: string, end: string}) => {
                const startIdx = content.indexOf(section.start);
                if (startIdx === -1) return null;

                const endIdx = content.indexOf(section.end, startIdx + section.start.length);
                if (endIdx === -1) return null;

                return {
                    start: section.start,
                    end: section.end,
                    content: content.substring(startIdx + section.start.length, endIdx)
                };
            }).filter(Boolean);

            result = { content, sections };
        }

        if (includeFrontmatter) {
            const metadata = await this.context.vault.getNoteMetadata(path);
            return {
                ...(typeof result === 'string' ? { content: result } : result),
                frontmatter: metadata
            };
        }

        return result;
    }

    private async insertContent(args: any): Promise<any> {
        const { path, content, mode, heading } = args;
        
        await trackNoteAccess(this.context.app.vault, path, this.context.app);
        const currentContent = await this.context.vault.readNote(path);
        let newContent: string;

        switch (mode) {
            case 'prepend':
                newContent = `${content}\n\n${currentContent}`;
                break;

            case 'append':
                newContent = `${currentContent}\n\n${content}`;
                break;

            case 'underHeading':
                if (!heading) throw new Error('Heading is required for underHeading mode');
                const headingRegex = new RegExp(`(#+\\s*${heading}\\s*\n)([^#]*)?`, 'i');
                const match = currentContent.match(headingRegex);
                if (!match) {
                    throw new Error(`Heading "${heading}" not found in note`);
                }
                const [fullMatch, headingLine, existingContent = ''] = match;
                newContent = currentContent.replace(
                    fullMatch,
                    `${headingLine}${existingContent}\n${content}\n`
                );
                break;

            default:
                throw new Error(`Unknown insertion mode: ${mode}`);
        }

        await this.context.vault.updateNote(path, newContent);
        return { oldContent: currentContent };
    }

    private async editNote(args: any): Promise<any> {
        const { path, edits, frontmatter } = args;
        
        await trackNoteAccess(this.context.vault, path);
        if (edits.length > 100) {
            throw new Error('Too many edits to process at once (limit: 100)');
        }

        const oldContent = await this.context.vault.readNote(path);
        let newContent = oldContent;

        // Process from bottom to top to maintain positions
        const sortedEdits = edits
            .map((edit: EditRequest) => ({
                ...edit,
                startIndex: newContent.indexOf(edit.text)
            }))
            .filter((edit: MappedEdit) => edit.startIndex !== -1)
            .sort((a: MappedEdit, b: MappedEdit) => b.startIndex - a.startIndex);

        for (const edit of sortedEdits) {
            try {
                // Direct replacement with provided content
                newContent = 
                    newContent.substring(0, edit.startIndex) +
                    edit.content +
                    newContent.substring(edit.startIndex + edit.text.length);
            } catch (error) {
                console.error(`Error processing edit: ${error}`);
            }
        }

        await this.context.vault.updateNote(path, newContent, { frontmatter });
        return { 
            oldContent,
            newContent,
            editsApplied: sortedEdits.length
        };
    }

    private async deleteNote(args: any): Promise<any> {
        const { path, permanent } = args;
        const file = await this.context.vault.getFile(path);
        if (!file) {
            throw new Error(`Note not found: ${path}`);
        }

        // Store content for undo
        const oldContent = await this.context.vault.readNote(path);
        const oldPath = file.path;

        if (!permanent) {
            await this.ensureTrashFolder();
        }
        
        // Delete the file
        await this.context.app.vault.trash(file, permanent);

        return {
            oldPath,
            oldContent
        };
    }

    private async listNotes(args: any): Promise<string[]> {
        const { includeFolders } = args;
        const files = this.context.app.vault.getFiles();
        return files.map(file => file.path);
    }

    private async searchNotes(args: any): Promise<any> {
        const { query, saveAsDistinct, path, limit } = args;
        
        const results = await this.searchUtil.search(query, {
            path,
            limit,
            includeMetadata: true
        });

        if (!results.length) {
            return null;
        }

        if (saveAsDistinct) {
            return `${this.context.settings.rootPath}/${this.createDistinctFilename(query)}`;
        }

        return results[0].file.path;
    }

    private createDistinctFilename(query: string): string {
        const timestamp = new Date().toISOString()
            .replace(/[-:]/g, '')
            .replace(/[T.]/g, '_')
            .slice(0, 15);
        
        const sanitizedQuery = query.toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 30);
        
        return `search_${timestamp}_${sanitizedQuery}`;
    }

    private async moveNote(args: any): Promise<any> {
        const { fromPath, toPath, createFolders } = args;
        
        // Get the source item
        const source = this.context.app.vault.getAbstractFileByPath(fromPath);
        if (!source) {
            throw new Error(`Path not found: ${fromPath}`);
        }

        // Track access before move
        if (source instanceof TFile) {
            await trackNoteAccess(this.context.app.vault, fromPath, this.context.app);
        }

        // Create parent folders if needed
        if (createFolders) {
            const toFolder = toPath.split('/').slice(0, -1).join('/');
            if (toFolder) {
                await this.context.app.vault.createFolder(toFolder);
            }
        }

        // Store old path for undo
        const oldPath = source.path;

        // Use appropriate rename method based on type
        if (source instanceof TFile) {
            await this.context.app.fileManager.renameFile(source, toPath);
            // Track access at new location
            await trackNoteAccess(this.context.app.vault, toPath, this.context.app);
        } else if (source instanceof TFolder) {
            await this.context.app.vault.rename(source, toPath);
        }

        return { oldPath, type: source instanceof TFile ? 'file' : 'folder' };
    }

    async undo(args: any, previousResult: any): Promise<void> {
        switch (args.action) {
            case 'move':
                if (previousResult?.oldPath) {
                    const item = this.context.app.vault.getAbstractFileByPath(args.toPath);
                    if (item) {
                        // Track access before moving back
                        if (item instanceof TFile) {
                            await trackNoteAccess(this.context.app.vault, args.toPath, this.context.app);
                        }
                        
                        if (previousResult.type === 'file' && item instanceof TFile) {
                            await this.context.app.fileManager.renameFile(item, previousResult.oldPath);
                            // Track access at restored location
                            await trackNoteAccess(this.context.app.vault, previousResult.oldPath, this.context.app);
                        } else if (previousResult.type === 'folder' && item instanceof TFolder) {
                            await this.context.app.vault.rename(item, previousResult.oldPath);
                        }
                    }
                }
                break;
            case 'create':
                await this.context.vault.deleteNote(previousResult.path);
                break;
            case 'edit':
            case 'insert':
                if (previousResult?.oldContent) {
                    await this.context.vault.updateNote(args.path, previousResult.oldContent);
                }
                break;
            case 'delete':
                if (previousResult?.oldPath && previousResult?.oldContent) {
                    await this.context.vault.createNote(
                        previousResult.oldPath,
                        previousResult.oldContent
                    );
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
                    enum: ["create", "read", "insert", "edit", "delete", "list", "search", "move"],
                    description: "The note action to perform"
                },
                // Create properties
                title: {
                    type: "string",
                    description: "Title for new note (create action)"
                },
                createFolders: {
                    type: "boolean",
                    description: "Create parent folders if they don't exist (create action)"
                },
                // Read properties
                includeFrontmatter: {
                    type: "boolean",
                    description: "Include YAML frontmatter in read results"
                },
                findSections: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            start: { type: "string" },
                            end: { type: "string" }
                        }
                    },
                    description: "Section markers to find (read action)"
                },
                // Insert properties
                mode: {
                    type: "string",
                    enum: ["prepend", "append", "underHeading"],
                    description: "Insertion mode (insert action)"
                },
                heading: {
                    type: "string",
                    description: "Target heading for underHeading mode (insert action)"
                },
                // Edit properties
                edits: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            text: { type: "string" },
                            instruction: { type: "string" },
                            content: { type: "string" }
                        }
                    },
                    description: "Edit operations to perform (edit action)"
                },
                // Delete properties
                permanent: {
                    type: "boolean",
                    description: "Permanently delete instead of moving to trash (delete action)"
                },
                // List properties
                includeFolders: {
                    type: "boolean",
                    description: "Include folders in list results (list action)"
                },
                // Search properties
                query: {
                    type: "string",
                    description: "Search query to find notes (search action)"
                },
                saveAsDistinct: {
                    type: "boolean",
                    description: "Save search result as a new distinct file (search action)"
                },
                // Move properties
                fromPath: {
                    type: "string",
                    description: "Current path of the file or folder (move action)"
                },
                toPath: {
                    type: "string",
                    description: "New path for the file or folder (move action)"
                },
                // Common properties
                path: {
                    type: "string",
                    description: "Path to the target note"
                },
                content: {
                    type: "string",
                    description: "Content for create/insert actions"
                },
                frontmatter: {
                    type: "object",
                    description: "YAML frontmatter to update",
                    additionalProperties: true
                }
            },
            required: ["action"]
        };
    }
}