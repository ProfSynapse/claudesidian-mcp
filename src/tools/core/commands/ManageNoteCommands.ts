import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IToolContext } from '../../interfaces/ToolInterfaces';
import { BaseNoteCommand } from './NoteCommandHandler';
import { getFolderPath } from '../../../utils/pathUtils';
import { SearchUtil, SEARCH_WEIGHTS } from '../../../utils/searchUtil';

/**
 * Command for searching notes
 */
export class SearchNotesCommand extends BaseNoteCommand {
    private searchUtil: SearchUtil;

    constructor(context: IToolContext) {
        super();
        this.searchUtil = new SearchUtil(context.vault);
    }

    async execute(args: any, context: IToolContext): Promise<any> {
        this.validateArgs(args);

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
            const distinctPath = `${context.settings.rootPath}/${this.createDistinctFilename(query)}`;
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
            topResult: filteredResults[0].path
        };
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search query to find notes"
                },
                searchOptions: {
                    type: "object",
                    properties: {
                        weights: {
                            type: "object",
                            description: "Custom weights for different search factors",
                            default: SEARCH_WEIGHTS
                        },
                        searchFields: {
                            type: "array",
                            items: { type: "string" },
                            description: "Fields to include in search"
                        },
                        threshold: {
                            type: "number",
                            description: "Minimum score threshold",
                            default: 0
                        },
                        maxResults: {
                            type: "number",
                            description: "Maximum number of results",
                            default: 10
                        }
                    }
                },
                saveAsDistinct: {
                    type: "boolean",
                    description: "Save search results as a new note"
                },
                path: {
                    type: "string",
                    description: "Optional path to limit search scope"
                }
            },
            required: ["query"]
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
}

/**
 * Command for listing notes
 */
export class ListNotesCommand extends BaseNoteCommand {
    async execute(args: any, context: IToolContext): Promise<string[]> {
        this.validateArgs(args);

        const { includeFolders } = args;
        const files = context.app.vault.getFiles();
        return files.map(file => file.path);
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                includeFolders: {
                    type: "boolean",
                    description: "Include folders in results",
                    default: false
                }
            }
        };
    }
}

/**
 * Command for moving notes
 */
export class MoveNoteCommand extends BaseNoteCommand {
    async execute(args: any, context: IToolContext): Promise<any> {
        this.validateArgs(args);
        
        const { fromPath: rawFromPath, toPath: rawToPath } = args;
        
        // Prepare and validate paths
        const fromPath = this.preparePath(rawFromPath, context);
        const toPath = this.preparePath(rawToPath, context);
        
        // Get the source item
        const source = context.app.vault.getAbstractFileByPath(fromPath);
        if (!source) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Path not found: ${fromPath}`
            );
        }

        // Always create parent folders
        const toFolder = getFolderPath(toPath);
        await context.vault.ensureFolder(toFolder);

        // Store old path for undo
        const oldPath = source.path;

        // Move the file
        await context.app.fileManager.renameFile(source, toPath);

        return { oldPath, type: 'file' };
    }

    async undo(args: any, previousResult: any, context: IToolContext): Promise<void> {
        if (previousResult?.oldPath) {
            const toPath = this.preparePath(args.toPath, context);
            const item = context.app.vault.getAbstractFileByPath(toPath);
            if (item) {
                await context.app.fileManager.renameFile(item, previousResult.oldPath);
            }
        }
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                fromPath: {
                    type: "string",
                    description: "Current path of the note"
                },
                toPath: {
                    type: "string",
                    description: "New path for the note"
                }
            },
            required: ["fromPath", "toPath"]
        };
    }
}
