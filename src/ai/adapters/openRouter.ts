import { requestUrl, RequestUrlResponse } from 'obsidian';
import { AIProvider } from '../models';
import { BaseAdapter, TokenCount } from '../baseAdapter';
import { CONFIG } from '../../config';

export class OpenRouterAdapter extends BaseAdapter {
    public configure(config: Record<string, unknown>): void {
        if (typeof config.apiKey === 'string') {
            this.setApiKey(config.apiKey);
        }
    }

    protected async makeApiRequest(params: {
        model: string;
        prompt: string;
        temperature: number;
        maxTokens: number;
        rawResponse?: boolean;
        selectedText?: string;
        query?: string;  // Add query parameter
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
                    content: params.prompt  // This will now contain the properly formatted action + content
                }
            ];

        return await requestUrl({
            url: 'https://openrouter.ai/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': CONFIG.REFERRER,
                'X-Title': CONFIG.APP_NAME
            },
            body: JSON.stringify({
                model: params.model,
                messages: messages,
                temperature: params.temperature,
                max_tokens: params.maxTokens,
                stream: false
            })
        });
    }

    protected extractContentFromResponse(response: RequestUrlResponse): string {
        if (!response.json?.choices?.[0]?.message?.content) {
            throw new Error('Invalid response format from OpenRouter API');
        }
        return response.json.choices[0].message.content;
    }

    protected extractTokenCounts(response: RequestUrlResponse): TokenCount {
        const usage = response.json?.usage;
        return {
            input: usage?.prompt_tokens || 0,
            output: usage?.completion_tokens || 0,
            total: usage?.total_tokens || 0
        };
    }

    public getProviderType(): AIProvider {
        return AIProvider.OpenRouter;
    }
}
