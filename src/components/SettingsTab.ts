import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { Settings } from '../settings';
import { ConfigModal } from './ConfigModal';

/**
 * Simplified settings tab for the plugin
 * Only includes a toggle for vault access and a config button
 */
export class SettingsTab extends PluginSettingTab {
    private settings: Settings;
    
    /**
     * Create a new settings tab
     * @param app Obsidian app instance
     * @param plugin Plugin instance
     * @param settings Settings manager
     */
    constructor(app: App, plugin: Plugin, private settingsManager: Settings) {
        super(app, plugin);
        this.settings = settingsManager;
    }
    
    /**
     * Display the settings tab
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        
        containerEl.createEl('h2', { text: 'Claudesidian MCP Settings' });
        
        // Plugin information
        containerEl.createEl('p', {
            text: 'Claudesidian MCP provides AI assistance through Model Context Protocol integration.'
        });
        
        // Vault access toggle
        new Setting(containerEl)
            .setName('Enable Claudesidian MCP')
            .setDesc('Enable or disable the entire plugin')
            .addToggle(toggle => toggle
                .setValue(this.settings.settings.enabledVault)
                .onChange(async (value) => {
                    this.settings.settings.enabledVault = value;
                    await this.settings.saveSettings();
                }));
        
        // Config modal button
        new Setting(containerEl)
            .setName('MCP Configuration')
            .setDesc('Configure MCP agents and tools')
            .addButton(button => button
                .setButtonText('Open Configuration')
                .onClick(() => {
                    new ConfigModal(this.app).open();
                }));
    }
}