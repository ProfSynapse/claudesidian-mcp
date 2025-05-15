import { EventTypes } from "../core/types";

/**
 * Defines the structure for the plugin's settings.
 * Each key represents a setting category or specific setting value.
 * This interface should be updated as new settings are added.
 */
export interface ChatsidianSettings {
  // Example General Settings
  general: {
    defaultModel: string;
    autoLoadBCPs: string[]; // Domains of BCPs to load on startup
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };

  // Example Chat Settings
  chat: {
    showWelcomeMessage: boolean;
    streamingMode: 'char' | 'word' | 'line'; // Example streaming preference
  };

  // Example MCP Settings
  mcp: {
    requestTimeoutMs: number;
    // Potentially store server configurations here if not managed elsewhere
  };

  // Example BCP-Specific Settings (using a nested structure)
  bcpSettings: {
    [bcpDomain: string]: Record<string, any>; // Allow arbitrary settings per BCP
    // Example:
    // Notes?: { defaultDateFormat: string; };
    // Vault?: { searchResultLimit: number; };
  };

  // Add other setting categories as needed
  // security: { ... };
}

/**
 * Provides default values for the plugin settings.
 * Used when initializing settings for the first time or resetting.
 */
export const DEFAULT_SETTINGS: ChatsidianSettings = {
  general: {
    defaultModel: 'claude-3-opus', // Example default
    autoLoadBCPs: ['Notes', 'Vault'], // Example default BCPs
    logLevel: 'info',
  },
  chat: {
    showWelcomeMessage: true,
    streamingMode: 'char',
  },
  mcp: {
    requestTimeoutMs: 30000, // 30 seconds
  },
  bcpSettings: {}, // Start with no BCP-specific settings
};

/**
 * Defines the specific event types related to settings operations.
 * Extends the base EventTypes.
 */
export interface SettingsEventTypes extends EventTypes {
  /**
   * Emitted when one or more settings have been changed and saved.
   * The payload contains the complete, updated settings object.
   */
  'settings:changed': { newSettings: ChatsidianSettings };

  /**
   * Emitted when there's an error loading or saving settings.
   */
  'settings:error': { error: Error; operation: 'load' | 'save' };
}
