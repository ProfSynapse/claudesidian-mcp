import { BaseTool, IToolContext } from '../BaseTool';
import { Memory, MemoryType, MemoryTypes } from '../../services/MemoryManager';
import { TFile, prepareFuzzySearch } from 'obsidian';
import { BridgeMCPSettings } from '../../settings';
import { formatRelationshipSection } from '../../utils/relationshipUtils';
import { trackNoteAccess } from '../../utils/noteAccessTracker';
import { SearchUtil, MEMORY_SEARCH_WEIGHTS } from '../../utils/searchUtil';

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
    metadata?: {
        isMoc?: boolean;
        mocLinks?: string[];
        success?: boolean;
        context?: string[];
    };
}

interface ManageMemoryArgs {
    action: 'create' | 'edit' | 'delete' | 'get' | 'list' | 'search' | 'reviewIndex';
    title?: string;
    content?: string;
    query?: string;
    type?: MemoryType;
    category?: string[];
    tags?: string[];
    includeRelated?: boolean;
    minStrength?: number;
    limit?: number;
    metadata?: {
        category?: MemoryType;
        description?: string;
        relationships?: string[];
        tags?: string[];
        success?: boolean;
    };
}

interface IndexReviewResult {
    sections: {
        [key: string]: {
            count: number;
            entries: Array<{
                title: string;
                description: string;
            }>;
        };
    };
    totalMemories: number;
    lastUpdated: number;
}

export class ManageMemoryTool extends BaseTool {
    private settings: BridgeMCPSettings;
    private searchUtil: SearchUtil;

    constructor(context: IToolContext) {
        super(context, {
            name: 'manageMemory',
            description: `Memory Management Tool - Follow this process:

1. ALWAYS start with 'reviewIndex' action to understand available memories
2. Use memory categories and relationships to guide your search
3. Follow the memory traversal guide (always at top of Procedural Memories)
4. Remember: More frequently accessed and successful memories appear higher in their sections

Example workflow:
1. manageMemory reviewIndex
2. manageMemory search {relevant terms}
3. manageMemory read {found memories}
4. Use gathered context in your reasoning

Key Index Features:
- Category sections with emoji prefixes for quick recognition
- Relationship graph showing memory type connections
- Quick stats showing memory distribution
- Importance-based sorting within categories
- Automatic archiving of less important memories`,
            version: '1.0.0',
            author: 'Bridge MCP'
        });
        this.settings = context.settings;
        this.searchUtil = new SearchUtil(context.vault, MEMORY_SEARCH_WEIGHTS);
    }

    async execute(args: ManageMemoryArgs): Promise<any> {
        switch (args.action) {
            case 'reviewIndex':
                return this.reviewIndex();
            case 'create':
                return this.createMemory(args);
            case 'edit':
                return this.editMemory(args);
            case 'delete':
                return this.deleteMemory(args.title!);
            case 'get':
                return this.getMemory(args.title!);
            case 'list':
                return this.listMemories(args);
            case 'search':
                return this.searchMemories(args);
            default:
                throw new Error(`Unknown action: ${args.action}`);
        }
    }

    private async createMemory(args: ManageMemoryArgs): Promise<any> {
        if (!args.content) {
            throw new Error('Content is required for memory creation');
        }

        const now = new Date().toISOString();
        let title = args.title;
        if (!title) {
            if (args.metadata?.category === 'Search') {
                const timestamp = now.replace(/[-:]/g, '').replace(/[T.]/g, '_').slice(0, 15);
                title = `search_${timestamp}`;
            } else {
                title = args.content.slice(0, 40)
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_|_$/g, '')
                    + '_' + Date.now();
            }
        }

        const memoryFolder = `${this.settings.rootPath}/memory`;
        await this.context.vault.ensureFolder(memoryFolder);
        
        const safeTitle = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');

        const formattedContent = [
            '# Memory',
            args.content,
            '',
            formatRelationshipSection(args.metadata?.relationships)
        ].join('\n');
        
        const file = await this.context.vault.createNote(
            `${memoryFolder}/${safeTitle}.md`,
            formattedContent,
            {
                frontmatter: {
                    category: args.metadata?.category || 'Episodic',
                    description: args.metadata?.description || `Memory created on ${new Date().toLocaleString()}`,
                    tags: args.metadata?.tags || [],
                    createdAt: now,
                    modifiedAt: now,
                    lastViewedAt: now,
                    success: args.metadata?.success
                },
                createFolders: true
            }
        );

