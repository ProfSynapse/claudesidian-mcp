import { Plugin } from 'obsidian';
import { BridgeMCPSettings, MCPSettings, DEFAULT_SETTINGS } from './types';

export class Settings {
    private plugin: Plugin;
    settings: MCPSettings;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.settings = DEFAULT_SETTINGS;
    }

    async loadSettings() {
        console.log('Settings: Loading settings');
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData());
        console.log('Settings: Settings loaded', this.settings);
    }

    async saveSettings() {
        console.log('Settings: Saving settings', this.settings);
        await this.plugin.saveData(this.settings);
        console.log('Settings: Settings saved');
    }
}

// Re-export types and constants from types.ts
export type { BridgeMCPSettings, MCPSettings };
export { DEFAULT_SETTINGS };