import { BaseTool, IToolContext } from '../BaseTool';
import { MemoryType, MemoryTypes } from '../../services/MemoryManager';
import { TFile } from 'obsidian';

interface SearchMemoryResult {
    file: TFile;
    title: string;
    type: MemoryType;
    description: string;
    relationships: string[];
    strength: number;
}

interface SearchMemoryArgs {
    action: 'get' | 'list' | 'search';
    path?: string;
    query?: string;
    type?: MemoryType;
    category?: string[];
    tags?: string[];
    includeRelated?: boolean;
    minStrength?: number;
    limit?: number;
}

export class SearchMemoryTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'searchMemory',
            description: 'Search and retrieve memories with relationship awareness. Use this for accessing learned information, ' +
                        'past context, or connected knowledge. For general note operations (edit, insert, move), use search instead.',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["get", "list", "search"],
                    description: "The memory search action to perform"
                },
                path: {
                    type: "string",
                    description: "Specific memory path to retrieve"
                },
                query: {
                    type: "string",
                    description: "Search query for content and metadata"
                },
                type: {
                    type: "string",
                    enum: MemoryTypes,
                    description: "Type of memory to search for"
                },
                category: {
                    type: "array",
                    items: { type: "string" },
                    description: "Categories to filter by"
                },
                tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Tags to filter by"
                },
                includeRelated: {
                    type: "boolean",
                    description: "Include related memories in results",
                    default: false
                },
                minStrength: {
                    type: "number",
                    description: "Minimum relationship strength (0.0-1.0)",
                    minimum: 0,
                    maximum: 1
                },
                limit: {
                    type: "number",
                    description: "Maximum number of results",
                    default: 10
                }
            },
            required: ["action"],
            examples: [{
                action: "search",
                query: "python error handling",
                type: "semantic",
                includeRelated: true,
                description: "Find memories about Python error handling including related concepts"
            }, {
                action: "list",
                type: "episodic",
                description: "List recent experience-based memories"
            }]
        };
    }

    async execute(args: SearchMemoryArgs): Promise<SearchMemoryResult[]> {
        switch (args.action) {
            case 'get':
                return this.getMemory(args.path!);
            case 'list':
                return this.listMemories(args);
            case 'search':
                return this.searchMemories(args);
            default:
                throw new Error(`Unknown action: ${args.action}`);
        }
    }

    private async getMemory(path: string): Promise<SearchMemoryResult[]> {
        const file = this.context.app.vault.getAbstractFileByPath(path) as TFile;
        if (!file) {
            throw new Error(`Memory not found: ${path}`);
        }

        const metadata = await this.context.vault.getNoteMetadata(file.path);
        const defaultMetadata = {
            type: 'episodic' as MemoryType,
            description: '',
            relationships: [],
            strength: 0
        };

        return [{
            file,
            title: file.basename,
            ...defaultMetadata,
            ...(metadata && {
                type: metadata.type || defaultMetadata.type,
                description: metadata.description || defaultMetadata.description,
                relationships: metadata.relationships || defaultMetadata.relationships,
                strength: metadata.strength || defaultMetadata.strength
            })
        }];
    }

    private async listMemories(args: SearchMemoryArgs): Promise<SearchMemoryResult[]> {
        const { type, category, tags, limit = 10 } = args;
        const files = this.context.app.vault.getMarkdownFiles();
        let results: SearchMemoryResult[] = [];

        const defaultMetadata = {
            type: 'episodic' as MemoryType,
            description: '',
            relationships: [],
            strength: 0
        };

        for (const file of files) {
            const metadata = await this.context.vault.getNoteMetadata(file.path);
            
            // Skip files without metadata or invalid memory type
            if (!metadata?.type || !MemoryTypes.includes(metadata.type as MemoryType)) {
                continue;
            }

            // Apply filters
            if (type && metadata.type !== type) {
                continue;
            }
            if (category && !category.some(cat => metadata.categories?.includes(cat))) {
                continue;
            }
            if (tags && !tags.every(tag => metadata.tags?.includes(tag))) {
                continue;
            }

            results.push({
                file,
                title: file.basename,
                type: metadata.type || defaultMetadata.type,
                description: metadata.description || defaultMetadata.description,
                relationships: metadata.relationships || defaultMetadata.relationships,
                strength: metadata.strength || defaultMetadata.strength
            });
        }

        // Sort by most recent and limit results
        results.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
        return results.slice(0, limit);
    }

    private async searchMemories(args: SearchMemoryArgs): Promise<SearchMemoryResult[]> {
        const results = await this.listMemories(args);
        
        if (args.includeRelated) {
            const related = await this.findRelatedMemories(results, args.minStrength || 0.5);
            results.push(...related);
        }

        return this.sortByRelevance(results, args.query);
    }

    private async findRelatedMemories(seeds: SearchMemoryResult[], minStrength: number): Promise<SearchMemoryResult[]> {
        // Implementation for relationship-based memory retrieval
        // This would follow the relationship chains defined in the memory metadata
        // ...implementation details...
        return [];
    }

    private sortByRelevance(results: SearchMemoryResult[], query?: string): SearchMemoryResult[] {
        // Implementation for sorting results by relevance score
        // Consider relationship strength, recency, and query relevance
        // ...implementation details...
        return results;
    }
}
