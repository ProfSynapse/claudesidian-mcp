import { App, PluginSettingTab, Plugin } from 'obsidian';
import { Settings } from '../settings';
import { MemoryManagementAccordion } from './accordions';

/**
 * Memory Settings tab for the Claudesidian MCP plugin
 * Provides configuration options for memory management features
 */
export class MemorySettingsTab extends PluginSettingTab {
    private settings: Settings;
    private plugin: Plugin;
    
    /**
     * Create a new settings tab
     * @param app Obsidian app instance
     * @param plugin Plugin instance
     * @param settings Settings manager
     */
    constructor(app: App, plugin: Plugin, private settingsManager: Settings) {
        super(app, plugin);
        this.settings = settingsManager;
        this.plugin = plugin;
    }

    /**
     * Add CSS styles for the settings tab
     * @param containerEl Container element
     */
    private addStyles(containerEl: HTMLElement): void {
        const styleEl = containerEl.createEl('style');
        styleEl.textContent = `
            .mcp-section {
                margin-bottom: 1.5rem;
            }
            
            .mcp-memory-container {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 15px;
                margin-top: 10px;
            }
            
            .mcp-stats {
                padding: 10px;
                background-color: var(--background-secondary);
                border-radius: 5px;
                margin-bottom: 15px;
            }
            
            .mcp-stats-title {
                margin: 0 0 5px 0;
                color: var(--text-accent);
            }
            
            .mcp-stats-value {
                margin: 0;
                font-size: 0.9em;
            }
        `;
    }
    
    /**
     * Display the settings tab
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Memory management accordion
        new MemoryManagementAccordion(
            containerEl, 
            () => this.settings.saveSettings(),
            this.settings.settings
        );

        // Add CSS styles
        this.addStyles(containerEl);
    }
}