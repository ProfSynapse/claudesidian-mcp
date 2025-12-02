/**
 * Context Builders - Provider-specific conversation context formatting
 *
 * This module exports all context builder related types and utilities.
 */

// Interface
export type { IContextBuilder, MessageValidationContext } from './IContextBuilder';

// Concrete builders
export { OpenAIContextBuilder } from './OpenAIContextBuilder';
export { AnthropicContextBuilder } from './AnthropicContextBuilder';
export { GoogleContextBuilder } from './GoogleContextBuilder';
export { CustomFormatContextBuilder } from './CustomFormatContextBuilder';

// Factory
export {
  getContextBuilder,
  getProviderCategory,
  isOpenAICompatible,
  isCustomFormat
} from './ContextBuilderFactory';

export type { ProviderCategory } from './ContextBuilderFactory';
