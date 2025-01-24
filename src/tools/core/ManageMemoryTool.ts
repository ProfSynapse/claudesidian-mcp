import { BaseTool, IToolContext } from '../BaseTool';
import { Memory, MemoryType, MemoryTypes } from '../../services/MemoryManager';
import { TFile, prepareFuzzySearch } from 'obsidian';
import { MCPSettings } from '../../settings';
import { formatRelationshipSection } from '../../utils/relationshipUtils';
import { trackNoteAccess } from '../../utils/noteAccessTracker';
import { SearchUtil, MEMORY_SEARCH_WEIGHTS } from '../../utils/searchUtil';
import { EventTypes } from '../../services/EventManager';

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

interface ReasoningInfo {
    goal?: string;
    method?: string;
    steps?: string[];
    context?: string;
}

interface ManageMemoryArgs {
    action: 'create' | 'edit' | 'delete' | 'get' | 'list' | 'search' | 'reviewIndex';
    title?: string;
    content?: string;
    reasoning?: ReasoningInfo;  // Optional reasoning info for complex operations
    query?: string;
    type?: MemoryType;
    category?: string[];
    tags?: string[];
    includeRelated?: boolean;
    minStrength?: number;
    limit?: number;
    endConversation?: boolean;
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
    private settings: MCPSettings;
    private searchUtil: SearchUtil;

    constructor(context: IToolContext) {
        super(context, {
            name: 'manageMemory',
            description: `Memory Management Tool - ENFORCED WORKFLOW REQUIREMENTS:

1. EVERY conversation MUST start with 'reviewIndex' action
2. After reviewing index, you MUST use the reasoning tool
3. EVERY conversation MUST end with a memory operation (create/edit)
4. Set endConversation: true on your final memory operation

Required Sequence:
1. manageMemory reviewIndex (MANDATORY FIRST STEP)
2. reasoning tool (REQUIRED BEFORE CREATING/EDITING)
3. manageMemory create/edit (MANDATORY FINAL STEP)

Additional Operations:
- Use search/list to find relevant memories
- Use get/read to examine specific memories
- Follow memory traversal guide in Procedural Memories

Key Features:
- Category sections with emoji prefixes
- Relationship graph showing memory connections
- Quick stats showing memory distribution
- Importance-based sorting within categories
- Automatic archiving of less important memories

Note: Attempting to create/edit memories without first using reviewIndex 
and reasoning tools will result in an error.`,
            version: '1.0.0',
            author: 'Claudesidian MCP'
        });
        this.settings = context.settings;
        this.searchUtil = new SearchUtil(context.vault, MEMORY_SEARCH_WEIGHTS);
    }

