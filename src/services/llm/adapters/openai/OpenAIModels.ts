/**
 * OpenAI Model Specifications
 * Updated October 19, 2025 - Fixed GPT-4.1 pricing
 *
 * Pricing Notes:
 * - GPT-5 family supports 90% caching discount (cached tokens: $0.125/M vs $1.25/M fresh)
 * - GPT-4.1 family supports 75% caching discount (cached tokens: $0.50/M vs $2.00/M fresh)
 * - Caching discounts are applied automatically when prompt_tokens_details.cached_tokens > 0
 * - Pricing shown here is for Standard tier; Batch API offers 50% off, Priority costs more
 *
 * Reference: https://openai.com/api/pricing/
 */

import { ModelSpec } from '../modelTypes';

export const OPENAI_MODELS: ModelSpec[] = [
  // GPT-5 model family (latest flagship models)
  {
    provider: 'openai',
    name: 'GPT-5.1',
    apiName: 'gpt-5.1-2025-11-13',
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
    inputCostPerMillion: 2.00, // Fixed: was 8.00, corrected to match OpenAI pricing
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
    inputCostPerMillion: 0.40, // Fixed: was 0.10, corrected to match OpenAI pricing
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

export const OPENAI_DEFAULT_MODEL = 'gpt-5.1-2025-11-13';