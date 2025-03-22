import { App, Modal, PluginSettingTab, Setting } from 'obsidian';
import { AIProvider, AIModelMap, AIModel } from '../ai/models';
import { MCPSettings } from '../types';
import BridgeMCPPlugin from '../main';
import { ClaudeConfigModal } from './ClaudeConfigModal';

export class SettingsTab extends PluginSettingTab {
    plugin: BridgeMCPPlugin;

    constructor(app: App, plugin: BridgeMCPPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async handleToolToggle(enabled: boolean) {
        this.plugin.settings.enabledVault = enabled;
        await this.plugin.saveSettings();
        
        // Initialize folder structure after settings change
        await this.plugin.initializeFolderStructure();
    }

    display(): void {
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

        // Display static path information
        new Setting(containerEl)
            .setName('Claudesidian')
            .setDesc('Folder where all MCP content is stored')
            .addText(text => text
                .setValue('claudesidian')
                .setDisabled(true)
                .setPlaceholder('claudesidian'));

        // Server Settings Section
        containerEl.createEl('h3', { text: 'Server Settings' });

        // Memory section removed

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
                    await this.handleToolToggle(value);
                })
            );
            

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
