import { MemorySettings } from '../../types';
import { Settings } from '../../settings';
import { App } from 'obsidian';

/**
 * Base interface for memory settings tab components
 */
export interface IMemorySettingsTab {
    /**
     * Display the tab content
     * 
     * @param containerEl Container to render content in
     */
    display(containerEl: HTMLElement): void;
    
    /**
     * Update settings
     * 
     * @param newSettings Updated memory settings
     */
    updateSettings(newSettings: Partial<MemorySettings>): void;
}

/**
 * Base class for memory settings tab components
 */
export abstract class BaseSettingsTab implements IMemorySettingsTab {
    protected settings: MemorySettings;
    protected settingsManager: Settings;
    protected app: App;
    
    /**
     * Create a new settings tab component
     * 
     * @param settings Memory settings
     * @param settingsManager Settings manager
     * @param app Obsidian app instance
     */
    constructor(settings: MemorySettings, settingsManager: Settings, app: App) {
        this.settings = settings;
        this.settingsManager = settingsManager;
        this.app = app;
    }
    
    /**
     * Display the tab content
     * 
     * @param containerEl Container to render content in
     */
    abstract display(containerEl: HTMLElement): void;
    
    /**
     * Update settings with new values
     * 
     * @param newSettings Updated memory settings
     */
    updateSettings(newSettings: Partial<MemorySettings>): void {
        this.settings = { ...this.settings, ...newSettings };
    }
    
    /**
     * Save settings to the settings manager
     */
    protected async saveSettings(): Promise<void> {
        this.settingsManager.settings.memory = this.settings;
        await this.settingsManager.saveSettings();
        
        // Get plugin reference to trigger embedding strategy update
        const plugin = window.app.plugins.plugins['claudesidian-mcp'];
        if (plugin && typeof plugin.initializeEmbeddingStrategy === 'function') {
            plugin.initializeEmbeddingStrategy();
        }
    }
}