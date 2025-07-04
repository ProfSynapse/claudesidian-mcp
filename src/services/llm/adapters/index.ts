/**
 * Adapter exports and factory functions
 * Provides unified access to all LLM providers
 */

export { BaseAdapter } from './BaseAdapter';
export * from './types';

// Provider implementations
export { OpenAIAdapter } from './openai/OpenAIAdapter';
export { GoogleAdapter } from './google/GoogleAdapter';
export { AnthropicAdapter } from './anthropic/AnthropicAdapter';
export { MistralAdapter } from './mistral/MistralAdapter';
export { OpenRouterAdapter } from './openrouter/OpenRouterAdapter';
export { RequestyAdapter } from './requesty/RequestyAdapter';
export { GroqAdapter } from './groq/GroqAdapter';
export { PerplexityAdapter } from './perplexity/PerplexityAdapter';
export { OllamaAdapter } from './ollama/OllamaAdapter';

// Model registry and cost calculation
export * from './modelTypes';
export * from './ModelRegistry';
export * from './CostCalculator';

import { BaseAdapter } from './BaseAdapter';
import { OpenAIAdapter } from './openai/OpenAIAdapter';
import { GoogleAdapter } from './google/GoogleAdapter';
import { AnthropicAdapter } from './anthropic/AnthropicAdapter';
import { MistralAdapter } from './mistral/MistralAdapter';
import { OpenRouterAdapter } from './openrouter/OpenRouterAdapter';
import { RequestyAdapter } from './requesty/RequestyAdapter';
import { GroqAdapter } from './groq/GroqAdapter';
import { PerplexityAdapter } from './perplexity/PerplexityAdapter';
import { OllamaAdapter } from './ollama/OllamaAdapter';
import { SupportedProvider, LLMProviderError } from './types';

/**
 * Factory function to create adapter instances
 * Note: This factory requires environment variables to be set for API keys
 * For direct API key injection, instantiate adapters directly
 */
export function createAdapter(provider: SupportedProvider, model?: string): BaseAdapter {
  switch (provider.toLowerCase()) {
    case 'openai':
      return new OpenAIAdapter(process.env.OPENAI_API_KEY || '');
    case 'google':
    case 'gemini':
      return new GoogleAdapter(process.env.GOOGLE_API_KEY || '', model);
    case 'anthropic':
    case 'claude':
      return new AnthropicAdapter(process.env.ANTHROPIC_API_KEY || '', model);
    case 'mistral':
      return new MistralAdapter(process.env.MISTRAL_API_KEY || '', model);
    case 'openrouter':
      return new OpenRouterAdapter(process.env.OPENROUTER_API_KEY || '', model);
    case 'requesty':
      return new RequestyAdapter(process.env.REQUESTY_API_KEY || '', model);
    case 'groq':
      return new GroqAdapter(process.env.GROQ_API_KEY || '', model);
    case 'perplexity':
      return new PerplexityAdapter(process.env.PERPLEXITY_API_KEY || '', model);
    case 'ollama':
      return new OllamaAdapter(process.env.OLLAMA_URL || 'http://127.0.0.1:11434', model);
    default:
      throw new LLMProviderError(
        `Unsupported provider: ${provider}`,
        'factory',
        'UNSUPPORTED_PROVIDER'
      );
  }
}

/**
 * Get all available providers
 */
export function getAvailableProviders(): SupportedProvider[] {
  return ['openai', 'google', 'anthropic', 'mistral', 'openrouter', 'requesty', 'groq', 'perplexity', 'ollama'];
}

/**
 * Check which providers are available (have API keys)
 */
export async function getAvailableProvidersWithKeys(): Promise<Array<{
  provider: SupportedProvider;
  available: boolean;
  error?: string;
}>> {
  const providers = getAvailableProviders();
  const providerResults: Array<{
    provider: SupportedProvider;
    available: boolean;
    error?: string;
  }> = [];

  for (const provider of providers) {
    try {
      const adapter = createAdapter(provider);
      const available = await adapter.isAvailable();
      providerResults.push({ provider, available });
    } catch (error) {
      providerResults.push({
        provider,
        available: false,
        error: (error as Error).message
      });
    }
  }

  return providerResults;
}

