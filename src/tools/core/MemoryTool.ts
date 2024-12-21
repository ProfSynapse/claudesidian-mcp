
import { BaseTool, IToolContext, IToolMetadata } from '../BaseTool';

export class MemoryTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'memory',
            description: 'Manage and retrieve memory data',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
    }

    async execute(args: any): Promise<any> {
        const { action, key, value } = args;

        switch (action) {
            case 'set':
                return this.context.memory.set(key, value);
            case 'get':
                return this.context.memory.get(key);
            case 'delete':
                return this.context.memory.delete(key);
            case 'list':
                return this.context.memory.list();
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }
}