import { RequestUrlResponse } from 'obsidian';
import { AIProvider, AIModelMap, AIResponseOptions } from '../models';
import { CONFIG } from '../../config';
import { IAIAdapter, APIResponse, TokenCount } from '../interfaces/IAIAdapter';
import { IHttpClient } from '../interfaces/IHttpClient';

/**
 * Adapter for OpenRouter API
 * Implements IAIAdapter interface
 */
export class OpenRouterAdapter implements IAIAdapter {
    private apiKey: string = '';
    private models = AIModelMap[AIProvider.OpenRouter];
    
    /**
     * Creates a new OpenRouterAdapter
     * @param httpClient HTTP client for making API requests
     */
    constructor(private httpClient: IHttpClient) {}
    
    /**
     * Configures the adapter with provider-specific settings
     * @param config Configuration object
     */
    public configure(config: Record<string, unknown>): void {
        if (typeof config.apiKey === 'string') {
            this.setApiKey(config.apiKey);
        }
    }
    
    /**
     * Sets the API key for the adapter
     * @param apiKey API key
     */
    public setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
    }
    
    /**
     * Gets the current API key
     * @returns The API key
     */
    public getApiKey(): string {
        return this.apiKey;
    }
    
    /**
     * Generates a response from the AI model
     * @param prompt Prompt to send to the model
     * @param modelApiName API name of the model to use
     * @param options Optional settings for response generation
     * @returns The AI response
     */
    public async generateResponse(
        prompt: string,
        modelApiName: string,
        options?: AIResponseOptions
    ): Promise<APIResponse<string>> {
        try {
            const temperature = options?.temperature ?? 0.7;
            const maxTokens = options?.maxTokens ?? 1000;
            
            // Extract content from Claude's response format
            const promptContent = options?.action && options?.content ? 
                `${options.action}: ${options.content}` : 
                prompt;

            const response = await this.makeApiRequest({
                model: modelApiName,
                prompt: promptContent,
                temperature,
                maxTokens,
                rawResponse: options?.rawResponse,
                selectedText: options?.selectedText || '',
                query: options?.query || '',
                isTest: false
            });

            const content = this.extractContentFromResponse(response);
            const tokens = this.extractTokenCounts(response);

            return { 
                success: true, 
                data: content,
                tokens
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: ''
            };
        }
    }
    
    /**
     * Gets the provider type for this adapter
     * @returns The AI provider type
     */
    public getProviderType(): AIProvider {
        return AIProvider.OpenRouter;
    }
    
    /**
     * Makes an API request to OpenRouter
     * @param params Request parameters
     * @returns The API response
     */
    private async makeApiRequest(params: {
        model: string;
        prompt: string;
        temperature: number;
        maxTokens: number;
        rawResponse?: boolean;
        selectedText?: string;
        query?: string;
        isTest?: boolean;
    }): Promise<RequestUrlResponse> {
        const messages = params.isTest ? 
            [{ role: 'user', content: params.prompt }] :
            [
                {
                    role: 'system',
                    content: CONFIG.PROMPTS.SYSTEM
                },
                {
                    role: 'user',
                    content: params.prompt
                }
            ];

        return await this.httpClient.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: params.model,
                messages: messages,
                temperature: params.temperature,
                max_tokens: params.maxTokens,
                stream: false
            },
            {
                'Authorization': `Bearer ${this.apiKey}`,
                'HTTP-Referer': CONFIG.REFERRER,
                'X-Title': CONFIG.APP_NAME
            }
        );
    }
    
    /**
     * Extracts content from the API response
     * @param response API response
     * @returns The extracted content
     */
    private extractContentFromResponse(response: RequestUrlResponse): string {
        if (!response.json?.choices?.[0]?.message?.content) {
            throw new Error('Invalid response format from OpenRouter API');
        }
        return response.json.choices[0].message.content;
    }
    
    /**
     * Extracts token counts from the API response
     * @param response API response
     * @returns The token counts
     */
    private extractTokenCounts(response: RequestUrlResponse): TokenCount {
        const usage = response.json?.usage;
        return {
            input: usage?.prompt_tokens || 0,
            output: usage?.completion_tokens || 0,
            total: usage?.total_tokens || 0
        };
    }
}
