import { App, Modal, PluginSettingTab, Setting } from 'obsidian';
import BridgeMCPPlugin from '../main';

export class AllowedPathsModal extends Modal {
    plugin: BridgeMCPPlugin;

    constructor(app: App, plugin: BridgeMCPPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Select Allowed Paths' });
        // TODO: Recursively list folders, show checkboxes. Save results to plugin settings.
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class SettingsTab extends PluginSettingTab {
    plugin: BridgeMCPPlugin;

    constructor(app: App, plugin: BridgeMCPPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        console.log('SettingsTab: Displaying settings tab'); // Log display start
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Bridge MCP Settings' });
        console.log('SettingsTab: Created Bridge MCP Settings header'); // Log header creation

        // Server Settings Section
        containerEl.createEl('h3', { text: 'Server Settings' });

        new Setting(containerEl)
            .setName('Auto-start server')
            .setDesc('Start MCP server automatically when Obsidian launches')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoStart)
                .onChange(async (value) => {
                    console.log('SettingsTab: Auto-start server toggled', value); // Log toggle change
                    this.plugin.settings.autoStart = value;
                    await this.plugin.saveSettings(); // This will now work correctly
                    console.log('SettingsTab: Auto-start server setting saved'); // Confirm save
                }));

        new Setting(containerEl)
            .setName('Debug mode')
            .setDesc('Enable detailed logging for troubleshooting')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                }));

        // Vault Security Section - Combined security settings
        containerEl.createEl('h3', { text: 'Vault Security' });

        new Setting(containerEl)
            .setName('Require confirmation')
            .setDesc('Confirm before executing tool operations')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.requireConfirmation)
                .onChange(async (value) => {
                    this.plugin.settings.requireConfirmation = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Allowed Paths')
            .setDesc('Choose which vault folders are accessible by MCP.')
            .addButton(button => button
                .setButtonText('Configure')
                .onClick(() => {
                    new AllowedPathsModal(this.app, this.plugin).open();
                }));

        // Memory Tool Settings with path
        containerEl.createEl('h3', { text: 'Memory Settings' });

        // Tool Settings Section
        containerEl.createEl('h3', { text: 'Tool Settings' });

        // Enable/disable specific tools
        new Setting(containerEl)
            .setName('Enabled tools')
            .setDesc('Select which tools to enable')
            .addDropdown(dropdown => {
                // Add core tools
                const coreTools = ['memory', 'reasoning', 'search'];
                coreTools.forEach(tool => {
                    const isEnabled = this.plugin.settings.enabledTools.includes(tool);
                    dropdown.addOption(tool, `${tool} ${isEnabled ? '(enabled)' : '(disabled)'}`);
                });
                dropdown.setValue(this.plugin.settings.enabledTools[0] || 'memory');
                dropdown.onChange(async (value) => {
                    // Toggle tool in enabledTools array
                    const index = this.plugin.settings.enabledTools.indexOf(value);
                    if (index === -1) {
                        this.plugin.settings.enabledTools.push(value);
                    } else {
                        this.plugin.settings.enabledTools.splice(index, 1);
                    }
                    await this.plugin.saveSettings();
                });
            });

        // Vault Tool Toggle
        new Setting(containerEl)
            .setName('Enable Vault')
            .setDesc('Turn on vault CRUD and search operations.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enabledVault)
                .onChange(async (value) => {
                    this.plugin.settings.enabledVault = value;
                    await this.plugin.saveSettings();
                })
            );

        // Memory Tool Toggle
        new Setting(containerEl)
            .setName('Enable Memory')
            .setDesc('Manage memory creation and retrieval.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enabledMemory)
                .onChange(async (value) => {
                    this.plugin.settings.enabledMemory = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Memory Folder')
            .setDesc('Folder path where memories will be stored')
            .addText(text => text
                .setPlaceholder('memories')
                .setValue(this.plugin.settings.memoryFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.memoryFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        // Reasoning Tool Toggle
        new Setting(containerEl)
            .setName('Enable Reasoning')
            .setDesc('Enable advanced reasoning functionality.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enabledReasoning)
                .onChange(async (value) => {
                    this.plugin.settings.enabledReasoning = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Reasoning Folder')
            .setDesc('Folder path where reasoning outputs will be stored')
            .addText(text => text
                .setPlaceholder('reasoning')
                .setValue(this.plugin.settings.reasoningFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.reasoningFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        // Cache Settings
        containerEl.createEl('h3', { text: 'Performance Settings' });

        new Setting(containerEl)
            .setName('Cache timeout')
            .setDesc('How long to cache results (in seconds)')
            .addSlider(slider => slider
                .setLimits(60, 3600, 60)
                .setValue(this.plugin.settings.cacheTimeout)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.cacheTimeout = value;
                    await this.plugin.saveSettings();
                }));

        console.log('SettingsTab: Settings tab rendered successfully'); // Confirm rendering
    }
}