/**
 * Auto-select best available provider based on criteria
 */
export async function selectBestProvider(criteria?: {
  requiresThinking?: boolean;
  requiresImages?: boolean;
  requiresFunctions?: boolean;
  prefersCost?: boolean;
  prefersSpeed?: boolean;
}): Promise<BaseAdapter | null> {
  const availableProviders = await getAvailableProvidersWithKeys();
  const available = availableProviders.filter(p => p.available);

  if (available.length === 0) {
    console.warn('No LLM providers available. Please check your API keys.');
    return null;
  }

  // Score providers based on criteria
  const providerScores = available.map(({ provider }) => {
    const adapter = createAdapter(provider);
    const capabilities = adapter.getCapabilities();
    let score = 1;

    if (criteria?.requiresThinking && capabilities.supportsThinking) score += 3;
    if (criteria?.requiresImages && capabilities.supportsImages) score += 2;
    if (criteria?.requiresFunctions && capabilities.supportsFunctions) score += 1;

    // Performance preferences (subjective weights based on 2025 performance)
    const performanceScores: Record<string, number> = {
      'groq': 6,      // Ultra-fast inference
      'google': 5,    // Gemini 2.5 Flash - best performance/cost
      'anthropic': 4, // Claude 4 - best reasoning
      'openai': 3,    // GPT-4 Turbo - reliable
      'ollama': 3,    // Local models - good performance, no cost
      'mistral': 2,   // Good specialized models
      'openrouter': 1, // Good for variety
      'requesty': 1   // Good for cost optimization
    };

    score += performanceScores[provider] || 0;

    if (criteria?.prefersCost) {
      // Adjust for cost (lower cost = higher score)
      const costScores: Record<string, number> = {
        'ollama': 5,    // Free local models
        'groq': 3,      // Very competitive pricing
        'google': 3,    // Gemini Flash - best value
        'mistral': 2,   // Good pricing
        'requesty': 2,  // Cost optimization
        'openrouter': 1,
        'anthropic': 0, // More expensive
        'openai': 0     // More expensive
      };
      score += costScores[provider] || 0;
    }

    if (criteria?.prefersSpeed) {
      // Adjust for speed
      const speedScores: Record<string, number> = {
        'groq': 5,      // Ultra-fast inference (up to 750 tokens/sec)
        'ollama': 4,    // Local inference - very fast, no network latency
        'google': 3,    // Gemini Flash
        'openai': 2,    // GPT-4 Turbo
        'openrouter': 2,
        'requesty': 2,
        'anthropic': 1, // Slower but higher quality
        'mistral': 1
      };
      score += speedScores[provider] || 0;
    }

    return { provider, score };
  });

  // Sort by score and return the best
  providerScores.sort((a, b) => b.score - a.score);
  const bestResult = providerScores[0];

  if (bestResult?.provider) {
    console.log(`🎯 Auto-selected provider: ${bestResult.provider} (score: ${bestResult.score})`);
    return createAdapter(bestResult.provider);
  }

  return null;
}

/**
 * Provider comparison utility
 */
export interface ProviderComparison {
  provider: SupportedProvider;
  capabilities: ReturnType<BaseAdapter['getCapabilities']>;
  available: boolean;
  models: number;
  maxContext: number;
}

export async function compareProviders(): Promise<ProviderComparison[]> {
  const providers = getAvailableProviders();
  const comparisons: ProviderComparison[] = [];

  for (const provider of providers) {
    try {
      const adapter = createAdapter(provider);
      const available = await adapter.isAvailable();
      const capabilities = adapter.getCapabilities();
      const models = available ? (await adapter.listModels()).length : 0;

      comparisons.push({
        provider,
        capabilities,
        available,
        models,
        maxContext: capabilities.maxContextWindow
      });
    } catch (error) {
      comparisons.push({
        provider,
        capabilities: {
          supportsStreaming: false,
          supportsJSON: false,
          supportsImages: false,
          supportsFunctions: false,
          supportsThinking: false,
          maxContextWindow: 0,
          supportedFeatures: []
        },
        available: false,
        models: 0,
        maxContext: 0
      });
    }
  }

  return comparisons;
}