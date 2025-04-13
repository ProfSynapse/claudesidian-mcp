import { BaseTool } from '../BaseTool';
import { IToolContext } from '../interfaces/ToolInterfaces';
import { SearchUtil, SEARCH_WEIGHTS } from '../../utils/searchUtil';
import { prepareFuzzySearch, TFolder, TAbstractFile, CachedMetadata, getAllTags } from 'obsidian';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export interface VaultItem {
    type: "folder" | "note";
    name: string;
    path: string;
}

export interface VaultListResult {
    path: string;
    items: VaultItem[];
    parent: string | null;  // null for root folder
}

export interface SearchResult {
    path: string;
    score: number;
    matches: {
        type: string;
        term: string;
        score: number;
        location: string;
    }[];
    metadata?: Record<string, any>;
}

/**
 * Tool for navigating and searching the vault.
 * Provides unified search across notes and folders with metadata support.
 */
export class VaultLibrarianTool extends BaseTool {
    private searchUtil: SearchUtil;

    constructor(context: IToolContext) {
        super(context, {
            name: 'vaultLibrarian',
            description: 'Navigate and search vault contents including notes, folders, and metadata',
            version: '1.0.0',
            author: 'Claudesidian MCP'
        });

        this.searchUtil = new SearchUtil(context.vault);
    }

