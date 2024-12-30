import { Plugin } from 'obsidian';
import { BridgeMCPSettings, MCPSettings, DEFAULT_SETTINGS } from './types';
import { join } from 'path';

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
        
        // Ensure paths are relative to rootPath
        this.updateRelativePaths();
        
        console.log('Settings: Settings loaded', this.settings);
    }

    private updateRelativePaths() {
        const { rootPath } = this.settings;
        this.settings.memoryPath = join(rootPath, 'memories');
        this.settings.indexPath = join(rootPath, 'index.md');
        this.settings.memoryFolderPath = join(rootPath, 'memories');
        this.settings.reasoningFolderPath = join(rootPath, 'reasoning');
    }

    async saveSettings() {
        this.updateRelativePaths();
        console.log('Settings: Saving settings', this.settings);
        await this.plugin.saveData(this.settings);
        console.log('Settings: Settings saved');
    }
}

// Re-export types and constants from types.ts
export type { BridgeMCPSettings, MCPSettings };
export { DEFAULT_SETTINGS };