import { App, Plugin, PluginSettingTab, Setting, Notice, ButtonComponent } from 'obsidian';
import { Settings } from '../settings';
import { ConfigModal } from './ConfigModal';
import { WhatIsClaudesidianAccordion, BestPracticesAccordion } from './accordions';
import { UpdateManager } from '../utils/UpdateManager';
import { templateFiles } from '../templates';
import type { TemplateFile } from '../templates';

/**
 * Settings tab for the Claudesidian MCP plugin
 * Provides configuration options and agent explanations
 */
export class SettingsTab extends PluginSettingTab {
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
     * Creates the update section in settings
     * Displays current version and update button
     */
    private async createUpdateSection(containerEl: HTMLElement): Promise<void> {
        const updateSection = containerEl.createEl('div', { cls: 'mcp-section' });
        updateSection.createEl('h3', { text: 'Plugin Updates' });
        
        // Display current version
        updateSection.createEl('p', { 
            text: `Current version: ${this.plugin.manifest.version}` 
        });
        
        // Add update button
        new Setting(updateSection)
            .setName('Check for Updates')
            .setDesc('Check for and install the latest version')
            .addButton((button: ButtonComponent) => {
                button.setButtonText('Update Plugin')
                    .onClick(async () => {
                        button.setDisabled(true);
                        try {
                            const updateManager = new UpdateManager(this.plugin);
                            const hasUpdate = await updateManager.checkForUpdate();
                            
                            if (!hasUpdate) {
                                new Notice('You are already on the latest version!');
                                return;
                            }

                            await updateManager.updatePlugin();
                        } catch (error) {
                            new Notice(`Update failed: ${(error as Error).message}`);
                        } finally {
                            button.setDisabled(false);
                        }
                    });
            });
    }

    /**
     * Creates the template pack files in the vault
     */
    private async createTemplatePack(): Promise<void> {
        try {
            // Create Templates folder if it doesn't exist
            await this.app.vault.createFolder('Templates').catch(() => {});
            
            // Create each template file
            for (const [_, template] of Object.entries(templateFiles) as [string, TemplateFile][]) {
                await this.app.vault.create(
                    template.path,
                    '' // Empty content for user to fill
                ).catch(err => {
                    // Ignore "already exists" errors
                    if (!err.message.includes('already exists')) {
                        throw err;
                    }
                });
            }
            
            new Notice('Template pack created successfully!');
        } catch (error) {
            new Notice('Error creating template pack: ' + error.message);
        }
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
            
            .mcp-setup-instructions {
                margin-bottom: 20px;
                padding: 15px;
                background-color: var(--background-secondary);
                border-radius: 5px;
            }
            
            .mcp-agents-container {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 15px;
                margin-top: 10px;
            }
            
            .mcp-agent {
                padding: 10px;
                background-color: var(--background-secondary);
                border-radius: 5px;
                transition: transform 0.2s ease;
            }
            
            .mcp-agent:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            
            .mcp-agent-name {
                margin: 0 0 5px 0;
                color: var(--text-accent);
            }
            
            .mcp-agent-description {
                margin: 0;
                font-size: 0.9em;
            }
            
            .template-pack-info {
                margin-top: 8px;
                padding: 10px;
                background-color: var(--background-secondary);
                border-radius: 4px;
                font-size: 0.9em;
            }
            
            .template-pack-info ul {
                margin: 8px 0;
                padding-left: 20px;
            }

            .mcp-config-section {
                margin-bottom: 1.5rem;
            }

            .mcp-config-section pre {
                background-color: var(--background-primary);
                padding: 10px;
                border-radius: 4px;
                margin: 10px 0;
            }

            a {
                color: var(--text-accent);
                text-decoration: underline;
            }

            a:hover {
                color: var(--text-accent-hover);
            }
        `;
    }

    /**
     * Create setup instructions section
     */
    private createSetupInstructions(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Setup Instructions' });
        const setupInstructions = containerEl.createEl('div', { cls: 'mcp-setup-instructions' });
        
        // Prerequisites
        const prerequisites = setupInstructions.createEl('div', { cls: 'mcp-section' });
        prerequisites.createEl('h4', { text: 'Prerequisites' });
        const prereqList = prerequisites.createEl('ul');
        
        const nodejsItem = prereqList.createEl('li');
        const nodejsLink = nodejsItem.createEl('a', {
            text: 'Node.js',
            href: 'https://nodejs.org/en/download'
        });
        nodejsLink.setAttr('target', '_blank');
        nodejsItem.appendChild(document.createTextNode(' installed on your system'));

        const claudeItem = prereqList.createEl('li');
        const claudeLink = claudeItem.createEl('a', {
            text: 'Claude Desktop App',
            href: 'https://claude.ai/download'
        });
        claudeLink.setAttr('target', '_blank');
        claudeItem.appendChild(document.createTextNode(' installed'));

        // Setup steps
        setupInstructions.createEl('h4', { text: 'Installation Steps' });
        const setupSteps = setupInstructions.createEl('ol');
        setupSteps.createEl('li', {
            text: 'Close Claude completely (ensure it\'s not running in background)'
        });
        setupSteps.createEl('li', {
            text: 'Click the "Open Configuration" button below'
        });
        setupSteps.createEl('li', {
            text: 'Copy the appropriate configuration based on your setup'
        });
        setupSteps.createEl('li', {
            text: 'Open the configuration file using the provided link'
        });
        setupSteps.createEl('li', {
            text: 'Paste the copied text (replacing everything if no existing MCPs, or adding to the servers array if you have them)'
        });
        setupSteps.createEl('li', {
            text: 'Open Claude Desktop App'
        });
        setupSteps.createEl('li', {
            text: 'Look for the hammer icon with a number at the bottom of the chatbox'
        });

        // Configuration button
        new Setting(setupInstructions)
            .setName('MCP Configuration')
            .setDesc('Configure MCP agents and tools')
            .addButton(button => button
                .setButtonText('Open Configuration')
                .onClick(() => {
                    new ConfigModal(this.app).open();
                }));
    }
    
    /**
     * Display the settings tab
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // What is Claudesidian? accordion
        new WhatIsClaudesidianAccordion(containerEl);

        // Setup Instructions (not in accordion)
        this.createSetupInstructions(containerEl);

        // Update section
        this.createUpdateSection(containerEl);

        // Best Practices accordion
        new BestPracticesAccordion(containerEl, () => this.createTemplatePack());

        // Add CSS styles
        this.addStyles(containerEl);
    }
}