    async execute(args: ManageMemoryArgs): Promise<any> {
        // Validate workflow sequence using ToolRegistry
        if (args.action === 'reviewIndex') {
            if (this.context.toolRegistry.phase !== 'start') {
                throw new Error('reviewIndex must be the first action');
            }
            // Phase transition will happen in ToolRegistry.executeTool
        } else if (this.context.toolRegistry.phase === 'start') {
            throw new Error('Must start with reviewIndex action');
        } else if (this.context.toolRegistry.phase === 'reviewed') {
            throw new Error('Must use reasoning after reviewIndex');
        }

        // Update memory operation state for create/edit
        if (['create', 'edit'].includes(args.action)) {
            this.context.toolRegistry.setHasSavedMemory(args.action, args.endConversation);
        }

        // Execute the action
        const result = await (async () => {
            switch (args.action) {
                case 'reviewIndex':
                    return this.reviewIndex();
                case 'create':
                    const createResult = await this.createMemory(args);
                    // Reset conversation state after successful create/edit
                    if (args.endConversation) {
                        this.context.toolRegistry.resetConversationState();
                    }
                    return createResult;
                case 'edit':
                    const editResult = await this.editMemory(args);
                    // Reset workflow state after successful create/edit
                    if (args.endConversation) {
                        this.context.toolRegistry.resetConversationState();
                    }
                    return editResult;
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
        })();

        return result;
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

        // Format content based on whether reasoning is included
        let content = args.content;
        if (args.reasoning) {
            content = [
                '# ' + title,
                '',
                '## Goal',
                args.reasoning.goal || 'No goal specified',
                '',
                '## Context',
                args.reasoning.context || 'No context provided',
                '',
                '## Method',
                args.reasoning.method || 'No method specified',
                '',
                '## Steps',
                ...(args.reasoning.steps?.map(s => `- ${s}`) || ['No steps provided']),
                '',
                '## Content',
                args.content,
                '',
                formatRelationshipSection(args.metadata?.relationships)
            ].join('\n');
        } else {
            content = [
                '# ' + title,
                '',
                args.content,
                '',
                formatRelationshipSection(args.metadata?.relationships)
            ].join('\n');
        }

        // Create memory using MemoryManager to ensure proper indexing
        const memory: Memory = {
            title,
            description: args.metadata?.description || `Memory created on ${new Date().toLocaleString()}`,
            content,
            category: args.metadata?.category || 'Episodic',
            tags: args.metadata?.tags || [],
            relationships: args.metadata?.relationships?.map(r => ({ relation: r, hits: 1 })) || [],
            createdAt: now,
            modifiedAt: now,
            lastViewedAt: now,
            metadata: {
                accessCount: 0,
                lastAccessed: Date.now(),
                importance: 0
            }
        };

        const file = await this.context.memory.createMemory(memory);
        return file;
    }

    private async editMemory(args: ManageMemoryArgs): Promise<any> {
        if (!args.title) throw new Error('Title is required for edit action');
        
        // Get existing memory
        const existingMemory = await this.context.memory.getMemory(args.title);
        if (!existingMemory) throw new Error(`Memory not found: ${args.title}`);

        const now = new Date().toISOString();

        // Format content based on whether reasoning is included
        let content = args.content || existingMemory.content;
        if (args.reasoning) {
            content = [
                '# ' + args.title,
                '',
                '## Goal',
                args.reasoning.goal || 'No goal specified',
                '',
                '## Context',
                args.reasoning.context || 'No context provided',
                '',
                '## Method',
                args.reasoning.method || 'No method specified',
                '',
                '## Steps',
                ...(args.reasoning.steps?.map(s => `- ${s}`) || ['No steps provided']),
                '',
                '## Content',
                args.content || existingMemory.content,
                '',
                formatRelationshipSection(args.metadata?.relationships || existingMemory.relationships?.map(r => r.relation))
            ].join('\n');
        } else {
            content = [
                '# ' + args.title,
                '',
                args.content || existingMemory.content,
                '',
                formatRelationshipSection(args.metadata?.relationships || existingMemory.relationships?.map(r => r.relation))
            ].join('\n');
        }

        // Update memory using MemoryManager to ensure proper indexing
        const updatedMemory: Memory = {
            ...existingMemory,
            content,
            description: args.metadata?.description || existingMemory.description,
            category: args.metadata?.category || existingMemory.category,
            tags: args.metadata?.tags || existingMemory.tags,
            relationships: args.metadata?.relationships?.map(r => ({ relation: r, hits: 1 })) || existingMemory.relationships,
            modifiedAt: now,
            lastViewedAt: now,
            metadata: {
                ...existingMemory.metadata,
                lastAccessed: Date.now()
            }
        };

        const file = await this.context.memory.updateMemory(updatedMemory);
        return file;
    }

    private async deleteMemory(title: string): Promise<void> {
        // Get existing memory to ensure it exists
        const existingMemory = await this.context.memory.getMemory(title);
        if (!existingMemory) throw new Error(`Memory not found: ${title}`);

        // Delete the file
        await this.context.vault.deleteNote(`${this.settings.rootPath}/memory/${title}.md`);

        // Emit event for other subscribers
        this.context.eventManager.emit(EventTypes.MEMORY_DELETED, {
            type: 'memory_deleted',
            title,
            path: `${this.settings.rootPath}/memory/${title}.md`,
            timestamp: Date.now()
        });
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
        try {
            // Mark index as reviewed in MemoryManager
            this.context.memory.setIndexReviewed();

            const indexPath = `${this.settings.rootPath}/index.md`;
            
            // Let IndexManager handle initialization
            if (!await this.context.vault.fileExists(indexPath)) {
                console.debug('ManageMemoryTool: Index not found, triggering IndexManager initialization...');
                // This will create the index with the proper rich format
                await this.context.indexManager.addToIndex({
                    title: 'index_initialization',
                    description: 'Initial index creation',
                    section: 'Core Memories',
                    type: 'system',
                    timestamp: Date.now()
                });
            }

            // Read and parse the index
            const content = await this.context.vault.readNote(indexPath);
            if (!content) {
                throw new Error('Failed to read memory index');
            }

            // Parse the index content
            const sections: IndexReviewResult['sections'] = {};
            let currentSection = '';
            let totalMemories = 0;

            content.split('\n').forEach(line => {
                if (line.startsWith('## ')) {
                    currentSection = line.substring(3).replace(/^[^a-zA-Z]+/, '').trim(); // Remove emoji prefix if present
                    sections[currentSection] = { count: 0, entries: [] };
                } else if (currentSection && line.trim().startsWith('- [[')) {
                    const match = line.match(/\[\[(.*?)\]\]\s*-?\s*(.*)?/);
                    if (match) {
                        sections[currentSection].entries.push({
                            title: match[1],
                            description: (match[2] || '').trim()
                        });
                        sections[currentSection].count++;
                        totalMemories++;
                    }
                }
            });

            // Ensure all core sections exist even if empty
            ['Core Memories', 'Episodic Memories', 'Semantic Memories', 'Procedural Memories', 
             'Emotional Memories', 'Contextual Memories'].forEach(section => {
                if (!sections[section]) {
                    sections[section] = { count: 0, entries: [] };
                }
            });

            return {
                sections,
                totalMemories,
                lastUpdated: Date.now()
            };
        } catch (error) {
            console.error('Failed to review index:', error);
            throw new Error(`Failed to review memory index: ${error instanceof Error ? error.message : String(error)}`);
        }
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
            description: "CRITICAL WORKFLOW REQUIREMENTS:\n\n" +
                "1. EVERY conversation MUST start with 'reviewIndex' action\n" +
                "2. EVERY conversation MUST end with a memory operation (create/edit)\n" +
                "3. Set endConversation: true on your final memory operation\n\n" +
                "This ensures consistent memory usage and knowledge preservation.",
            properties: {
                action: {
                    type: "string",
                    enum: ["reviewIndex", "create", "edit", "delete", "get", "list", "search"],
                    description: "The memory action to perform. MUST start with 'reviewIndex' for every new interaction."
                },
                endConversation: {
                    type: "boolean",
                    description: "Set to true on your final memory operation (create/edit) to properly end the conversation"
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
