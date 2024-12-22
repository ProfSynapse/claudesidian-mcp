import { BaseTool, IToolContext, IToolMetadata } from '../BaseTool';

interface ReasoningToolArgs {
    query: string;
}

export class ReasoningTool extends BaseTool {
    constructor(context: IToolContext) {
        super(context, {
            name: 'reasoning',
            description: 'Perform reasoning tasks based on context',
            version: '1.0.0',
            author: 'Bridge MCP'
        });
    }

    getSchema() {
        return {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The query to process"
                }
            },
            required: ["query"]
        };
    }

    async execute(args: ReasoningToolArgs): Promise<any> {
        if (!this.validateArgs(args, this.getSchema())) {
            throw new Error('Invalid arguments. Expected: { query: string }');
        }

        const { query } = args;
        return this.context.reasoning.process(query);
    }
}