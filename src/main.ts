import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { MCPConnector } from './connector';
import { Settings } from './settings';
import { SettingsTab } from './components/SettingsTab';
import { ConfigModal } from './components/ConfigModal';

export default class ClaudesidianPlugin extends Plugin {
    public settings: Settings;
    private connector: MCPConnector;
    private settingsTab: SettingsTab;
    
    async onload() {
        console.log('Loading Claudesidian MCP plugin');
        
        // Initialize settings
        this.settings = new Settings(this);
        await this.settings.loadSettings();
        
        // Initialize connector with settings
        this.connector = new MCPConnector(this.app, this);
        await this.connector.start();
        
        // Add simplified settings tab
        this.settingsTab = new SettingsTab(this.app, this, this.settings);
        this.addSettingTab(this.settingsTab);
        
        // Ribbon icon removed as requested
        
        // Register commands
        this.addCommand({
            id: 'open-claudesidian-settings',
            name: 'Open Claudesidian Settings',
            callback: () => {
                // Open settings tab
                this.settingsTab.display();
            }
        });
        // Register command to open config modal
        this.addCommand({
            id: 'open-claudesidian-config',
            name: 'Open Claudesidian Configuration',
            callback: () => {
                new ConfigModal(this.app, this.settings).open();
            }
        });
        
        // No need to register agent commands as clients use MCP to interact with tools directly
        
        console.log('Claudesidian MCP plugin loaded');
    }
    
    async onunload() {
        console.log('Unloading Claudesidian MCP plugin');
        
        // Stop the MCP server
        await this.connector.stop();
    }
    
    /**
     * Get the settings instance
     * @returns Settings instance
     */
    getSettings(): Settings {
        return this.settings;
    }
    
    /**
     * Get the connector instance
     * @returns MCPConnector instance
     */
    getConnector(): MCPConnector {
        return this.connector;
    }
}