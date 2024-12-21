import { Plugin } from 'obsidian';

export interface BridgeMCPSettings {
    // Server Configuration
    autoStart: boolean;
    debugMode: boolean;
    
    // Vault Access
    allowedPaths: string[];
    
    // Security & Performance
    requireConfirmation: boolean;
    
    // Tool Configuration
    enabledVault: boolean;
    enabledMemory: boolean;
    enabledReasoning: boolean;
    memoryFolderPath: string;
    reasoningFolderPath: string;
    cacheTimeout: number;
}

export const DEFAULT_SETTINGS: BridgeMCPSettings = {
    autoStart: false,
    debugMode: false,
    allowedPaths: [],
    requireConfirmation: true,
    enabledVault: true,
    enabledMemory: true,
    enabledReasoning: true,
    memoryFolderPath: '',
    reasoningFolderPath: '',
    cacheTimeout: 300
};

export class Settings {
    private plugin: Plugin;
    settings: BridgeMCPSettings;

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