import { AIProvider, AIResponse, AIResponseOptions } from '../models';

/**
 * Interface for token count information
 */
export interface TokenCount {
    input: number;
    output: number;
    total: number;
}

/**
 * Interface for API response
 */
export interface APIResponse<T = unknown> {
    success: boolean;
    data: T;
    tokens?: TokenCount;
    error?: string;
}

/**
 * Interface for AI adapters
 * Follows Single Responsibility Principle by focusing only on AI model interactions
 */
export interface IAIAdapter {
    /**
     * Configures the adapter with provider-specific settings
     * @param config Configuration object
     */
    configure(config: Record<string, unknown>): void;
    
    /**
     * Sets the API key for the adapter
     * @param apiKey API key
     */
    setApiKey(apiKey: string): void;
    
    /**
     * Gets the current API key
     * @returns The API key
     */
    getApiKey(): string;
    
    /**
     * Generates a response from the AI model
     * @param prompt Prompt to send to the model
     * @param modelApiName API name of the model to use
     * @param options Optional settings for response generation
     * @returns The AI response
     */
    generateResponse(
        prompt: string,
        modelApiName: string,
        options?: AIResponseOptions
    ): Promise<APIResponse<string>>;
    
    /**
     * Gets the provider type for this adapter
     * @returns The AI provider type
     */
    getProviderType(): AIProvider;
}
