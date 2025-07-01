/**
 * Mistral Model Specifications
 * Updated June 17, 2025 with latest Mistral releases
 */

import { ModelSpec } from '../modelTypes';

export const MISTRAL_MODELS: ModelSpec[] = [
  {
    provider: 'mistral',
    name: 'Mistral Large Latest',
    apiName: 'mistral-large-latest',
    contextWindow: 128000,
    maxTokens: 8192,
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
    provider: 'mistral',
    name: 'Mistral Medium Latest',
    apiName: 'mistral-medium-latest',
    contextWindow: 128000,
    maxTokens: 8192,
    inputCostPerMillion: 0.40,
    outputCostPerMillion: 2.00,
    capabilities: {
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: true,
      supportsStreaming: true,
      supportsThinking: false
    }
  },
  {
    provider: 'mistral',
    name: 'Mistral Saba',
    apiName: 'mistral-saba-latest',
    contextWindow: 128000,
    maxTokens: 4096,
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
    provider: 'mistral',
    name: 'Magistral Medium',
    apiName: 'magistral-medium-latest',
    contextWindow: 40000,
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

export const MISTRAL_DEFAULT_MODEL = 'mistral-large-latest';