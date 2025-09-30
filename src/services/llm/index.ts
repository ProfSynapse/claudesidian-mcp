/**
 * LLM Adapter Kit
 * Universal TypeScript library for interacting with multiple LLM providers
 */

// Core adapters
export { BaseAdapter } from './adapters/BaseAdapter';
export { OpenAIAdapter } from './adapters/openai/OpenAIAdapter';
export { AnthropicAdapter } from './adapters/anthropic/AnthropicAdapter';
export { GoogleAdapter } from './adapters/google/GoogleAdapter';
export { MistralAdapter } from './adapters/mistral/MistralAdapter';
export { GroqAdapter } from './adapters/groq/GroqAdapter';
export { OpenRouterAdapter } from './adapters/openrouter/OpenRouterAdapter';
export { RequestyAdapter } from './adapters/requesty/RequestyAdapter';
export { PerplexityAdapter } from './adapters/perplexity/PerplexityAdapter';

// Types
export * from './adapters/types';
export * from './adapters/modelTypes';

// Model registry and specifications
export { ModelRegistry } from './adapters/ModelRegistry';
export { OPENAI_MODELS } from './adapters/openai/OpenAIModels';
export { ANTHROPIC_MODELS } from './adapters/anthropic/anthropicModels';
export { GOOGLE_MODELS } from './adapters/google/GoogleModels';
export { MISTRAL_MODELS } from './adapters/mistral/MistralModels';
export { OPENROUTER_MODELS } from './adapters/openrouter/openRouterModels';
export { REQUESTY_MODELS } from './adapters/requesty/RequestyModels';

// Cost calculation
export { CostCalculator, TokenCounter, CostAnalyzer } from './adapters/CostCalculator';

// Utilities
export { Logger } from './utils/Logger';
export { RetryManager } from './utils/RetryManager';
export { ValidationUtils } from './utils/ValidationUtils';
export { ConfigManager } from './utils/ConfigManager';
export { BaseCache, CacheManager, LRUCache, FileCache } from './utils/CacheManager';

// Re-export commonly used types for convenience
export type {
  LLMResponse,
  GenerateOptions,
  StreamChunk,
  ModelInfo,
  ProviderCapabilities,
  TokenUsage,
  CostDetails,
  LLMProviderError,
} from './adapters/types';

export type { ModelSpec } from './adapters/modelTypes';

// High-level services
export { LLMProviderManager } from './providers';
export { LLMService } from './core';
export { LLMValidationService } from './validation';
export type { ModelWithProvider, ProviderInfo } from './providers';
export type { LLMExecutionOptions, LLMExecutionResult } from './core';