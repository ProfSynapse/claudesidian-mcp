import { Plugin } from 'obsidian';
import { MCPSettings, DEFAULT_SETTINGS } from './types';

/**
 * Settings manager
 * Handles loading and saving plugin settings
 */
export class Settings {
    private plugin: Plugin;
    settings: MCPSettings;

    /**
     * Create a new settings manager
     * @param plugin Plugin instance
     */
    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.settings = DEFAULT_SETTINGS;
    }

    /**
     * Load settings from plugin data
     */
    async loadSettings() {
        const loadedData = await this.plugin.loadData();
        
        // Start with default settings (includes memory)
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
        
        // If we have loaded data, merge it properly
        if (loadedData) {
            // Shallow copy top-level properties except memory and llmProviders
            const { memory, llmProviders, ...otherSettings } = loadedData;
            Object.assign(this.settings, otherSettings);
            
            // Deep merge memory settings to ensure all required properties exist
            if (memory && DEFAULT_SETTINGS.memory) {
                this.settings.memory = {
                    ...DEFAULT_SETTINGS.memory,
                    ...memory,
                    // Ensure providerSettings exists with all default providers
                    providerSettings: {
                        ...DEFAULT_SETTINGS.memory.providerSettings,
                        ...(memory.providerSettings || {})
                    }
                };
            }

            // Deep merge LLM provider settings to ensure all required properties exist
            if (llmProviders && DEFAULT_SETTINGS.llmProviders) {
                this.settings.llmProviders = {
                    ...DEFAULT_SETTINGS.llmProviders,
                    ...llmProviders,
                    // Ensure providers exists with all default providers
                    providers: {
                        ...DEFAULT_SETTINGS.llmProviders.providers,
                        ...(llmProviders.providers || {})
                    }
                };
            }
        }
    }

    /**
     * Save settings to plugin data
     */
    async saveSettings() {
        await this.plugin.saveData(this.settings);
    }
}

// Re-export types and constants from types.ts
export type { MCPSettings };
export { DEFAULT_SETTINGS };