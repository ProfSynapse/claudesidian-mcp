/**
 * ContextBuilderFactory - Creates the appropriate context builder for a provider
 *
 * Factory pattern implementation that returns the correct IContextBuilder
 * based on the provider name. Centralizes provider-to-builder mapping.
 *
 * Follows Open/Closed Principle - adding new providers only requires:
 * 1. Creating a new builder class
 * 2. Adding it to this factory's mapping
 */

import { IContextBuilder } from './IContextBuilder';
import { OpenAIContextBuilder } from './OpenAIContextBuilder';
import { AnthropicContextBuilder } from './AnthropicContextBuilder';
import { GoogleContextBuilder } from './GoogleContextBuilder';
import { CustomFormatContextBuilder } from './CustomFormatContextBuilder';

// Singleton instances for each builder (they're stateless)
const openAIBuilder = new OpenAIContextBuilder();
const anthropicBuilder = new AnthropicContextBuilder();
const googleBuilder = new GoogleContextBuilder();
const customFormatBuilder = new CustomFormatContextBuilder();

/**
 * Provider categories for documentation/debugging
 */
export type ProviderCategory = 'openai-compatible' | 'anthropic' | 'google' | 'custom-format';

/**
 * Get the appropriate context builder for a provider
 *
 * @param provider - Provider name (e.g., 'openai', 'anthropic', 'google', 'openrouter')
 * @returns The context builder for that provider
 */
export function getContextBuilder(provider: string): IContextBuilder {
  const normalizedProvider = provider.toLowerCase();

  switch (normalizedProvider) {
    // Anthropic
    case 'anthropic':
      return anthropicBuilder;

    // Google
    case 'google':
      return googleBuilder;

    // Custom format (fine-tuned local LLMs)
    case 'lmstudio':
    case 'ollama':
    case 'webllm':
      return customFormatBuilder;

    // OpenAI-compatible (default)
    case 'openai':
    case 'openrouter':
    case 'groq':
    case 'mistral':
    case 'requesty':
    case 'perplexity':
    default:
      return openAIBuilder;
  }
}

/**
 * Get the provider category for a given provider
 * Useful for debugging and logging
 *
 * @param provider - Provider name
 * @returns Category string
 */
export function getProviderCategory(provider: string): ProviderCategory {
  const normalizedProvider = provider.toLowerCase();

  switch (normalizedProvider) {
    case 'anthropic':
      return 'anthropic';
    case 'google':
      return 'google';
    case 'lmstudio':
    case 'ollama':
    case 'webllm':
      return 'custom-format';
    default:
      return 'openai-compatible';
  }
}

/**
 * Check if a provider uses a specific builder type
 */
export function isOpenAICompatible(provider: string): boolean {
  return getProviderCategory(provider) === 'openai-compatible';
}

export function isCustomFormat(provider: string): boolean {
  return getProviderCategory(provider) === 'custom-format';
}
