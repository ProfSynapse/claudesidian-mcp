import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { Settings } from '../settings';
import { ConfigModal } from './ConfigModal';

/**
 * Settings tab for the plugin
 * Provides configuration, setup instructions, and agent explanations
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
        
        // Plugin information with enhanced description
        containerEl.createEl('p', {
            text: 'Claudesidian MCP provides AI assistance through Model Context Protocol integration with Claude AI.'
        });
        
        // Configuration section at the top as requested
        containerEl.createEl('h3', { text: 'Configuration' });
        
        // Config modal button
        new Setting(containerEl)
            .setName('MCP Configuration')
            .setDesc('Configure MCP agents and tools')
            .addButton(button => button
                .setButtonText('Open Configuration')
                .onClick(() => {
                    new ConfigModal(this.app).open();
                }));
        
        // Setup instructions section
        containerEl.createEl('h3', { text: 'Setup Instructions' });
        
        const setupInstructions = containerEl.createEl('div', { cls: 'claudesidian-setup-instructions' });
        
        setupInstructions.createEl('p', {
            text: 'To use Claudesidian MCP, you need to:'
        });
        
        const setupSteps = setupInstructions.createEl('ol');
        setupSteps.createEl('li', {
            text: 'Download node.js'
        });
        setupSteps.createEl('li', {
            text: 'Ensure your Obsidian vault is open and accessible, and the plugin is enabled'
        });
        setupSteps.createEl('li', {
            text: 'Configure Claude Desktop to connect with this plugin using the configuration above'
        });

        setupSteps.createEl('li', {
            text: 'Download/Open Claude Desktop application installed and running (you should see a hammer icon with a number next to it in the chat)'
        });

        
        // Agent explanations section
        containerEl.createEl('h3', { text: 'Available Agents' });
        
        const agentsContainer = containerEl.createEl('div', { cls: 'claudesidian-agents' });
        
        // Note Reader agent
        new Setting(agentsContainer)
            .setName('Note Reader')
            .setDesc('Reads notes from your vault, allowing Claude to access your note content');
            
        // Note Editor agent
        new Setting(agentsContainer)
            .setName('Note Editor')
            .setDesc('Edits notes in your vault, allowing Claude to create or modify note content');
            
        // Vault Librarian agent
        new Setting(agentsContainer)
            .setName('Vault Librarian')
            .setDesc('Searches and navigates your vault, finding relevant notes and information');
            
        // Palette Commander agent
        new Setting(agentsContainer)
            .setName('Palette Commander')
            .setDesc('Executes Obsidian commands, allowing Claude to control Obsidian features');
            
        // Project Manager agent
        new Setting(agentsContainer)
            .setName('Project Manager')
            .setDesc('Will help plan out and manage your projects and queries within Claude');
            
        // Vault Manager agent
        new Setting(agentsContainer)
            .setName('Vault Manager')
            .setDesc('Manages files and folders in your vault, creating, moving, or deleting content');
    }
}