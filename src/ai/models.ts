/**
 * Defines the available AI providers
 */
export enum AIProvider {
    OpenRouter = 'openrouter'
}

/**
 * Structure of AI response
 */
export interface AIResponse {
    /** Whether the request was successful */
    success: boolean;
    /** Response data if successful */
    data?: unknown;
    /** Error message if unsuccessful */
    error?: string;
    /** Token usage information */
    tokens?: {
        input: number;
        output: number;
        total: number;
    };
}

/**
 * Options for AI response generation
 */
export interface AIResponseOptions {
    /** Skip JSON validation and return raw response */
    rawResponse?: boolean;
    /** Maximum tokens to generate */
    maxTokens?: number;
    /** Temperature for response generation */
    temperature?: number;
    /** Additional provider-specific options */
    providerOptions?: Record<string, unknown>;
    /** Selected text from the editor */
    selectedText?: string;
    /** Query parameter for search */
    query?: string;
    /** Content parameter for Claude's prompt */
    content?: string;
    /** Action parameter */
    action?: string;
}

/**
 * AI model definition
 */
export interface AIModel {
    /** Display name of the model */
    name: string;
    /** API identifier for the model */
    apiName: string;
    /** Optional model capabilities */
    capabilities?: {
        maxTokens?: number;
        supportsFunctions?: boolean;
        supportsStreaming?: boolean;
        supportsVision?: boolean;
    };
    /** Cost per million input tokens in USD */
    inputCostPer1M?: number;
    /** Cost per million output tokens in USD */
    outputCostPer1M?: number;
    /** Maximum context window size in tokens */
    contextWindow?: number;
}

/**
 * Model information organized by provider
 */
export const AIModelMap: Record<AIProvider, AIModel[]> = {
    [AIProvider.OpenRouter]: [
        {
            name: 'Claude 3.5 Haiku',
            apiName: 'anthropic/claude-3.5-haiku',
            capabilities: {
                maxTokens: 8192,
                supportsFunctions: true,
                supportsStreaming: true
            },
            inputCostPer1M: 1.00,
            outputCostPer1M: 1.00,
            contextWindow: 200000
        },
        {
            name: 'Anthropic Claude 3.7 Sonnet',
            apiName: 'anthropic/claude-3.7-sonnet',
            capabilities: {
                maxTokens: 8192,
                supportsFunctions: true,
                supportsStreaming: true,
                supportsVision: true
            },
            inputCostPer1M: 3.00,
            outputCostPer1M: 15.00,
            contextWindow: 200000
        },
        {
            name: 'Google Gemini Flash 2.0',
            apiName: 'google/gemini-2.0-flash-001',
            capabilities: {
                maxTokens: 8192,
                supportsStreaming: true
            },
            inputCostPer1M: 0.075,
            outputCostPer1M: 0.30,
            contextWindow: 1000000
        },
        {
            name: 'Gemini 2.0 Flash Thinking',
            apiName: 'google/gemini-2.0-flash-thinking-exp:free',
            capabilities: {
                maxTokens: 8192,
                supportsStreaming: true
            },
            inputCostPer1M: 0.0,
            outputCostPer1M: 0.0,
            contextWindow: 1000000
        },
        {
            name: 'Google Gemini Pro 2.0',
            apiName: 'google/gemini-2.0-pro-exp-02-05:free',
            capabilities: {
                maxTokens: 8192,
                supportsStreaming: true,
                supportsVision: true
            },
            inputCostPer1M: 1.25,
            outputCostPer1M: 5.00,
            contextWindow: 2000000
        },
        {
            name: 'OpenAI 4o',
            apiName: 'openai/gpt-4o-2024-11-20',
            capabilities: {
                maxTokens: 16000,
                supportsFunctions: true,
                supportsStreaming: true,
                supportsVision: true
            },
            inputCostPer1M: 2.50,
            outputCostPer1M: 10.00,
            contextWindow: 128000
        },
        {
            name: 'OpenAI 4o Mini',
            apiName: 'openai/gpt-4o-mini',
            capabilities: {
                maxTokens: 16000,
                supportsFunctions: true,
                supportsStreaming: true
            },
            inputCostPer1M: 0.15,
            outputCostPer1M: 0.60,
            contextWindow: 128000
        },
        {
            name: 'OpenAI o3 Mini High',
            apiName: 'openai/o3-mini-high',
            capabilities: {
                maxTokens: 66000,
                supportsFunctions: true,
                supportsStreaming: true
            },
            inputCostPer1M: 1.10,
            outputCostPer1M: 4.40,
            contextWindow: 128000
        },
        {
            name: 'OpenAI o1',
            apiName: 'openai/o1',
            capabilities: {
                maxTokens: 33000,
                supportsFunctions: true,
                supportsStreaming: true
            },
            inputCostPer1M: 15.00,
            outputCostPer1M: 60.00,
            contextWindow: 128000
        },
        {
            name: 'Perplexity Sonar',
            apiName: 'perplexity/sonar',
            capabilities: {
                maxTokens: 8000,
                supportsFunctions: true,
                supportsStreaming: true
            },
            inputCostPer1M: 1.00,
            outputCostPer1M: 1.00,
            contextWindow: 127000
        },
        {
            name: 'Perplexity Sonar Pro',
            apiName: 'perplexity/sonar-pro',
            capabilities: {
                maxTokens: 8000,
                supportsFunctions: true,
                supportsStreaming: true
            },
            inputCostPer1M: 3.00,
            outputCostPer1M: 15.00,
            contextWindow: 131000
        },
        {
            name: 'Perplexity Deep Research',
            apiName: 'perplexity/sonar-deep-research',
            capabilities: {
                maxTokens: 8000,
                supportsFunctions: true,
                supportsStreaming: true
            },
            inputCostPer1M: 2.00,
            outputCostPer1M: 8.00,
            contextWindow: 131000
        }
    ]
};

/**
 * Helper utilities for working with AI models
 */
export const AIModelUtils = {
    /**
     * Get a model by its API name
     */
    getModelByApiName(apiName: string): AIModel | undefined {
        for (const models of Object.values(AIModelMap)) {
            const model = models.find(m => m.apiName === apiName);
            if (model) return model;
        }
        return undefined;
    },

    /**
     * Get all available models for a provider
     */
    getModelsForProvider(provider: AIProvider): AIModel[] {
        return AIModelMap[provider] || [];
    },

    /**
     * Get default model for a provider
     */
    getDefaultModelForProvider(provider: AIProvider): AIModel | undefined {
        const models = AIModelMap[provider];
        return models?.[0];
    }
};
