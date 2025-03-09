import { BaseTool, IToolMetadata } from '../BaseTool';
import { AIProvider, AIModelMap } from '../../ai/models';
import { MCPSettings } from '../../types';
import { IAIAdapter } from '../../ai/interfaces/IAIAdapter';
import { IToolContext } from '../interfaces/ToolInterfaces';

/**
 * Tool for generating AI completions
 * Uses dependency injection for AI adapter
 */
export class CompletionToolDI extends BaseTool {
    /**
     * Creates a new CompletionToolDI
     * @param context Tool context
     * @param aiAdapter AI adapter for generating completions
     */
    constructor(
        // Use type casting to work around the type mismatch
        context: any,
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

    async execute(args: any) {
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
