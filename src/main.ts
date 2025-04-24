import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { UpdateManager } from './utils/UpdateManager';
import { MCPConnector } from './connector';
import { Settings } from './settings';
import { SettingsTab } from './components/SettingsTab';
import { ConfigModal } from './components/ConfigModal';

export default class ClaudesidianPlugin extends Plugin {
    public settings: Settings;
    private connector: MCPConnector;
    private settingsTab: SettingsTab;
    
    async onload() {
        // Initialize settings
        this.settings = new Settings(this);
        await this.settings.loadSettings();
        
        // Initialize connector with settings
        this.connector = new MCPConnector(this.app, this);
        await this.connector.start();
        
        // Add simplified settings tab
        this.settingsTab = new SettingsTab(this.app, this, this.settings);
        this.addSettingTab(this.settingsTab);
        
        // Add ribbon icons
        this.addRibbonIcon('bot', 'Open Claudesidian MCP', () => {
            new ConfigModal(this.app, this.settings).open();
        });

        this.addRibbonIcon('refresh-cw', 'Check for Updates', async () => {
            try {
                const updateManager = new UpdateManager(this);
                const hasUpdate = await updateManager.checkForUpdate();
                
                if (!hasUpdate) {
                    new Notice('You are already on the latest version!');
                    return;
                }

                await updateManager.updatePlugin();
            } catch (error) {
                new Notice(`Update failed: ${(error as Error).message}`);
            }
        });
        
        // No need to register commands as clients use MCP to interact with tools directly
        
    }
    
    async onunload() {
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
