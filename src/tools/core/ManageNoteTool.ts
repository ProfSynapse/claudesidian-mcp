import { BaseTool, IToolContext } from '../BaseTool';
import { join } from 'path';
import { TFile, TFolder, TAbstractFile, prepareFuzzySearch } from 'obsidian';
import { trackNoteAccess } from '../../utils/noteAccessTracker';
import { SearchUtil } from '../../utils/searchUtil';
import { 
    sanitizePath, 
    ensureMdExtension, 
    getFolderPath, 
    isValidPath,
    sanitizeName,
    isAbsolutePath,
    isMemoryOrReasoningPath 
} from '../../utils/pathUtils';

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
            description: 'Manage notes by creating, reading, inserting, editing, deleting, listing and searching in one tool. The reviewIndex tool from memory must be used prior to using any tool at the beginning of a conversation.',
            version: '1.0.0',
            author: 'Claudesidian MCP'
        }, { allowUndo: true });

        this.searchUtil = new SearchUtil(context.vault);
    }

    /**
     * Prepares a path for file operations by sanitizing and validating it
     * @throws Error if path is invalid
     */
    private preparePath(path: string, title?: string): string {
        let finalPath: string;

        // Handle no path case
        if (!path) {
            const fileName = title ? sanitizeName(title) : `note_${Date.now()}`;
            finalPath = join('claudesidian/inbox', fileName);
        } else {
            // Handle existing path
            if (isAbsolutePath(path)) {
                // Keep absolute paths as-is
                finalPath = path;
            } else if (!path.includes('/')) {
                // If it's a single file name (no directories), put it in Inbox
                finalPath = join('claudesidian/inbox', path);
            } else {
                // Keep all other paths as-is
                finalPath = path;
            }
        }

        // Sanitize the path based on whether it's in memory/reasoning folders
        const rootPath = this.context.settings.rootPath;
        const sanitizedPath = sanitizePath(finalPath, rootPath);
        if (!sanitizedPath) {
            throw new Error('Invalid path after sanitization');
        }

        // Ensure .md extension
        return ensureMdExtension(sanitizedPath);
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
            const { title, path: rawPath, content, frontmatter } = args;

            if (content === undefined || content === null) {
                throw new Error('Content cannot be null or undefined');
            }

            // Prepare and validate path
            const finalPath = this.preparePath(rawPath, title);
            
            // Always enable createFolders to ensure parent directories exist
            const result = await this.context.vault.createNote(finalPath, content, {
                frontmatter,
                createFolders: true
            });

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
        const { path: rawPath, includeFrontmatter, findSections } = args;
        
        // Prepare and validate path
        const finalPath = this.preparePath(rawPath);
        const content = await this.context.vault.readNote(finalPath);
        
        // Only track access when actually reading content
        if (content) {
            await trackNoteAccess(this.context.app.vault, finalPath);
        }
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
            const metadata = await this.context.vault.getNoteMetadata(finalPath);
            return {
                ...(typeof result === 'string' ? { content: result } : result),
                frontmatter: metadata
            };
        }

        return result;
    }

    private async insertContent(args: any): Promise<any> {
        const { path: rawPath, content, mode, heading } = args;
        
        // Prepare and validate path
        const finalPath = this.preparePath(rawPath);
        const currentContent = await this.context.vault.readNote(finalPath);
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

        await this.context.vault.updateNote(finalPath, newContent);
        return { oldContent: currentContent };
    }

    private async editNote(args: any): Promise<any> {
        const { path: rawPath, edits, frontmatter } = args;
        
        // Prepare and validate path
        const finalPath = this.preparePath(rawPath);
        
        if (edits.length > 100) {
            throw new Error('Too many edits to process at once (limit: 100)');
        }

        const oldContent = await this.context.vault.readNote(finalPath);
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

        await this.context.vault.updateNote(finalPath, newContent, { frontmatter });
        
        // Track access only after successful edit
        await trackNoteAccess(this.context.vault, finalPath);
        
        return { 
            oldContent,
            newContent,
            editsApplied: sortedEdits.length
        };
    }

    private async deleteNote(args: any): Promise<any> {
        const { path: rawPath, permanent } = args;
        const finalPath = this.preparePath(rawPath);
        
        const file = await this.context.vault.getFile(finalPath);
        if (!file) {
            throw new Error(`Note not found: ${finalPath}`);
        }

        // Store content for undo
        const oldContent = await this.context.vault.readNote(finalPath);
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
        const { 
            query, 
            saveAsDistinct, 
            path, 
            searchOptions = {} 
        } = args;

        const {
            weights,
            searchFields,
            threshold = 0,
            maxResults = 10
        } = searchOptions;

        // Get search results with rich metadata
        const searchResults = await this.searchUtil.search(query, {
            path,
            limit: maxResults,
            includeMetadata: true,
            searchFields,
            weights
        });

        // Filter by score threshold and map to desired format
        const filteredResults = searchResults
            .filter(result => result.score >= threshold)
            .map(result => ({
                path: result.file.path,
                score: result.score,
                matches: result.matches,
                metadata: result.metadata
            }));

        if (!filteredResults.length) {
            return null;
        }

        if (saveAsDistinct) {
            const distinctPath = `${this.context.settings.rootPath}/${this.createDistinctFilename(query)}`;
            return {
                distinctPath,
                results: filteredResults
            };
        }

        // Calculate average score
        const totalScore = filteredResults.reduce((sum, r) => sum + r.score, 0);
        
        return {
            results: filteredResults,
            totalResults: filteredResults.length,
            averageScore: totalScore / filteredResults.length,
            topResult: filteredResults[0].path // For backwards compatibility
        };
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
        const { fromPath: rawFromPath, toPath: rawToPath } = args;
        
        // Prepare and validate paths
        const fromPath = this.preparePath(rawFromPath);
        const toPath = this.preparePath(rawToPath);
        
        // Get the source item
        const source = this.context.app.vault.getAbstractFileByPath(fromPath);
        if (!source) {
            throw new Error(`Path not found: ${fromPath}`);
        }

        // Always create parent folders
        const toFolder = getFolderPath(toPath);
        await this.context.vault.ensureFolder(toFolder);


        // Store old path for undo
        const oldPath = source.path;

        // Use appropriate rename method based on type
        if (source instanceof TFile) {
            await this.context.app.fileManager.renameFile(source, toPath);
        } else if (source instanceof TFolder) {
            await this.context.app.vault.rename(source, toPath);
        }

        return { oldPath, type: source instanceof TFile ? 'file' : 'folder' };
    }

    async undo(args: any, previousResult: any): Promise<void> {
        try {
            switch (args.action) {
                case 'move':
                    if (previousResult?.oldPath) {
                        const toPath = this.preparePath(args.toPath);
                        const item = this.context.app.vault.getAbstractFileByPath(toPath);
                        if (item) {
                            if (previousResult.type === 'file' && item instanceof TFile) {
                                await this.context.app.fileManager.renameFile(item, previousResult.oldPath);
                            } else if (previousResult.type === 'folder' && item instanceof TFolder) {
                                await this.context.app.vault.rename(item, previousResult.oldPath);
                            }
                        }
                    }
                    break;
                case 'create':
                    if (previousResult?.path) {
                        const finalPath = this.preparePath(previousResult.path);
                        await this.context.vault.deleteNote(finalPath);
                    }
                    break;
                case 'edit':
                case 'insert':
                    if (previousResult?.oldContent) {
                        const finalPath = this.preparePath(args.path);
                        await this.context.vault.updateNote(finalPath, previousResult.oldContent);
                    }
                    break;
                case 'delete':
                    if (previousResult?.oldPath && previousResult?.oldContent) {
                        const finalPath = this.preparePath(previousResult.oldPath);
                        await this.context.vault.createNote(
                            finalPath,
                            previousResult.oldContent
                        );
                    }
                    break;
            }
        } catch (error) {
            console.error('Error in undo operation:', error);
            throw error;
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
                searchOptions: {
                    type: "object",
                    properties: {
                        weights: {
                            type: "object",
                            properties: {
                                fuzzyMatch: {
                                    type: "number",
                                    description: "Weight for fuzzy text matches"
                                },
                                exactMatch: {
                                    type: "number",
                                    description: "Weight for exact text matches"
                                },
                                lastViewed: {
                                    type: "number",
                                    description: "Weight for recently viewed notes"
                                },
                                accessCount: {
                                    type: "number",
                                    description: "Weight for frequently accessed notes"
                                },
                                metadata: {
                                    type: "object",
                                    properties: {
                                        title: {
                                            type: "number",
                                            description: "Weight for title matches"
                                        },
                                        tags: {
                                            type: "number",
                                            description: "Weight for tag matches"
                                        },
                                        category: {
                                            type: "number",
                                            description: "Weight for category matches"
                                        },
                                        description: {
                                            type: "number",
                                            description: "Weight for description matches"
                                        }
                                    }
                                }
                            }
                        },
                        searchFields: {
                            type: "array",
                            items: { type: "string" },
                            description: "Fields to include in search (e.g. title, content, tags)"
                        },
                        threshold: {
                            type: "number",
                            description: "Minimum score threshold for results"
                        },
                        maxResults: {
                            type: "number",
                            description: "Maximum number of results to return"
                        }
                    },
                    description: "Advanced search configuration options"
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
