/**
 * Requesty Model Specifications
 * Requesty provides access to multiple providers through a unified API
 * Updated June 17, 2025
 */

import { ModelSpec } from '../modelTypes';

// Requesty provides access to models from other providers
// Each model has its own specific API name in Requesty
export const REQUESTY_MODELS: ModelSpec[] = [
  // OpenAI models via Requesty
  {
    provider: 'requesty',
    name: 'GPT-4o',
    apiName: 'gpt-4o',
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
    provider: 'requesty',
    name: 'GPT-4.1',
    apiName: 'gpt-4.1',
    contextWindow: 1047576,
    maxTokens: 32768,
    inputCostPerMillion: 2.00,
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
    provider: 'requesty',
    name: 'GPT-4.1 Mini',
    apiName: 'gpt-4.1-mini',
    contextWindow: 1047576,
    maxTokens: 32768,
    inputCostPerMillion: 0.40,
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
    provider: 'requesty',
    name: 'GPT-4.1 Nano',
    apiName: 'gpt-4.1-nano',
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
    provider: 'requesty',
    name: 'o3',
    apiName: 'o3',
    contextWindow: 200000,
    maxTokens: 100000,
    inputCostPerMillion: 2.00,
    outputCostPerMillion: 8.00,
    capabilities: {
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: false,
      supportsThinking: true
    }
  },
  {
    provider: 'requesty',
    name: 'o3 Pro',
    apiName: 'o3-pro',
    contextWindow: 200000,
    maxTokens: 100000,
    inputCostPerMillion: 20.00,
    outputCostPerMillion: 80.00,
    capabilities: {
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: false,
      supportsThinking: true
    }
  },
  {
    provider: 'requesty',
    name: 'o4 Mini',
    apiName: 'o4-mini',
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

  // Google models via Requesty
  {
    provider: 'requesty',
    name: 'Gemini 2.5 Pro Experimental',
    apiName: 'gemini-2.5-pro-preview-06-05',
    contextWindow: 1048576,
    maxTokens: 65535,
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
    provider: 'requesty',
    name: 'Gemini 2.5 Flash',
    apiName: 'gemini-2.5-flash-preview-05-20',
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

  // Anthropic models via Requesty
  {
    provider: 'requesty',
    name: 'Claude 3.5 Haiku',
    apiName: 'claude-3-5-haiku-20241022',
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
    provider: 'requesty',
    name: 'Claude 4 Opus',
    apiName: 'claude-opus-4-20250514',
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
    provider: 'requesty',
    name: 'Claude 4 Sonnet',
    apiName: 'claude-sonnet-4-20250514',
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

  // Mistral models via Requesty
  {
    provider: 'requesty',
    name: 'Mistral Large',
    apiName: 'mistral-large-latest',
    contextWindow: 131000,
    maxTokens: 130000,
    inputCostPerMillion: 2.00,
    outputCostPerMillion: 6.00,
    capabilities: {
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: false
    }
  }
];

export const REQUESTY_DEFAULT_MODEL = 'claude-sonnet-4-20250514';