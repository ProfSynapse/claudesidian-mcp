import { App, Modal, PluginSettingTab, Setting } from 'obsidian';
import { AIProvider, AIModelMap, AIModel } from '../ai/models';
import { MCPSettings } from '../types';
import BridgeMCPPlugin from '../main';
import { AllowedPathsModal } from './AllowedPathsModal';
import { ClaudeConfigModal } from './ClaudeConfigModal';

export class SettingsTab extends PluginSettingTab {
    plugin: BridgeMCPPlugin;
    private oldPath: string = '';

    constructor(app: App, plugin: BridgeMCPPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async handleRootPathChange(newPath: string) {
        // Store the old path before updating
        this.oldPath = this.plugin.settings.rootPath;
        
        // Update settings
        this.plugin.settings.rootPath = newPath;
        await this.plugin.saveSettings();
    }

    async handleToolToggle(toolName: 'memory' | 'reasoning', enabled: boolean) {
        if (toolName === 'memory') {
            this.plugin.settings.enabledMemory = enabled;
        } else {
            this.plugin.settings.enabledReasoning = enabled;
        }
        await this.plugin.saveSettings();
        
        // Initialize folder structure after settings change
        await this.plugin.initializeFolderStructure();
    }

    display(): void {
        // Store the current path when displaying settings
        this.oldPath = this.plugin.settings.rootPath;

        console.log('SettingsTab: Displaying settings tab'); // Log display start
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Claudesidian MCP Settings' });
        console.log('SettingsTab: Created Claudesidian MCP Settings header'); // Log header creation

        // Add the Claude Desktop configuration button near the top
        new Setting(containerEl)
            .setName('Claude Desktop Setup')
            .setDesc('Open the configuration modal for Claude Desktop')
            .addButton(button => button
                .setButtonText('Show Configuration')
                .onClick(() => {
                    new ClaudeConfigModal(this.app).open();
                }));

        // Root Path Setting with Save/Migrate Button
        new Setting(containerEl)
            .setName('Claudesidian')
            .setDesc('Folder where all MCP content will be stored')
            .addText(text => text
                .setPlaceholder('claudesidian')
                .setValue(this.plugin.settings.rootPath)
                .onChange(async (value) => {
                    // Just update settings, don't change oldPath
                    this.plugin.settings.rootPath = value;
                    await this.plugin.saveSettings();
                }))
            .addButton(button => button
                .setButtonText('Create/Migrate Folders')
                .onClick(async () => {
                    try {
                        button.setDisabled(true);
                        button.setButtonText('Migrating...');
                        
                        // Use the stored old path for migration
                        const fromPath = this.oldPath;
                        const toPath = this.plugin.settings.rootPath;
                        console.log(`Migrating from ${fromPath} to ${toPath}`);
                        
                        await this.plugin.migrateAndInitializeFolders(fromPath); // Pass the old path
                        
                        // Update oldPath after successful migration
                        this.oldPath = toPath;
                        
                        button.setButtonText('Done!');
                        setTimeout(() => {
                            button.setButtonText('Create/Migrate Folders');
                            button.setDisabled(false);
                        }, 2000);
                    } catch (error) {
                        console.error('Failed to migrate folders:', error);
                        button.setButtonText('Failed!');
                        setTimeout(() => {
                            button.setButtonText('Create/Migrate Folders');
                            button.setDisabled(false);
                        }, 2000);
                    }
                }));

        // Server Settings Section
        containerEl.createEl('h3', { text: 'Server Settings' });

        // Vault Security Section - Combined security settings
        containerEl.createEl('h3', { text: 'Vault Security' });

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

        // Remove the enabled tools dropdown and just keep the individual toggles
        
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
                    await this.handleToolToggle('memory', value);
                })
            );

        // Reasoning Tool Toggle
        new Setting(containerEl)
            .setName('Enable Reasoning')
            .setDesc('Enable advanced reasoning functionality.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enabledReasoning)
                .onChange(async (value) => {
                    await this.handleToolToggle('reasoning', value);
                })
            );

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

        // Add AI Configuration Section
        containerEl.createEl('h3', { text: 'AI Configuration' });

        // AI Provider Selection
        new Setting(containerEl)
            .setName('AI Provider')
            .setDesc('Select which AI provider to use')
            .addDropdown(dropdown => {
                Object.values(AIProvider).forEach(provider => {
                    dropdown.addOption(String(provider), provider === AIProvider.OpenRouter ? 'OpenRouter' : 'LM Studio');
                });
                
                dropdown
                    .setValue(this.plugin.settings.aiProvider)
                    .onChange(async (value) => {
                        this.plugin.settings.aiProvider = value as AIProvider;
                        await this.plugin.saveSettings();
                        this.display();
                    });
            });

        // OpenRouter Settings
        const settings = this.plugin.settings as MCPSettings;
        if (settings.aiProvider === AIProvider.OpenRouter) {
            new Setting(containerEl)
                .setName('OpenRouter API Key')
                .setDesc('Enter your OpenRouter API key')
                .addText(text => {
                    text
                        .setPlaceholder('Enter API key')
                        .setValue(settings.apiKeys[AIProvider.OpenRouter] || '')
                        .onChange(async (value) => {
                            settings.apiKeys[AIProvider.OpenRouter] = value;
                            await this.plugin.saveSettings();
                        });
                    text.inputEl.type = 'password';
                })
                .addExtraButton(button => {
                    button
                        .setIcon('external-link')
                        .setTooltip('Get API key')
                        .onClick(() => {
                            window.open('https://openrouter.ai/keys');
                        });
                });

            // Default Model Selection
            new Setting(containerEl)
                .setName('Default AI Model')
                .setDesc('Select the default model to use')
                .addDropdown(dropdown => {
                    const models = AIModelMap[AIProvider.OpenRouter];
                    models.forEach((model: AIModel) => {
                        dropdown.addOption(model.apiName, model.name);
                    });
                    
                    dropdown
                        .setValue(settings.defaultModel)
                        .onChange(async (value) => {
                            settings.defaultModel = value;
                            await this.plugin.saveSettings();
                        });
                });

            // Temperature Setting
            new Setting(containerEl)
                .setName('Default Temperature')
                .setDesc('Set the default temperature for completions (0.0 - 1.0)')
                .addSlider(slider => {
                    slider
                        .setLimits(0, 1, 0.05)
                        .setValue(settings.defaultTemperature)
                        .setDynamicTooltip()
                        .onChange(async (value) => {
                            settings.defaultTemperature = value;
                            await this.plugin.saveSettings();
                        });
                });
        }
    }
}
