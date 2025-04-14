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
        console.log('Settings: Loading settings');
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData());
        console.log('Settings: Settings loaded', this.settings);
    }

    /**
     * Save settings to plugin data
     */
    async saveSettings() {
        console.log('Settings: Saving settings', this.settings);
        await this.plugin.saveData(this.settings);
        console.log('Settings: Settings saved');
    }
}

// Re-export types and constants from types.ts
export type { MCPSettings };
export { DEFAULT_SETTINGS };