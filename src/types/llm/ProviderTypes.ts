/**
 * LLM Provider Configuration Types
 * Extracted from types.ts for better organization and maintainability
 */

/**
 * Model configuration with description
 */
export interface ModelConfig {
  description?: string; // User-defined description of when to use this model
}

/**
 * LLM provider configuration
 */
export interface LLMProviderConfig {
  apiKey: string;
  userDescription?: string;
  enabled: boolean;
  models?: { [modelId: string]: ModelConfig }; // Model-specific configurations
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
      userDescription: 'Versatile models for most tasks with good balance of speed and quality',
      enabled: false
    },
    anthropic: {
      apiKey: '',
      userDescription: 'Excellent for reasoning, analysis, and long-form writing',
      enabled: false
    },
    google: {
      apiKey: '',
      userDescription: 'Latest Gemini models with strong multimodal capabilities',
      enabled: false
    },
    mistral: {
      apiKey: '',
      userDescription: 'European models with strong coding and multilingual support',
      enabled: false
    },
    groq: {
      apiKey: '',
      userDescription: 'Ultra-fast inference speeds for quick responses',
      enabled: false
    },
    openrouter: {
      apiKey: '',
      userDescription: 'Access to 400+ models from multiple providers in one API',
      enabled: false
    },
    requesty: {
      apiKey: '',
      userDescription: 'Premium model access with cost optimization',
      enabled: false
    },
    perplexity: {
      apiKey: '',
      userDescription: 'Web search-enabled models with real-time information and citations',
      enabled: false
    },
    ollama: {
      apiKey: 'http://127.0.0.1:11434',
      userDescription: 'Local LLM execution with complete privacy and no API costs',
      enabled: false
    }
  },
  defaultModel: {
    provider: 'openai',
    model: 'gpt-4o'
  }
};