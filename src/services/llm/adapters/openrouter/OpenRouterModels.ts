/**
 * OpenRouter Model Specifications
 * OpenRouter provides access to multiple providers through a unified API
 * Updated June 17, 2025
 */

import { ModelSpec } from '../modelTypes';

// OpenRouter provides access to models from other providers
// Each model has its own specific API name in OpenRouter
export const OPENROUTER_MODELS: ModelSpec[] = [
  // OpenAI models via OpenRouter
  {
    provider: 'openrouter',
    name: 'GPT-4o',
    apiName: 'openai/gpt-4o-2024-11-20',
    contextWindow: 128000,
    maxTokens: 16384,
    inputCostPerMillion: 2.50,
    outputCostPerMillion: 10.00,
    capabilities: {
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'openrouter',
    name: 'GPT-4.1',
    apiName: 'openai/gpt-4.1',
    contextWindow: 1047576,
    maxTokens: 32768,
    inputCostPerMillion: 8.00,
    outputCostPerMillion: 8.00,
    capabilities: {
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'openrouter',
    name: 'GPT-4.1 Mini',
    apiName: 'openai/gpt-4.1-mini',
    contextWindow: 1047576,
    maxTokens: 32768,
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 1.60,
    capabilities: {
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'openrouter',
    name: 'GPT-4.1 Nano',
    apiName: 'openai/gpt-4.1-nano',
    contextWindow: 1047576,
    maxTokens: 32768,
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 0.40,
    capabilities: {
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'openrouter',
    name: 'o4 Mini',
    apiName: 'openai/o4-mini',
    contextWindow: 200000,
    maxTokens: 100000,
    inputCostPerMillion: 1.10,
    outputCostPerMillion: 4.40,
    capabilities: {
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: false,
      supportsThinking: true
    }
  },

  // Google models via OpenRouter
  {
    provider: 'openrouter',
    name: 'Gemini 2.5 Pro Experimental',
    apiName: 'google/gemini-2.5-pro-preview-06-05',
    contextWindow: 1048576,
    maxTokens: 66000,
    inputCostPerMillion: 1.25,
    outputCostPerMillion: 10.00,
    capabilities: {
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: true
    }
  },
  {
    provider: 'openrouter',
    name: 'Gemini 2.5 Flash',
    apiName: 'google/gemini-2.5-flash-preview-05-20',
    contextWindow: 1048576,
    maxTokens: 65536,
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.60,
    capabilities: {
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: false
    }
  },

  // Anthropic models via OpenRouter
  {
    provider: 'openrouter',
    name: 'Claude 3.5 Haiku',
    apiName: 'anthropic/claude-3-5-haiku',
    contextWindow: 200000,
    maxTokens: 8192,
    inputCostPerMillion: 0.80,
    outputCostPerMillion: 4.00,
    capabilities: {
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'openrouter',
    name: 'Claude 4 Opus',
    apiName: 'anthropic/claude-opus-4',
    contextWindow: 200000,
    maxTokens: 32000,
    inputCostPerMillion: 15.00,
    outputCostPerMillion: 75.00,
    capabilities: {
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'openrouter',
    name: 'Claude 4 Sonnet',
    apiName: 'anthropic/claude-sonnet-4',
    contextWindow: 200000,
    maxTokens: 64000,
    inputCostPerMillion: 3.00,
    outputCostPerMillion: 15.00,
    capabilities: {
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: false
    }
  },

  // Mistral models via OpenRouter
  {
    provider: 'openrouter',
    name: 'Mistral Large',
    apiName: 'mistralai/mistral-large-2411',
    contextWindow: 131072,
    maxTokens: 131072,
    inputCostPerMillion: 2.00,
    outputCostPerMillion: 6.00,
    capabilities: {
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'openrouter',
    name: 'Mistral Medium',
    apiName: 'mistralai/magistral-medium-2506',
    contextWindow: 40960,
    maxTokens: 40000,
    inputCostPerMillion: 2.00,
    outputCostPerMillion: 5.00,
    capabilities: {
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'openrouter',
    name: 'Mistral Saba',
    apiName: 'mistralai/mistral-saba',
    contextWindow: 32768,
    maxTokens: 32768,
    inputCostPerMillion: 0.20,
    outputCostPerMillion: 0.60,
    capabilities: {
      supportsJSON: false,
      supportsImages: true,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'openrouter',
    name: 'Magistral Medium',
    apiName: 'mistralai/magistral-medium-2506',
    contextWindow: 40960,
    maxTokens: 40000,
    inputCostPerMillion: 2.00,
    outputCostPerMillion: 5.00,
    capabilities: {
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: true,
      supportsThinking: true
    }
  }
];

export const OPENROUTER_DEFAULT_MODEL = 'anthropic/claude-sonnet-4';