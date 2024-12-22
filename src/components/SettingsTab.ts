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

export class ClaudeConfigModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.empty();

        contentEl.createEl('h2', {text: 'Claude Desktop Configuration'});

        const instructions = contentEl.createEl('div');
        instructions.createEl('p', {text: 'To configure Claude Desktop to work with Bridge MCP:'});
        
        const steps = instructions.createEl('ol');
        steps.createEl('li', {text: 'Open your Claude Desktop config file:'});
        
        const paths = steps.createEl('ul');
        paths.createEl('li', {text: 'Mac: ~/Library/Application Support/Claude/claude_desktop_config.json'});
        paths.createEl('li', {text: 'Windows: %AppData%\\Claude\\claude_desktop_config.json'});
        
        steps.createEl('li', {text: 'Copy the following JSON configuration:'});

        const config = {
            mcpServers: {
                "bridge-mcp": {
                    command: "node",
                    args: [this.getConnectorPath()]
                }
            }
        };

        const codeBlock = contentEl.createEl('pre');
        codeBlock.createEl('code', {
            text: JSON.stringify(config, null, 2)
        });

        steps.createEl('li', {text: 'Paste this into your config file, replacing any existing content'});
        steps.createEl('li', {text: 'Save the file and restart Claude Desktop'});

        const copyButton = contentEl.createEl('button', {
            text: 'Copy Configuration',
            cls: 'mod-cta'
        });
        
        copyButton.onclick = () => {
            navigator.clipboard.writeText(JSON.stringify(config, null, 2));
            copyButton.setText('Copied!');
            setTimeout(() => copyButton.setText('Copy Configuration'), 2000);
        };
    }

    private getConnectorPath(): string {
        // Use the correct method to get the vault path
        const vaultPath = this.app.vault.configDir;
        const pluginDir = 'plugins/bridge-mcp';
        return `${vaultPath}/${pluginDir}/connector.js`;
    }

    onClose() {
        const {contentEl} = this;
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

        // Add the Claude Desktop configuration button near the top
        new Setting(containerEl)
            .setName('Claude Desktop Setup')
            .setDesc('Show instructions for configuring Claude Desktop')
            .addButton(button => button
                .setButtonText('Show Configuration')
                .onClick(() => {
                    new ClaudeConfigModal(this.app).open();
                }));

        // Root Path Setting
        new Setting(containerEl)
            .setName('MCP Root Folder')
            .setDesc('Folder where all MCP content will be stored')
            .addText(text => text
                .setPlaceholder('bridge-mcp')
                .setValue(this.plugin.settings.rootPath)
                .onChange(async (value) => {
                    this.plugin.settings.rootPath = value;
                    await this.plugin.saveSettings();
                }));

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