    async execute(args: any): Promise<any> {
        if (!args?.mode) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Mode parameter is required (search, list, or analyze)'
            );
        }

        switch (args.mode) {
            case 'search':
                return await this.handleSearch(args);
            case 'list':
                return await this.handleList(args);
            case 'analyze':
                return await this.handleAnalyze(args);
            default:
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Unsupported mode: ${args.mode}`
                );
        }
    }

    /**
     * Handles search mode operations
     * Unified search across content, tags, and properties
     */
    private async handleSearch(args: any): Promise<any> {
        const { type = 'content', query, options = {} } = args;

        switch (type) {
            case 'content':
                return await this.search({ query, searchOptions: options });
            case 'tag':
                return await this.searchByTag({ tag: query });
            case 'property':
                const { key, value } = options;
                return await this.searchByProperty({ key, value });
            default:
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Unsupported search type: ${type}`
                );
        }
    }

    /**
     * Handles list mode operations
     * Lists vault structure, tags, and metadata
     */
    private async handleList(args: any): Promise<any> {
        const { type = 'structure', options = {} } = args;

        switch (type) {
            case 'structure':
                return await this.list(options);
            case 'tags':
                return await this.getTags(options);
            case 'properties':
                return await this.getProperties(options);
            default:
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Unsupported list type: ${type}`
                );
        }
    }

    /**
     * Handles analyze mode operations
     * Deep analysis of tags and metadata usage
     */
    private async handleAnalyze(args: any): Promise<any> {
        const { type = 'all', options = {} } = args;

        switch (type) {
            case 'all':
                return {
                    tags: await this.getTagStats(options),
                    properties: await this.getPropertyStats(options)
                };
            case 'tags':
                return await this.getTagStats(options);
            case 'properties':
                return await this.getPropertyStats(options);
            default:
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Unsupported analysis type: ${type}`
                );
        }
    }

    /**
     * List vault contents with improved structure for AI navigation
     */
    private async list(args: any): Promise<VaultListResult> {
        const { path = "", sortBy = "type" } = args;

        // Validate path if provided
        if (path) {
            const folder = this.context.app.vault.getAbstractFileByPath(path);
            if (!folder || !(folder instanceof TFolder)) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Invalid folder path: ${path}`
                );
            }
        }

        // Determine parent path (null for root, calculated for others)
        const parentPath = path === "" ? null :
            path.includes("/") ? 
                path.split("/").slice(0, -1).join("/") : 
                "";

        // Get all files and folders in the specified path
        const allItems = this.context.app.vault.getAllLoadedFiles();
        const items = allItems
            .filter(item => {
                if (!path) return !item.path.includes("/"); // Root items only
                return item.parent?.path === path; // Direct children of path
            })
            .map(item => {
                const type: "folder" | "note" = item instanceof TFolder ? "folder" : "note";
                return {
                    type,
                    name: item.name,
                    path: item.path
                };
            })
            .sort((a, b) => {
                switch (sortBy) {
                    case "name":
                        return a.name.localeCompare(b.name);
                    case "path":
                        return a.path.localeCompare(b.path);
                    default: // "type"
                        // Sort folders first, then by name
                        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
                        return a.name.localeCompare(b.name);
                }
            });

        return {
            path,
            items,
            parent: parentPath
        };
    }

    /**
     * Search vault contents with metadata support
     */
    private async search(args: any): Promise<{
        results: SearchResult[];
        totalResults: number;
        averageScore: number;
        topResult?: string;
    }> {
        const { 
            query,
            searchOptions = {}
        } = args;

        if (!query) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Query parameter is required'
            );
        }

        const options = {
            includeMetadata: true,
            ...searchOptions
        };

        // Get search results
        const searchResults = await this.searchUtil.search(query, options);

        // Filter and format results
        const results = searchResults
            .filter(result => result.score >= (options.threshold || 0))
            .map(result => ({
                path: result.file.path,
                score: result.score,
                matches: result.matches,
                metadata: result.metadata
            }))
            .slice(0, options.maxResults || 10);

        if (!results.length) {
            return {
                results: [],
                totalResults: 0,
                averageScore: 0
            };
        }

        // Calculate stats
        const totalScore = results.reduce((sum, r) => sum + r.score, 0);
        
        return {
            results,
            totalResults: results.length,
            averageScore: totalScore / results.length,
            topResult: results[0].path
        };
    }

    /**
     * Get all unique tags from vault using Obsidian's native metadata cache
     * This includes both frontmatter tags and inline tags
     */
    private async getTags(args: any): Promise<string[]> {
        const files = this.context.app.vault.getMarkdownFiles();
        const tagSet = new Set<string>();

        for (const file of files) {
            try {
                const cache = this.context.app.metadataCache.getCache(file.path);
                if (!cache) continue;

                const tags = getAllTags(cache);
                if (tags) {
                    tags.forEach(tag => {
                        // Remove the '#' prefix if present
                        const cleanTag = tag.startsWith('#') ? tag.slice(1) : tag;
                        tagSet.add(cleanTag);
                    });
                }
            } catch (error) {
                console.error(`Error getting tags from file ${file.path}:`, error);
                // Continue with next file instead of failing entire operation
            }
        }

        return Array.from(tagSet).sort();
    }

    /**
     * Get all property keys used in vault's frontmatter using Obsidian's metadata cache
     */
    private async getProperties(args: any): Promise<string[]> {
        return Array.from(await this.context.vault.getAllMetadataKeys());
    }

    /**
     * Get tag usage statistics across the vault
     */
    private async getTagStats(args: any): Promise<Record<string, number>> {
        return await this.context.vault.getTagStats();
    }

    /**
     * Get metadata property statistics and values across the vault
     */
    private async getPropertyStats(args: any): Promise<{
        allKeys: string[];
        keysWithStats: Record<string, {
            count: number;
            values: Set<string>;
        }>;
    }> {
        const allKeys = Array.from(await this.context.vault.getAllMetadataKeys());
        const files = this.context.app.vault.getMarkdownFiles();
        const keysWithStats: Record<string, { count: number; values: Set<string> }> = {};

        // Initialize stats for each key
        allKeys.forEach(key => {
            keysWithStats[key] = {
                count: 0,
                values: new Set()
            };
        });

        // Collect stats
        for (const file of files) {
            const cache = this.context.app.metadataCache.getCache(file.path);
            if (!cache?.frontmatter) continue;

            Object.entries(cache.frontmatter)
                .filter(([key]) => key !== 'position')
                .forEach(([key, value]) => {
                    if (keysWithStats[key]) {
                        keysWithStats[key].count++;
                        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                            keysWithStats[key].values.add(String(value));
                        }
                    }
                });
        }

        return { allKeys, keysWithStats };
    }

    /**
     * Search for notes with specific tag using Obsidian's native metadata cache
     * This will find tags in both frontmatter and inline tags
     */
    private async searchByTag(args: any): Promise<SearchResult[]> {
        const { tag } = args;
        if (!tag) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Tag parameter is required'
            );
        }

        // Add '#' prefix if not present for comparison with inline tags
        const searchTag = tag.startsWith('#') ? tag : '#' + tag;
        const files = this.context.app.vault.getMarkdownFiles();
        const results: SearchResult[] = [];

        for (const file of files) {
            try {
                const cache = this.context.app.metadataCache.getCache(file.path);
                if (!cache) continue;

                const tags = getAllTags(cache);
                if (!tags) continue;

                // Check both with and without '#' prefix
                if (tags.includes(searchTag) || tags.includes(tag)) {
                    const metadata = cache.frontmatter || {};
                    results.push({
                        path: file.path,
                        score: 1,
                        matches: [{
                            type: 'tag',
                            term: tag,
                            score: 1,
                            location: cache.frontmatter?.tags ? 'frontmatter' : 'content'
                        }],
                        metadata
                    });
                }
            } catch (error) {
                console.error(`Error searching tags in file ${file.path}:`, error);
                // Continue with next file instead of failing entire search
            }
        }

        return results;
    }

    /**
     * Search for notes with specific property value using Obsidian's metadata cache
     */
    private async searchByProperty(args: any): Promise<SearchResult[]> {
        const { key, value } = args;
        if (!key) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Key parameter is required'
            );
        }

        const files = this.context.app.vault.getMarkdownFiles();
        const results: SearchResult[] = [];

        for (const file of files) {
            try {
                const cache = this.context.app.metadataCache.getCache(file.path);
                if (!cache?.frontmatter) continue;

                const propertyValue = cache.frontmatter[key];
                if (propertyValue !== undefined) {
                    const matches = value === undefined || propertyValue === value;
                    if (matches) {
                        results.push({
                            path: file.path,
                            score: 1,
                            matches: [{
                                type: 'property',
                                term: key,
                                score: 1,
                                location: 'frontmatter'
                            }],
                            metadata: cache.frontmatter
                        });
                    }
                }
            } catch (error) {
                console.error(`Error searching properties in file ${file.path}:`, error);
                // Continue with next file instead of failing entire search
            }
        }

        return results;
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                mode: {
                    type: "string",
                    enum: ["search", "list", "analyze"],
                    description: "The mode to operate in",
                    examples: [
                        {
                            mode: "search",
                            description: "Search across content, tags, and metadata",
                            types: ["content", "tag", "property"]
                        },
                        {
                            mode: "list",
                            description: "List vault contents including structure, tags, and metadata",
                            types: ["structure", "tags", "properties"]
                        },
                        {
                            mode: "analyze",
                            description: "Deep analysis of tags and metadata usage",
                            types: ["all", "tags", "properties"]
                        }
                    ]
                },
                type: {
                    type: "string",
                    description: "The specific type of operation within the chosen mode"
                },
                path: {
                    type: "string",
                    description: "Optional path to list contents from. If not provided, lists root items.",
                    default: ""
                },
                sortBy: {
                    type: "string",
                    enum: ["name", "type", "path"],
                    description: "How to sort the results",
                    default: "type"
                },
                query: {
                    type: "string",
                    description: "Search query for finding content"
                },
                searchOptions: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "Optional path to limit search scope"
                        },
                        weights: {
                            type: "object",
                            description: "Custom weights for different search factors"
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
                tag: {
                    type: "string",
                    description: "Tag to search for"
                },
                key: {
                    type: "string",
                    description: "Property key to search for"
                },
                value: {
                    type: "string",
                    description: "Optional property value to match"
                }
            },
            required: ["mode"]
        };
    }
}
