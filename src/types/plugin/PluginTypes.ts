/**
 * Plugin Configuration Types
 * Extracted from types.ts for better organization
 */

import { MemorySettings } from '../llm/EmbeddingTypes';
import { CustomPromptsSettings } from '../mcp/CustomPromptTypes';
import { LLMProviderSettings } from '../llm/ProviderTypes';
import { ProcessedFileState } from '../../database/services/state/ProcessedFilesStateManager';

/**
 * Processed files data structure for embedding state management
 * Stores file processing state to prevent re-processing on startup
 */
export interface ProcessedFilesData {
  version: string;
  lastUpdated: number;
  files: Record<string, ProcessedFileState>;
}

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
  processedFiles?: ProcessedFilesData;
}