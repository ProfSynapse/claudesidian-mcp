import { App, Plugin, PluginSettingTab, Setting, Notice, ButtonComponent } from 'obsidian';
import { Settings } from '../settings';
import { ConfigModal } from './ConfigModal';
import { 
    WhatIsClaudesidianAccordion, 
    BestPracticesAccordion, 
    SetupInstructionsAccordion,
    MemoryManagementAccordion
} from './accordions';
import { UpdateManager } from '../utils/UpdateManager';
import { templateFiles } from '../templates';
import type { TemplateFile } from '../templates';
import { MemorySettingsTab } from './MemorySettingsTab';
import { MemoryManager } from '../agents/memoryManager';

/**
 * Settings tab for the Claudesidian MCP plugin
 * Provides configuration options and agent explanations
 */
export class SettingsTab extends PluginSettingTab {
    private settings: Settings;
    private plugin: Plugin;
    private memorySettingsTab: MemorySettingsTab;
    
    /**
     * Create a new settings tab
     * @param app Obsidian app instance
     * @param plugin Plugin instance
     * @param settings Settings manager
     * @param memoryManager Memory Manager instance
     */
    constructor(
        app: App, 
        plugin: Plugin, 
        private settingsManager: Settings,
        private memoryManager?: MemoryManager
    ) {
        super(app, plugin);
        this.settings = settingsManager;
        this.plugin = plugin;
    }

    /**
     * Creates the update section in settings
     * Displays current version, last update info, and update button
     */
    private async createUpdateSection(containerEl: HTMLElement): Promise<void> {
        const updateSection = containerEl.createEl('div', { cls: 'mcp-section' });
        updateSection.createEl('h3', { text: 'Plugin Updates' });
        
        // Display current version
        updateSection.createEl('p', { 
            text: `Current version: ${this.plugin.manifest.version}` 
        });
        
        // Display last update info if available
        if (this.settings.settings.lastUpdateVersion && this.settings.settings.lastUpdateDate) {
            const lastUpdateDate = new Date(this.settings.settings.lastUpdateDate);
            const formattedDate = lastUpdateDate.toLocaleDateString() + ' ' + 
                                  lastUpdateDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            updateSection.createEl('p', {
                text: `Last updated: ${this.settings.settings.lastUpdateVersion} (${formattedDate})`
            });
        }
        
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
                            
                            // Refresh the settings display to show the updated version
                            this.display();
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

            /* Memory settings styles */
            .memory-settings-container {
                margin-top: 10px;
            }

            .memory-settings-tabs {
                display: flex;
                border-bottom: 1px solid var(--background-modifier-border);
                margin-bottom: 15px;
            }

            .memory-tab {
                padding: 8px 15px;
                cursor: pointer;
                border-bottom: 2px solid transparent;
                margin-right: 5px;
                user-select: none;
            }

            .memory-tab.active {
                border-bottom: 2px solid var(--text-accent);
                color: var(--text-accent);
            }

            .memory-tab-pane {
                display: none;
                padding: 10px 0;
            }

            .memory-tab-pane.active {
                display: block;
            }

            .memory-settings-textarea {
                width: 100%;
                background: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                padding: 8px;
                font-family: var(--font-monospace);
                resize: vertical;
            }

            .memory-usage-stats {
                margin-top: 20px;
                padding: 15px;
                border-radius: 5px;
                background-color: var(--background-secondary);
            }

            .memory-usage-progress {
                margin: 10px 0;
                height: 8px;
                background-color: var(--background-modifier-border);
                border-radius: 4px;
                overflow: hidden;
            }

            .memory-usage-bar {
                height: 100%;
                background-color: var(--text-accent);
                border-radius: 4px;
            }

            .memory-actions {
                display: flex;
                gap: 10px;
                margin-top: 15px;
                align-items: center;
            }
            
            .memory-actions button {
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .memory-notice {
                padding: 10px;
                background-color: var(--background-secondary);
                border-left: 3px solid var(--text-accent);
                margin-bottom: 15px;
            }

            /* Accordion styles */
            .mcp-accordion {
                margin-bottom: 15px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 5px;
                overflow: hidden;
            }

            .mcp-accordion-container {
                width: 100%;
            }

            .mcp-accordion-header {
                border-bottom: 1px solid var(--background-modifier-border);
                background-color: var(--background-secondary);
            }

            .mcp-accordion-toggle {
                width: 100%;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 15px;
                background: none;
                border: none;
                cursor: pointer;
                text-align: left;
            }

            .mcp-accordion-title {
                font-weight: 500;
                font-size: 1.1em;
            }

            .mcp-accordion-icon {
                transition: transform 0.3s ease;
            }

            .mcp-accordion-icon:after {
                content: "▼";
                font-size: 0.7em;
            }

            .mcp-accordion-icon.is-open {
                transform: rotate(180deg);
            }

            .mcp-accordion-content {
                max-height: 0;
                overflow: hidden;
                transition: max-height 0.3s ease;
            }

            .mcp-accordion-content.is-open {
                max-height: 2000px;
                padding: 15px;
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
     * Display the settings tab
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Update section first
        this.createUpdateSection(containerEl);

        // Memory Management accordion (always show this even if memory manager isn't initialized)
        new MemoryManagementAccordion(containerEl, this.settingsManager, this.memoryManager);

        // Setup Instructions accordion
        new SetupInstructionsAccordion(containerEl);

        // What is Claudesidian? accordion
        new WhatIsClaudesidianAccordion(containerEl);

        // Best Practices accordion
        new BestPracticesAccordion(containerEl, () => this.createTemplatePack());

        // Add CSS styles
        this.addStyles(containerEl);
    }
}
