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
     * Add CSS styles for the settings tab (now implemented in styles.css)
     * @param containerEl Container element
     */
    private addStyles(containerEl: HTMLElement): void {
        // Styles are now in the global styles.css file
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
