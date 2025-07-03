/**
 * OpenAI Model Specifications
 * Updated June 17, 2025 with latest model releases
 */

import { ModelSpec } from '../modelTypes';

export const OPENAI_MODELS: ModelSpec[] = [
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
  },

  // o3 models (reasoning)
  {
    provider: 'openai',
    name: 'o3',
    apiName: 'o3-2025-04-16',
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
    provider: 'openai',
    name: 'o3 Pro',
    apiName: 'o3-pro-2025-06-10',
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

  // o3 deep research models
  {
    provider: 'openai',
    name: 'o3 Deep Research',
    apiName: 'o3-deep-research-2025-06-26',
    contextWindow: 200000,
    maxTokens: 100000,
    inputCostPerMillion: 10.00,
    outputCostPerMillion: 40.00,
    capabilities: {
      supportsJSON: false,
      supportsImages: true,
      supportsFunctions: false,
      supportsStreaming: true,
      supportsThinking: true
    }
  },

  // o4 models (reasoning)
  {
    provider: 'openai',
    name: 'o4 Mini',
    apiName: 'o4-mini-2025-04-16',
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
  {
    provider: 'openai',
    name: 'o4 Mini Deep Research',
    apiName: 'o4-mini-deep-research-2025-06-26',
    contextWindow: 200000,
    maxTokens: 100000,
    inputCostPerMillion: 2.00,
    outputCostPerMillion: 8.00,
    capabilities: {
      supportsJSON: false,
      supportsImages: true,
      supportsFunctions: false,
      supportsStreaming: true,
      supportsThinking: true
    }
  }
];

export const OPENAI_DEFAULT_MODEL = 'gpt-4.1-2025-04-14';