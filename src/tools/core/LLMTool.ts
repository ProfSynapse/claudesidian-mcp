import { BaseTool, IToolContext, IToolMetadata } from '../BaseTool';
import { OpenRouterAdapter } from '../../ai/adapters/openRouter';
import { AIProvider, AIModelMap } from '../../ai/models';
import { MCPSettings } from '../../types';

export class CompletionTool extends BaseTool {
    private adapter: OpenRouterAdapter;
    
    constructor(context: IToolContext) {
        const metadata: IToolMetadata = {
            name: 'completion',
            description: 'Generate AI completions using OpenRouter',
            version: '1.0.0'
        };

        super(context, metadata, {
            requireConfirmation: false
        });
        
        this.adapter = new OpenRouterAdapter();
        // API key will be set through configuration
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
        
        if (!this.adapter.getApiKey()) {
            this.adapter.setApiKey(settings.apiKeys[AIProvider.OpenRouter]);
        }
        
        const response = await this.adapter.generateResponse(
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
