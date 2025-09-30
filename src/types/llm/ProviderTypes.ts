/**
 * LLM Provider Configuration Types
 * Extracted from types.ts for better organization and maintainability
 */

/**
 * Model configuration with enabled status and optional description
 */
export interface ModelConfig {
  enabled: boolean; // Primary field for controlling model visibility
  description?: string; // Optional user-defined description (for backwards compatibility)
}

/**
 * LLM provider configuration
 */
export interface LLMProviderConfig {
  apiKey: string;
  userDescription?: string;
  enabled: boolean;
  models?: { [modelId: string]: ModelConfig }; // Model-specific configurations
  ollamaModel?: string; // For Ollama: user-configured model name
}

/**
 * Default model selection settings
 */
export interface DefaultModelSettings {
  provider: string;
  model: string;
}

/**
 * LLM provider settings
 */
export interface LLMProviderSettings {
  providers: {
    [providerId: string]: LLMProviderConfig;
  };
  defaultModel: DefaultModelSettings;
  monthlyBudget?: number; // Monthly budget in USD for LLM usage
}

/**
 * Default LLM provider settings
 */
export const DEFAULT_LLM_PROVIDER_SETTINGS: LLMProviderSettings = {
  providers: {
    openai: {
      apiKey: '',
      enabled: false
    },
    anthropic: {
      apiKey: '',
      enabled: false
    },
    google: {
      apiKey: '',
      enabled: false
    },
    mistral: {
      apiKey: '',
      enabled: false
    },
    groq: {
      apiKey: '',
      enabled: false
    },
    openrouter: {
      apiKey: '',
      enabled: false
    },
    requesty: {
      apiKey: '',
      enabled: false
    },
    perplexity: {
      apiKey: '',
      enabled: false
    },
    ollama: {
      apiKey: 'http://127.0.0.1:11434',
      enabled: false,
      ollamaModel: '' // User must configure their installed model
    }
  },
  defaultModel: {
    provider: 'openai',
    model: 'gpt-4o'
  }
};