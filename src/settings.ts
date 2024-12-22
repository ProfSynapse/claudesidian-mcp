import { Plugin } from 'obsidian';

export interface BridgeMCPSettings {
    // Server Configuration
    autoStart: boolean;
    rootPath: string; // Add rootPath property
    
    // Vault Access
    allowedPaths: string[];
    
    // Tool Configuration
    enabledVault: boolean;
    enabledMemory: boolean;
    enabledReasoning: boolean;
    memoryFolderPath: string;
    reasoningFolderPath: string;
    cacheTimeout: number;
    indexPath: string;
    memoryPath: string;  
    reasoningPath: string;
}

export const DEFAULT_SETTINGS: BridgeMCPSettings = {
    autoStart: false,
    rootPath: 'bridge-mcp', // Add default value
    allowedPaths: [],
    enabledVault: true,
    enabledMemory: true,
    enabledReasoning: true,
    memoryFolderPath: '',
    reasoningFolderPath: '',
    cacheTimeout: 300,
    indexPath: 'bridge-mcp/index.md',
    memoryPath: 'bridge-mcp/memories',
    reasoningPath: 'bridge-mcp/reasoning'
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