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
    action: 'create' | 'edit' | 'delete' | 'get' | 'list' | 'search';
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

export class ManageMemoryTool extends BaseTool {
    private settings: BridgeMCPSettings;
    private searchUtil: SearchUtil;

    constructor(context: IToolContext) {
        super(context, {
            name: 'manageMemory',
            description: 'Create, edit, delete, search and manage memories. You MUST use this tool at the end of every output.',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
        this.settings = context.settings;
        this.searchUtil = new SearchUtil(context.vault, MEMORY_SEARCH_WEIGHTS);
    }

    async execute(args: ManageMemoryArgs): Promise<any> {
        switch (args.action) {
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
            if (args.metadata?.category === 'search') {
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
                    category: args.metadata?.category || 'episodic',
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
            section: this.getMemoryTypeSection(args.metadata?.category || 'episodic')
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
            type: metadata?.category || 'episodic',
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

    private getMemoryTypeSection(type: MemoryType): string {
        const sectionMap: Record<MemoryType, string> = {
            core: 'Core Memories',
            episodic: 'Episodic Memories',
            semantic: 'Semantic Memories',
            procedural: 'Procedural Memories',
            emotional: 'Emotional Memories',
            contextual: 'Contextual Memories',
            search: 'Search Results'
        };
        
        return sectionMap[type] || 'Other Memories';
    }

    getSchema(): any {
        return {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["create", "edit", "delete", "get", "list", "search"],
                    description: "The memory action to perform"
                },
                // ... Combine properties from both tools' schemas ...
            },
            required: ["action"]
        };
    }
}
