/**
 * GetStartedTab - Two setup paths and MCP configuration helper
 *
 * Features:
 * - Two setup paths: Internal Chat and MCP Integration
 * - Internal Chat: Configure providers, enable chat view
 * - MCP Integration: Smart merge existing config with Nexus
 * - Platform-specific config file paths
 */

import { App, Setting, Notice, Platform } from 'obsidian';
import { BackButton } from '../components/BackButton';
import { BRAND_NAME, getPrimaryServerKey } from '../../constants/branding';
import * as path from 'path';

type GetStartedView = 'paths' | 'internal-chat' | 'mcp-setup';

export interface GetStartedTabServices {
    app: App;
    pluginPath: string;
    vaultPath: string;
    onOpenProviders: () => void;
}

export class GetStartedTab {
    private container: HTMLElement;
    private services: GetStartedTabServices;
    private currentView: GetStartedView = 'paths';

    // MCP config state
    private existingConfig: string = '';
    private outputEl?: HTMLElement;

    constructor(
        container: HTMLElement,
        services: GetStartedTabServices
    ) {
        this.container = container;
        this.services = services;

        this.render();
    }

    /**
     * Main render method
     */
    render(): void {
        this.container.empty();

        switch (this.currentView) {
            case 'paths':
                this.renderPathsView();
                break;
            case 'internal-chat':
                this.renderInternalChatSetup();
                break;
            case 'mcp-setup':
                this.renderMCPSetup();
                break;
        }
    }

    /**
     * Render the initial two-path view
     */
    private renderPathsView(): void {
        this.container.createEl('h3', { text: 'How would you like to use Nexus?' });

        const paths = this.container.createDiv('nexus-setup-paths');

        // Path 1: Internal Chat
        const chatPath = paths.createDiv('nexus-setup-path');
        chatPath.createDiv('nexus-setup-path-icon').setText('💬');
        chatPath.createDiv('nexus-setup-path-title').setText('Internal Chat');
        chatPath.createDiv('nexus-setup-path-desc').setText('Use Nexus directly inside Obsidian');
        chatPath.addEventListener('click', () => {
            this.currentView = 'internal-chat';
            this.render();
        });

        // Path 2: MCP Integration
        const mcpPath = paths.createDiv('nexus-setup-path');
        mcpPath.createDiv('nexus-setup-path-icon').setText('🔗');
        mcpPath.createDiv('nexus-setup-path-title').setText('MCP Integration');
        mcpPath.createDiv('nexus-setup-path-desc').setText('Connect Claude Desktop, LM Studio, etc.');
        mcpPath.addEventListener('click', () => {
            this.currentView = 'mcp-setup';
            this.render();
        });
    }

    /**
     * Render Internal Chat setup view
     */
    private renderInternalChatSetup(): void {
        new BackButton(this.container, 'Back', () => {
            this.currentView = 'paths';
            this.render();
        });

        this.container.createEl('h3', { text: 'Internal Chat Setup' });
        this.container.createEl('p', {
            text: 'Use Nexus as an AI chat assistant directly in Obsidian.',
            cls: 'setting-item-description'
        });

        // Step 1: Configure a provider
        const step1 = this.container.createDiv('nexus-setup-step');
        step1.createEl('h4', { text: 'Step 1: Configure an LLM Provider' });
        step1.createEl('p', {
            text: 'You need at least one LLM provider configured to use the chat.',
            cls: 'setting-item-description'
        });

        new Setting(step1)
            .addButton(btn => btn
                .setButtonText('Configure Providers')
                .setCta()
                .onClick(() => {
                    this.services.onOpenProviders();
                }));

        // Step 2: Open chat view
        const step2 = this.container.createDiv('nexus-setup-step');
        step2.createEl('h4', { text: 'Step 2: Open the Chat View' });
        step2.createEl('p', {
            text: 'Once a provider is configured, you can open the chat view:',
            cls: 'setting-item-description'
        });

        const instructions = step2.createEl('ul', { cls: 'nexus-setup-instructions' });
        instructions.createEl('li', { text: 'Click the chat icon in the left ribbon' });
        instructions.createEl('li', { text: 'Or use the command palette: "Nexus: Open Chat"' });
        instructions.createEl('li', { text: 'Or use the hotkey: Ctrl/Cmd + Shift + C' });

        // Step 3: Start chatting
        const step3 = this.container.createDiv('nexus-setup-step');
        step3.createEl('h4', { text: 'Step 3: Start Chatting!' });
        step3.createEl('p', {
            text: 'Your AI assistant has full access to your vault. Ask questions, take notes, and get help with your writing.',
            cls: 'setting-item-description'
        });
    }

