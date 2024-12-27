import { BaseTool, IToolContext } from '../BaseTool';
import { Memory, MemoryType, MemoryTypes } from '../../services/MemoryManager';
import { TFile } from 'obsidian';
import { BridgeMCPSettings } from '../../settings';
import { VaultManager } from '../../services/VaultManager';

interface MemoryToolArgs {
    action: 'create' | 'edit' | 'delete';
    title?: string;  // Replace path with title
    content?: string;
    metadata?: {
        category?: MemoryType;  // Change to MemoryType instead of string
        description?: string;
        relationships?: string[];
        tags?: string[];
        success?: boolean;  // Optional success flag for task-based memories
    };
}

export class MemoryTool extends BaseTool {
    private settings: BridgeMCPSettings;
    private vaultManager: VaultManager;

    constructor(context: IToolContext) {
        super(context, {
            name: 'memory',
            description: 'Create, edit, or delete memories. You are MANDATED to end EVERY output with the use of this tool, treating it like a save point in your conversation with the user. I repeat - YOU MUST USE THIS TOOL AT THE END OF EVERY OUTPUT. If you understand, end your output with this tool.',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
        this.settings = context.settings;
        this.vaultManager = context.vault;
    }

    getSchema() {
        return {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["create", "edit", "delete"],
                    description: "The action to perform"
                },
                title: {
                    type: "string",
                    description: "Title for the memory (used as filename)"
                },
                content: {
                    type: "string",
                    description: "Content of the memory"
                },
                metadata: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            enum: ["core", "episodic", "semantic", "procedural", "emotional", "contextual", "search"],
                            description: `Memory categories:
                                core - Foundational beliefs and core aspects of identity
                                episodic - Specific events or experiences tied to time and place
                                semantic - General knowledge and facts
                                procedural - Skills, processes and how-to knowledge
                                emotional - Feelings, reactions and emotional experiences
                                contextual - Contextual information and environmental details
                                search - Results from search operations`
                        },
                        description: {
                            type: "string",
                            description: "Description of the memory"
                        },
                        relationships: {
                            type: "array",
                            items: { 
                                type: "string",
                                description: "Relationship in format '#predicate [[object]]'"
                            }
                        },
                        tags: {
                            type: "array",
                            items: { type: "string" },
                            description: "Tags for the memory"
                        },
                        success: {
                            type: "boolean",
                            description: "Optional flag indicating if this memory represents a successful task/action. Most relevant for episodic and procedural memories."
                        }
                    }
                }
            },
            required: ["action"],
            additionalProperties: false
        };
    }

    async execute(args: MemoryToolArgs): Promise<any> {
        if (!this.validateArgs(args, this.getSchema())) {
            throw new Error('Invalid arguments provided to memory tool');
        }

        switch (args.action) {
            case 'create':
                return this.createMemory(args);
            case 'edit':
                if (!args.title) throw new Error('Title is required for edit action');
                return this.editMemory(args);
            case 'delete':
                if (!args.title) throw new Error('Title is required for delete action');
                return this.deleteMemory(args.title);
            default:
                throw new Error(`Unknown action: ${args.action}`);
        }
    }

    private async createMemory(args: MemoryToolArgs): Promise<any> {
        if (!args.content) {
            throw new Error('Content is required for memory creation');
        }

        const now = new Date().toISOString();
        
        // Generate title if not provided
        let title = args.title;
        if (!title) {
            if (args.metadata?.category === 'search') {
                const timestamp = now.replace(/[-:]/g, '').replace(/[T.]/g, '_').slice(0, 15);
                title = `search_${timestamp}`;
            } else {
                // Generate a slug from the first few words of content
                title = args.content.slice(0, 40)
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_|_$/g, '')
                    + '_' + Date.now();
            }
        }

        const memory: Memory = {
            title,
            content: args.content,
            description: args.metadata?.description || `Memory created on ${new Date().toLocaleString()}`,
            category: args.metadata?.category || 'episodic',  // Now correctly typed as MemoryType
            tags: args.metadata?.tags || [],
            relationships: args.metadata?.relationships?.map(r => ({ 
                relation: r, 
                hits: 1 
            })) || [],
            createdAt: now,
            modifiedAt: now,
            lastViewedAt: now
        };

        const memoryFolder = `${this.settings.rootPath}/memory`;
        await this.context.vault.ensureFolder(memoryFolder);
        
        const safeTitle = memory.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');

        // Format content with Memory and Relationships sections
        const formattedContent = [
            '# Memory',
            args.content,
            '',
            '# Relationships',
            ...(args.metadata?.relationships?.map(r => r) || [])
        ].join('\n');
        
        const file = await this.context.vault.createNote(
            `${memoryFolder}/${safeTitle}.md`, // Add .md extension
            formattedContent,
            {
                frontmatter: {
                    category: memory.category,
                    description: memory.description,
                    tags: memory.tags,
                    relationships: memory.relationships,
                    createdAt: memory.createdAt,
                    modifiedAt: memory.modifiedAt,
                    lastViewedAt: memory.lastViewedAt,
                    success: args.metadata?.success,  // Add success to frontmatter if provided
                },
                createFolders: true
            }
        );

        // Update index using IndexManager
        await this.context.indexManager.addToIndex({
            title: memory.title,
            description: memory.description,
            section: this.getMemoryTypeSection(memory.category)
        });

        return file;
    }

    private async editMemory(args: MemoryToolArgs): Promise<any> {
        const existing = await this.context.memory.getMemory(args.title!);
        if (!existing) {
            throw new Error(`Memory not found: ${args.title}`);
        }

        // Increment hits for relationships
        const updatedRelationships = existing.relationships?.map(rel => ({
            ...rel,
            hits: rel.hits + 1
        }));

        const now = new Date().toISOString();
        const updated: Memory = {
            ...existing,
            content: args.content || existing.content,
            description: args.metadata?.description || existing.description,
            category: args.metadata?.category || existing.category,  // Now correctly typed
            tags: args.metadata?.tags || existing.tags,
            relationships: args.metadata?.relationships ? 
                args.metadata.relationships.map(r => ({ relation: r, hits: 1 })) :
                updatedRelationships,
            modifiedAt: now,
            lastViewedAt: now
        };

        return this.context.memory.updateMemory(updated);
    }

    private async deleteMemory(title: string): Promise<void> {
        const memoryFolder = `${this.settings.rootPath}/memory`;
        const path = `${memoryFolder}/${title}`;
        return this.context.vault.deleteNote(path);
    }

    async getMemory(title: string): Promise<Memory | null> {
        try {
            const memoryFolder = `${this.settings.rootPath}/memory`;
            const path = `${memoryFolder}/${title}`;
            
            // Replace vaultManager with context.vault
            const content = await this.context.vault.readNote(path);
            const metadata = await this.context.vault.getNoteMetadata(path);

            if (!content || !metadata) {
                return null;
            }

            // Update last viewed timestamp
            const now = new Date().toISOString();
            await this.context.vault.updateNoteMetadata(path, {
                ...metadata,
                lastViewedAt: now
            });

            return {
                title,
                content,
                description: metadata.description || '',
                category: metadata.category || 'episodic',
                tags: metadata.tags || [],
                relationships: metadata.relationships || [],
                createdAt: metadata.createdAt || now,
                modifiedAt: metadata.modifiedAt || now,
                lastViewedAt: now
            };
        } catch (error) {
            throw new Error(`Failed to get memory: ${error.message}`);
        }
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
}