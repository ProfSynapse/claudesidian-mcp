import { MemorySettings, PluginContext, ClaudesidianMCPPlugin } from '../../types';
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
    display(containerEl: HTMLElement): void | Promise<void>;
    
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
    protected plugin?: ClaudesidianMCPPlugin;
    protected pluginContext?: PluginContext;
    
    /**
     * Create a new settings tab component
     * 
     * @param settings Memory settings
     * @param settingsManager Settings manager
     * @param app Obsidian app instance
     * @param plugin Optional plugin instance for direct access
     */
    constructor(settings: MemorySettings, settingsManager: Settings, app: App, plugin?: ClaudesidianMCPPlugin) {
        this.settings = settings;
        this.settingsManager = settingsManager;
        this.app = app;
        this.plugin = plugin;
        this.pluginContext = plugin?.getPluginContext?.();
    }
    
    /**
     * Display the tab content
     * 
     * @param containerEl Container to render content in
     */
    abstract display(containerEl: HTMLElement): void | Promise<void>;
    
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
        
        // Use plugin instance if available, otherwise fall back to global access
        const plugin = this.plugin || (window as any).app.plugins.plugins[this.pluginContext?.pluginId || 'claudesidian-mcp'];
        if (plugin && typeof plugin.reloadConfiguration === 'function') {
            plugin.reloadConfiguration();
        }
    }
}