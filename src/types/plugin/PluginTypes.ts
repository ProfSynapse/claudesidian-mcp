/**
 * Plugin Configuration Types
 * Extracted from types.ts for better organization
 */

import { CustomPromptsSettings } from '../mcp/CustomPromptTypes';
import { LLMProviderSettings } from '../llm/ProviderTypes';

// Note: MemorySettings and ProcessedFileState removed in simplify-search-architecture
// Simple memory management now uses JSON-based storage
interface MemorySettings {
  enabled: boolean;
  providerSettings?: Record<string, any>;
  dbStoragePath?: string;
}

interface ProcessedFileState {
  filePath: string;
  lastModified: number;
  contentHash: string;
  processed: boolean;
}

/**
 * ChatView settings for experimental AI chat interface
 */
export interface ChatViewSettings {
  enabled: boolean;
  acknowledgedExperimental: boolean;
}

/**
 * Processed files data structure for file state management
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
  chatView?: ChatViewSettings;
  lastUpdateVersion?: string;
  lastUpdateDate?: string;
  availableUpdateVersion?: string;
  lastUpdateCheckDate?: string;
  processedFiles?: ProcessedFilesData;
}