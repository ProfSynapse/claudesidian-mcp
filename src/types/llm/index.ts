/**
 * LLM-related types export barrel
 * Centralizes all LLM provider and embedding type exports
 */

export type {
  ModelConfig,
  LLMProviderConfig,
  DefaultModelSettings,
  LLMProviderSettings
} from './ProviderTypes';

export {
  DEFAULT_LLM_PROVIDER_SETTINGS
} from './ProviderTypes';

// Note: EmbeddingTypes removed in simplify-search-architecture
// Memory settings now handled by simplified JSON-based memory system