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
        
        // Add settings tab with vault librarian if available
        // Convert null to undefined when getting the vault librarian
        const vaultLibrarian = this.connector.getVaultLibrarian();
        this.settingsTab = new SettingsTab(
            this.app, 
            this, 
            this.settings,
            vaultLibrarian || undefined
        );
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
        // Clean up the vault librarian if necessary
        const vaultLibrarian = this.connector.getVaultLibrarian();
        if (vaultLibrarian && typeof vaultLibrarian.onunload === 'function') {
            vaultLibrarian.onunload();
        }
        
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