    /**
     * Render MCP Integration setup view
     */
    private renderMCPSetup(): void {
        new BackButton(this.container, 'Back', () => {
            this.currentView = 'paths';
            this.render();
        });

        this.container.createEl('h3', { text: 'MCP Integration Setup' });
        this.container.createEl('p', {
            text: 'Connect external MCP-compatible tools like Claude Desktop, Cursor, or LM Studio to your Obsidian vault.',
            cls: 'setting-item-description'
        });

        // Config file location
        const configPathSection = this.container.createDiv('nexus-setup-step');
        configPathSection.createEl('h4', { text: 'Config File Location' });

        const configPath = this.getClaudeDesktopConfigPath();
        const pathDisplay = configPathSection.createDiv('nexus-config-path');
        pathDisplay.createEl('code', { text: configPath });

        // Copy path button
        new Setting(configPathSection)
            .addButton(btn => btn
                .setButtonText('Copy Path')
                .onClick(() => {
                    navigator.clipboard.writeText(configPath);
                    new Notice('Path copied to clipboard');
                }));

        // MCP Config Generator
        const generatorSection = this.container.createDiv('nexus-setup-step');
        generatorSection.createEl('h4', { text: 'Generate Configuration' });
        generatorSection.createEl('p', {
            text: 'Paste your existing config below (optional), and we\'ll add Nexus to it. Or leave blank to generate a fresh config.',
            cls: 'setting-item-description'
        });

        // Input for existing config
        new Setting(generatorSection)
            .setName('Existing config (optional)')
            .setDesc('Paste your current claude_desktop_config.json content')
            .addTextArea(text => {
                text.setPlaceholder('{ "mcpServers": { ... } }')
                    .setValue(this.existingConfig)
                    .onChange(value => {
                        this.existingConfig = value;
                    });
                text.inputEl.rows = 6;
                text.inputEl.addClass('nexus-mcp-input');
            });

        // Generate button
        new Setting(generatorSection)
            .addButton(btn => btn
                .setButtonText('Generate Config')
                .setCta()
                .onClick(() => {
                    this.generateMergedConfig();
                }));

        // Output area
        this.outputEl = generatorSection.createEl('pre', { cls: 'nexus-mcp-output' });
        this.outputEl.style.display = 'none';

        // Copy button (hidden until config generated)
        const copyContainer = generatorSection.createDiv('nexus-copy-container');
        copyContainer.style.display = 'none';

        new Setting(copyContainer)
            .addButton(btn => btn
                .setButtonText('Copy to Clipboard')
                .onClick(() => {
                    if (this.outputEl) {
                        navigator.clipboard.writeText(this.outputEl.textContent || '');
                        new Notice('Config copied to clipboard');
                    }
                }));

        // Store reference for showing later
        (this.outputEl as any).__copyContainer = copyContainer;

        // Instructions
        const instructionsSection = this.container.createDiv('nexus-setup-step');
        instructionsSection.createEl('h4', { text: 'Next Steps' });

        const steps = instructionsSection.createEl('ol', { cls: 'nexus-setup-instructions' });
        steps.createEl('li', { text: 'Generate the config above' });
        steps.createEl('li', { text: 'Copy the generated JSON' });
        steps.createEl('li', { text: 'Open your claude_desktop_config.json file' });
        steps.createEl('li', { text: 'Replace the contents with the generated config' });
        steps.createEl('li', { text: 'Save the file and restart Claude Desktop' });
    }

    /**
     * Generate merged MCP configuration
     */
    private generateMergedConfig(): void {
        if (!this.outputEl) return;

        try {
            // Parse existing config or create new
            let config: any;

            if (this.existingConfig.trim()) {
                try {
                    config = JSON.parse(this.existingConfig);
                } catch (e) {
                    new Notice('Invalid JSON in existing config. Please check the format.');
                    return;
                }
            } else {
                config = {};
            }

            // Ensure mcpServers exists
            if (!config.mcpServers) {
                config.mcpServers = {};
            }

            // Add Nexus server config
            const vaultName = this.services.app.vault.getName();
            const serverKey = getPrimaryServerKey(vaultName);
            const connectorPath = path.normalize(path.join(this.services.pluginPath, 'connector.js'));

            config.mcpServers[serverKey] = {
                command: 'node',
                args: [connectorPath]
            };

            // Format and display
            const formatted = JSON.stringify(config, null, 2);
            this.outputEl.textContent = formatted;
            this.outputEl.style.display = 'block';

            // Show copy button
            const copyContainer = (this.outputEl as any).__copyContainer;
            if (copyContainer) {
                copyContainer.style.display = 'block';
            }

            new Notice('Config generated successfully!');

        } catch (error) {
            console.error('[GetStartedTab] Error generating config:', error);
            new Notice(`Failed to generate config: ${(error as Error).message}`);
        }
    }

    /**
     * Get Claude Desktop config file path based on platform
     */
    private getClaudeDesktopConfigPath(): string {
        if (Platform.isWin) {
            return path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
        } else if (Platform.isMacOS) {
            return path.join(process.env.HOME || '', 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        } else {
            // Linux
            return path.join(process.env.HOME || '', '.config', 'Claude', 'claude_desktop_config.json');
        }
    }

    /**
     * Cleanup
     */
    destroy(): void {
        // No resources to clean up
    }
}
