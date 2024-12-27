import { RequestUrlResponse } from 'obsidian';
import { AIProvider, AIModel, AIModelMap } from './models';

export interface AIResponseOptions {
    temperature?: number;
    maxTokens?: number;
    rawResponse?: boolean;
    selectedText?: string;
    query?: string;  // Add query parameter
    content?: string;  // Add content parameter for Claude's prompt
    action?: string;  // Add action parameter
}

export interface TokenCount {
    input: number;
    output: number;
    total: number;
}

export interface APIResponse<T = unknown> {
    success: boolean;
    data: T;
    tokens?: TokenCount;
    error?: string;
}

export abstract class BaseAdapter {
    protected apiKey: string = '';
    protected models: AIModel[] = [];

    constructor() {
        this.models = AIModelMap[this.getProviderType()];
    }

    abstract configure(config: Record<string, unknown>): void;
    
    protected abstract makeApiRequest(params: {
        model: string;
        prompt: string;
        temperature: number;
        maxTokens: number;
        rawResponse?: boolean;
        selectedText?: string;
        query?: string;  // Add query parameter
        isTest?: boolean;
    }): Promise<RequestUrlResponse>;

    protected abstract extractContentFromResponse(response: RequestUrlResponse): string;
    protected abstract extractTokenCounts(response: RequestUrlResponse): TokenCount;
    abstract getProviderType(): AIProvider;

    public setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
    }

    public getApiKey(): string {
        return this.apiKey;
    }

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
}
