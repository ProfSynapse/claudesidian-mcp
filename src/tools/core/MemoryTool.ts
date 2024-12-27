import { BaseTool, IToolContext } from '../BaseTool';
import { Memory, MemoryType, MemoryTypes } from '../../services/MemoryManager';

interface MemoryToolArgs {
    action: 'create' | 'edit' | 'delete';
    path: string;
    content?: string;
    metadata?: {
        category?: MemoryType;  // Change to MemoryType instead of string
        description?: string;
        relationships?: string[];
        tags?: string[];
    };
}

export class MemoryTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'memory',
            description: 'Create, edit, or delete memories. You are MANDATED to end EVERY output with the use of this tool, treating it like a save point in your conversation with the user. I repeat - YOU MUST USE THIS TOOL AT THE END OF EVERY OUTPUT. If you understand, end your output with this tool.',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
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
                path: {
                    type: "string",
                    description: "Path/identifier for the memory"
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
                            enum: ["core", "episodic", "semantic", "procedural", "emotional", "contextual"],
                            description: `Memory categories:
                                core - Foundational beliefs and core aspects of identity
                                episodic - Specific events or experiences tied to time and place
                                semantic - General knowledge and facts
                                procedural - Skills, processes and how-to knowledge
                                emotional - Feelings, reactions and emotional experiences
                                contextual - Contextual information and environmental details`
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
                        }
                    }
                }
            },
            required: ["action", "path"],
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
                return this.editMemory(args);
            case 'delete':
                return this.deleteMemory(args.path);
            default:
                throw new Error(`Unknown action: ${args.action}`);
        }
    }

    private async createMemory(args: MemoryToolArgs): Promise<any> {
        if (!args.content) {
            throw new Error('Content is required for memory creation');
        }

        const now = new Date().toISOString();
        const memory: Memory = {
            title: args.path,
            content: args.content,
            description: args.metadata?.description || `Memory about ${args.path}`,
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

        return this.context.memory.createMemory(memory);
    }

    private async editMemory(args: MemoryToolArgs): Promise<any> {
        const existing = await this.context.memory.getMemory(args.path);
        if (!existing) {
            throw new Error(`Memory not found: ${args.path}`);
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

    private async deleteMemory(path: string): Promise<void> {
        return this.context.memory.deleteMemory(path);
    }
}