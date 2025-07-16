/**
 * Main types export barrel
 * Provides a clean interface for importing types throughout the application
 * Organized by domain for better maintainability
 */

// LLM-related types
export type {
  ModelConfig,
  LLMProviderConfig,
  DefaultModelSettings,
  LLMProviderSettings,
  MemorySettings,
  EmbeddingProvider
} from './llm';

export {
  DEFAULT_LLM_PROVIDER_SETTINGS,
  DEFAULT_MEMORY_SETTINGS
} from './llm';

// MCP protocol types
export type {
  ModeCall,
  CommonParameters,
  CommonResult,
  ModeCallResult,
  CustomPrompt,
  CustomPromptsSettings,
  ServerStatus,
  IMCPServer,
  MutualTLSOptions,
  ServerState
} from './mcp';

export {
  DEFAULT_CUSTOM_PROMPTS_SETTINGS
} from './mcp';

// Search and memory types
export type {
  EmbeddingRecord,
  MemoryQueryParams,
  MemoryQueryResult,
  MemoryUsageStats
} from './search';

// Plugin configuration types
export type {
  MCPSettings
} from './plugin';

// Common/shared types
export type {
  IVaultManager,
  NoteInfo,
  FolderInfo,
  WorkspaceSessionInfo,
  WorkspaceStateInfo,
  EventData,
  EventSubscriber
} from './common';

// Create default settings object
import { DEFAULT_MEMORY_SETTINGS } from './llm';
import { DEFAULT_CUSTOM_PROMPTS_SETTINGS } from './mcp';
import { DEFAULT_LLM_PROVIDER_SETTINGS } from './llm';
import { MCPSettings } from './plugin';

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: MCPSettings = {
  enabledVault: true,
  configFilePath: undefined,
  memory: DEFAULT_MEMORY_SETTINGS,
  customPrompts: DEFAULT_CUSTOM_PROMPTS_SETTINGS,
  llmProviders: DEFAULT_LLM_PROVIDER_SETTINGS,
  lastUpdateVersion: undefined,
  lastUpdateDate: undefined,
  availableUpdateVersion: undefined,
  lastUpdateCheckDate: undefined
};

// Extend Obsidian App interface (module augmentation)
declare module 'obsidian' {
  interface App {
    commands: {
      listCommands(): Command[];
      executeCommandById(id: string): Promise<void>;
      commands: { [id: string]: Command };
    };
    plugins: {
      getPlugin(id: string): any;
      enablePlugin(id: string): Promise<void>;
      disablePlugin(id: string): Promise<void>;
      plugins: { [id: string]: any };
    };
  }
}