import { BaseTool, IToolContext } from '../BaseTool';
import { Memory, MemoryType } from '../../services/MemoryManager';

interface CreateMemoryArgs {
    path: string;
    content: string;
    type?: MemoryType;
    categories?: string[];
    tags?: string[];
    description?: string;
}

interface MemoryToolArgs {
    action: 'create' | 'get' | 'delete' | 'list';
    path?: string;
    content?: string;
    type?: MemoryType;
    categories?: string[];
    tags?: string[];
    description?: string;
}

export class MemoryTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'memory',
            description: 'Manage and retrieve memory data',
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
                    enum: ["create", "get", "delete", "list"],
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
                type: {
                    type: "string",
                    enum: ["core", "episodic", "semantic", "procedural", "emotional", "contextual"],
                    description: "Type of memory"
                },
                categories: {
                    type: "array",
                    items: { type: "string" },
                    description: "Categories for the memory"
                },
                tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Tags for the memory"
                },
                description: {
                    type: "string",
                    description: "Description of the memory"
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
                if (!args.path || !args.content) {
                    throw new Error('Path and content are required for memory creation');
                }
                return this.createMemory({
                    path: args.path,
                    content: args.content,
                    type: args.type,
                    categories: args.categories,
                    tags: args.tags,
                    description: args.description
                });
            case 'get':
                if (!args.path) {
                    throw new Error('Path is required for getting memory');
                }
                return this.getMemory(args.path);
            case 'delete':
                if (!args.path) {
                    throw new Error('Path is required for deleting memory');
                }
                return this.context.memory.delete(args.path);
            case 'list':
                return this.context.memory.list();
            default:
                throw new Error(`Unknown action: ${args.action}`);
        }
    }

    private async createMemory(args: CreateMemoryArgs): Promise<any> {
        if (!args.path || !args.content) {
            throw new Error('Path and content are required for memory creation');
        }

        const title = args.path.replace(/\.memory$/, '');
        const memory: Memory = {
            title,
            content: args.content,
            description: args.description || `Memory about ${title}`,
            type: args.type || 'episodic',
            categories: args.categories || [],
            tags: args.tags || [],
            date: new Date().toISOString()
        };

        return this.context.memory.createMemory(memory);
    }

    private async getMemory(path: string): Promise<any> {
        if (!path) {
            throw new Error('Path is required for getting memory');
        }
        const title = path.replace(/\.memory$/, '');
        return this.context.memory.getMemory(title);
    }
}