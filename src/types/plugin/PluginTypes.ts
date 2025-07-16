/**
 * Plugin Configuration Types
 * Extracted from types.ts for better organization
 */

import { MemorySettings } from '../llm/EmbeddingTypes';
import { CustomPromptsSettings } from '../mcp/CustomPromptTypes';
import { LLMProviderSettings } from '../llm/ProviderTypes';

/**
 * Plugin settings interface
 * Includes vault access toggle and version tracking
 */
export interface MCPSettings {
  enabledVault: boolean;
  configFilePath?: string;
  memory?: MemorySettings;
  customPrompts?: CustomPromptsSettings;
  llmProviders?: LLMProviderSettings;
  lastUpdateVersion?: string;
  lastUpdateDate?: string;
  availableUpdateVersion?: string;
  lastUpdateCheckDate?: string;
}