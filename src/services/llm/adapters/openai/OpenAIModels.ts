/**
 * OpenAI Model Specifications
 * Updated August 10, 2025 with GPT-5 model family
 */

import { ModelSpec } from '../modelTypes';

export const OPENAI_MODELS: ModelSpec[] = [
  // GPT-5 model family (latest flagship models)
  {
    provider: 'openai',
    name: 'GPT-5',
    apiName: 'gpt-5',
    contextWindow: 400000,
    maxTokens: 128000,
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
    provider: 'openai',
    name: 'GPT-5 Mini',
    apiName: 'gpt-5-mini',
    contextWindow: 400000,
    maxTokens: 128000,
    inputCostPerMillion: 0.25,
    outputCostPerMillion: 2.00,
    capabilities: {
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: true
    }
  },
  {
    provider: 'openai',
    name: 'GPT-5 Nano',
    apiName: 'gpt-5-nano',
    contextWindow: 400000,
    maxTokens: 128000,
    inputCostPerMillion: 0.05,
    outputCostPerMillion: 0.40,
    capabilities: {
      supportsJSON: true,
      supportsImages: true,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: true
    }
  },

  {
    provider: 'openai',
    name: 'GPT-4o',
    apiName: 'gpt-4o-2024-11-20',
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

  // GPT-4.1 models
  {
    provider: 'openai',
    name: 'GPT-4.1',
    apiName: 'gpt-4.1-2025-04-14',
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
    provider: 'openai',
    name: 'GPT-4.1 Mini',
    apiName: 'gpt-4.1-mini-2025-04-14',
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
    provider: 'openai',
    name: 'GPT-4.1 Nano',
    apiName: 'gpt-4.1-nano-2025-04-14',
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
  }

  // Note: o3/o4 reasoning models removed due to incompatible API (requires max_completion_tokens)
  // These models use a different parameter structure and would need special handling
];

export const OPENAI_DEFAULT_MODEL = 'gpt-5';