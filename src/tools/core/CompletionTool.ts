import { BaseTool, IToolMetadata } from '../BaseTool';
import { AIProvider, AIModelMap } from '../../ai/models';
import { MCPSettings } from '../../types';
import { IAIAdapter } from '../../ai/interfaces/IAIAdapter';
import { IToolContext } from '../interfaces/ToolInterfaces';

/**
 * Tool for generating AI completions
 * Uses dependency injection for AI adapter
 */
export class CompletionTool extends BaseTool {
    /**
     * Creates a new CompletionTool
     * @param context Tool context
     * @param aiAdapter AI adapter for generating completions
     */
    constructor(
        // Type casting is necessary here because the IToolContext from BaseTool
        // might differ from the one in ToolInterfaces. This should be fixed in a future refactoring
        // by consolidating the interfaces.
        context: IToolContext,
        private aiAdapter: IAIAdapter
    ) {
        const metadata: IToolMetadata = {
            name: 'completion',
            description: 'Generate AI completions using OpenRouter.\n\n' +
                        'Note: For current or fact-based information, default to Perplexity Huge model as it has internet access.',
            version: '1.0.0'
        };

        super(context, metadata, {
            requireConfirmation: false
        });
    }

    /**
     * Gets the JSON schema for tool arguments
     * @returns JSON schema object
     */
    getSchema() {
        return {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'The prompt to send to the AI model'
                },
                model: {
                    type: 'string',
                    description: 'Optional: The model to use',
                    enum: AIModelMap[AIProvider.OpenRouter].map(m => m.apiName)
                },
                temperature: {
                    type: 'number',
                    description: 'Optional: Temperature (0.0-1.0)',
                    minimum: 0,
                    maximum: 1
                },
                maxTokens: {
                    type: 'number',
                    description: 'Optional: Maximum tokens to generate',
                    minimum: 1
                }
            },
            required: ['prompt']
        };
    }

    /**
     * Executes the completion tool
     * @param args Tool arguments
     * @returns Completion result
     * @throws Error if completion fails
     */
    async execute(args: {
        prompt: string;
        model?: string;
        temperature?: number;
        maxTokens?: number;
    }) {
        // Get settings directly from context.plugin
        const settings = this.context.plugin.settings as MCPSettings;
        
        const response = await this.aiAdapter.generateResponse(
            args.prompt,
            args.model || settings.defaultModel,
            {
                temperature: args.temperature || settings.defaultTemperature,
                maxTokens: args.maxTokens || 1000
            }
        );

        if (!response.success) {
            throw new Error(response.error || 'Completion failed');
        }

        return {
            content: response.data,
            tokens: response.tokens
        };
    }
}