        // Add tracking after creation
        await trackNoteAccess(this.context.app.vault, `${memoryFolder}/${safeTitle}.md`, this.context.app);

        await this.context.indexManager.addToIndex({
            title: safeTitle,
            description: args.metadata?.description || '',
            section: this.getMemoryTypeSection(args.metadata?.category || 'Episodic'),
            type: 'memory',
            timestamp: new Date(now).getTime()
        });

        return file;
    }

    private async editMemory(args: ManageMemoryArgs): Promise<any> {
        if (!args.title) throw new Error('Title is required for edit action');
        
        const path = `${this.settings.rootPath}/memory/${args.title}.md`;
        await trackNoteAccess(this.context.app.vault, path, this.context.app);
        
        const currentContent = await this.context.vault.readNote(path);
        if (!currentContent) throw new Error(`Memory not found: ${args.title}`);

        const now = new Date().toISOString();
        const formattedContent = args.content ? [
            '# Memory',
            args.content,
            '',
            formatRelationshipSection(args.metadata?.relationships)
        ].join('\n') : currentContent;

        await this.context.vault.updateNote(
            `${this.settings.rootPath}/memory/${args.title}.md`,
            formattedContent,
            {
                frontmatter: {
                    ...args.metadata,
                    modifiedAt: now,
                    lastViewedAt: now
                }
            }
        );

        return { success: true };
    }

    private async deleteMemory(title: string): Promise<void> {
        await this.context.vault.deleteNote(`${this.settings.rootPath}/memory/${title}.md`);
    }

    private async getMemory(title: string): Promise<SearchMemoryResult> {
        const path = `${this.settings.rootPath}/memory/${title}.md`;
        const file = this.context.app.vault.getAbstractFileByPath(path) as TFile;
        
        if (!file) throw new Error(`Memory not found: ${title}`);

        await trackNoteAccess(this.context.app.vault, file.path, this.context.app);

        const content = await this.context.vault.readNote(file.path);
        const metadata = await this.context.vault.getNoteMetadata(file.path);

        return this.createSearchResult(file, content, metadata);
    }

    private async createSearchResult(
        file: TFile, 
        content: string, 
        metadata: any,
        score?: number,
        matches?: Array<{ type: string; term: string; score: number; location: string }>
    ): Promise<SearchMemoryResult> {
        await trackNoteAccess(this.context.app.vault, file.path, this.context.app);
        
        return {
            file: {
                path: file.path,
                basename: file.basename,
                stat: { mtime: file.stat.mtime }
            },
            title: file.basename,
            type: metadata?.category || 'Episodic',
            description: metadata?.description || '',
            relationships: metadata?.relationships || [],
            strength: metadata?.strength || 0,
            score: score || 1,
            content,
            metadata: {
                isMoc: metadata?.isMoc || false,
                mocLinks: metadata?.mocLinks,
                success: metadata?.success,
                context: matches?.map(m => `${m.type} match: ${m.term} in ${m.location}`)
            }
        };
    }

    private async listMemories(args: ManageMemoryArgs): Promise<SearchMemoryResult[]> {
        const { type, category, tags, limit = 10 } = args;
        const memoryPath = `${this.settings.rootPath}/memory`;
        const files = this.context.app.vault.getMarkdownFiles()
            .filter(file => file.path.startsWith(memoryPath));
        
        let results: SearchMemoryResult[] = [];

        for (const file of files) {
            const content = await this.context.vault.readNote(file.path);
            const metadata = await this.context.vault.getNoteMetadata(file.path);
            
            if (!metadata?.type || !MemoryTypes.includes(metadata.type as MemoryType)) {
                continue;
            }

            if (type && metadata.type !== type) continue;
            if (category && !category.some(cat => metadata.categories?.includes(cat))) continue;
            if (tags && !tags.every(tag => metadata.tags?.includes(tag))) continue;

            results.push(await this.createSearchResult(file, content, metadata));
        }

        results.sort((a, b) => (b.file.stat?.mtime || 0) - (a.file.stat?.mtime || 0));
        return results.slice(0, limit);
    }

    private async searchMemories(args: ManageMemoryArgs): Promise<SearchMemoryResult[]> {
        const { query, type, limit = 10 } = args;
        const memoryPath = `${this.settings.rootPath}/memory`;

        if (!query) {
            return this.listMemories(args);
        }

        // Use SearchUtil with memory-specific configuration
        const searchResults = await this.searchUtil.search(query, {
            path: memoryPath,
            limit: limit * 2, // Get more results initially for filtering
            includeMetadata: true
        });

        // Filter and transform results
        const results = await Promise.all(
            searchResults
                .filter(result => {
                    // Filter by memory type if specified
                    if (type && result.metadata?.category !== type) {
                        return false;
                    }
                    return true;
                })
                .map(async result => {
                    const content = await this.context.vault.readNote(result.file.path);
                    return this.createSearchResult(
                        result.file,
                        content,
                        result.metadata,
                        result.score,
                        result.matches
                    );
                })
        );

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    private async reviewIndex(): Promise<IndexReviewResult> {
        const indexPath = `${this.settings.rootPath}/memory/index.md`;
        const content = await this.context.vault.readNote(indexPath);
        
        if (!content) {
            return {
                sections: {},
                totalMemories: 0,
                lastUpdated: Date.now()
            };
        }

        const sections: IndexReviewResult['sections'] = {};
        let currentSection = '';
        let totalMemories = 0;

        content.split('\n').forEach(line => {
            if (line.startsWith('## ')) {
                currentSection = line.substring(3);
                sections[currentSection] = { count: 0, entries: [] };
            } else if (currentSection && line.trim().startsWith('- [[')) {
                const match = line.match(/\[\[(.*?)\]\]\s*-\s*(.*)/);
                if (match) {
                    sections[currentSection].entries.push({
                        title: match[1],
                        description: match[2].trim()
                    });
                    sections[currentSection].count++;
                    totalMemories++;
                }
            }
        });

        return {
            sections,
            totalMemories,
            lastUpdated: Date.now()
        };
    }

    private getMemoryTypeSection(type: MemoryType): string {
        const sectionMap: Record<MemoryType, string> = {
            Core: 'Core Memories',
            Episodic: 'Episodic Memories',
            Semantic: 'Semantic Memories',
            Procedural: 'Procedural Memories',
            Emotional: 'Emotional Memories',
            Contextual: 'Contextual Memories',
            Search: 'Search Results'
        };
        
        return sectionMap[type] || 'Other Memories';
    }

    getSchema(): any {
        return {
            type: "object",
            title: "Memory Management Tool Schema",
            description: "IMPORTANT USAGE INSTRUCTIONS:\n\n" +
                "1. ALWAYS start your responses by reviewing the memory index using action 'reviewIndex'\n" +
                "2. Use search/list actions to gather relevant memories based on index review\n" +
                "3. Use the reasoning tool to plan your response\n" +
                "4. ALWAYS end your response by creating/updating memories as needed\n\n" +
                "This ensures consistent memory usage and knowledge preservation.",
            properties: {
                action: {
                    type: "string",
                    enum: ["reviewIndex", "create", "edit", "delete", "get", "list", "search"],
                    description: "The memory action to perform. Start with 'reviewIndex' for every new interaction."
                },
                title: {
                    type: "string",
                    description: "The title of the memory"
                },
                content: {
                    type: "string",
                    description: "The content of the memory"
                },
                query: {
                    type: "string",
                    description: "Search query for finding memories"
                },
                type: {
                    type: "string",
                    enum: ["Core", "Episodic", "Semantic", "Procedural", "Emotional", "Contextual", "Search"],
                    description: "The type of memory"
                },
                category: {
                    type: "array",
                    items: { type: "string" },
                    description: "Categories to filter memories by"
                },
                tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Tags to filter memories by"
                },
                includeRelated: {
                    type: "boolean",
                    description: "Whether to include related memories in the results"
                },
                minStrength: {
                    type: "number",
                    description: "Minimum strength threshold for memory matches"
                },
                limit: {
                    type: "number",
                    description: "Maximum number of results to return"
                },
                metadata: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            enum: ["Core", "Episodic", "Semantic", "Procedural", "Emotional", "Contextual", "Search"],
                            description: "The category of the memory"
                        },
                        description: {
                            type: "string",
                            description: "A description of the memory"
                        },
                        relationships: {
                            type: "array",
                            items: { type: "string" },
                            description: "Related memory titles"
                        },
                        tags: {
                            type: "array",
                            items: { type: "string" },
                            description: "Tags for the memory"
                        },
                        success: {
                            type: "boolean",
                            description: "Whether the memory represents a successful outcome"
                        }
                    }
                }
            },
            required: ["action"]
        };
    }
}
