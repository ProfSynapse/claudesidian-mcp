import { BaseTool, IToolContext } from '../BaseTool';
import { MemoryType, MemoryTypes } from '../../services/MemoryManager';
import { TFile, prepareFuzzySearch } from 'obsidian';

interface SearchMemoryResult {
    file: {
        path: string;
        basename: string;
        stat?: { mtime: number };
    };
    title: string;
    type: MemoryType;
    description: string;
    relationships: string[];
    strength: number;
    score: number;
    content: string;
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

    private getSearchScore(searchTerms: string, data: {
        content: string,
        tags?: string[],
        basename: string
    }): { score: number, matchType: string[] } {
        const matches: string[] = [];
        let score = 0;

        // Content match (weight: 0.4)
        if (data.content.toLowerCase().includes(searchTerms)) {
            score += 0.4;
            matches.push('content');
        }

        // Tag match (weight: 0.4)
        if (data.tags?.some(tag => {
            const normalizedTag = tag.toLowerCase().replace(/-/g, ' ');
            const normalizedSearch = searchTerms.toLowerCase();
            return normalizedTag.includes(normalizedSearch) || 
                   normalizedSearch.includes(normalizedTag);
        })) {
            score += 0.4;
            matches.push('tags');
        }

        // Filename match (weight: 0.2)
        const fuzzyResult = prepareFuzzySearch(searchTerms)(data.basename.toLowerCase());
        if (fuzzyResult) {
            score += 0.2 * fuzzyResult.score;
            matches.push('filename');
        }

        return { score, matchType: matches };
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

        const content = await this.readNoteContent(file);
        const metadata = await this.context.vault.getNoteMetadata(file.path);
        const defaultMetadata = {
            type: 'episodic' as MemoryType,
            description: '',
            relationships: [],
            strength: 0,
            score: 1
        };

        return [{
            file: {
                path: file.path,
                basename: file.basename,
                stat: { mtime: file.stat.mtime }
            },
            title: file.basename,
            content,
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
        const memoryPath = `${this.context.settings.rootPath}/memory`;
        const files = this.context.app.vault.getMarkdownFiles()
            .filter(file => file.path.startsWith(memoryPath));
        
        let results: SearchMemoryResult[] = [];

        for (const file of files) {
            const content = await this.readNoteContent(file);
            const metadata = await this.context.vault.getNoteMetadata(file.path);
            
            // Skip files without metadata or invalid memory type
            if (!metadata?.type || !MemoryTypes.includes(metadata.type as MemoryType)) {
                continue;
            }

            // Apply filters
            if (type && metadata.type !== type) continue;
            if (category && !category.some((cat: string) => metadata.categories?.includes(cat))) continue;
            if (tags && !tags.every((tag: string) => metadata.tags?.includes(tag))) continue;

            results.push({
                file: {
                    path: file.path,
                    basename: file.basename,
                    stat: { mtime: file.stat.mtime }
                },
                title: file.basename,
                type: metadata.type as MemoryType,
                description: metadata.description || '',
                relationships: metadata.relationships || [],
                strength: metadata.strength || 0,
                score: 1,
                content
            });
        }

        // Sort by most recent and limit results
        results.sort((a, b) => (b.file.stat?.mtime || 0) - (a.file.stat?.mtime || 0));
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

    private async readNoteContent(file: TFile): Promise<string> {
        return await this.context.vault.readNote(file.path);
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
                    description: "Keywords for fuzzy searching. One item MUST be a valid MemoryType (e.g. 'episodic')."
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
}
