/**
 * Anthropic Model Specifications
 * Updated June 17, 2025 with latest Claude releases
 */

import { ModelSpec } from '../modelTypes';

export const ANTHROPIC_MODELS: ModelSpec[] = [
  // Claude models
  {
    provider: 'anthropic',
    name: 'Claude 3.5 Haiku',
    apiName: 'claude-3-5-haiku-latest',
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

  // Claude 4 models
  {
    provider: 'anthropic',
    name: 'Claude 4 Opus',
    apiName: 'claude-opus-4-0',
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
    provider: 'anthropic',
    name: 'Claude 4 Sonnet',
    apiName: 'claude-sonnet-4-0',
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
  }
];

export const ANTHROPIC_DEFAULT_MODEL = 'claude-3-5-haiku-latest';