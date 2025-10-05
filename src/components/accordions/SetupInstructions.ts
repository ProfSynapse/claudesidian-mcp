import { Accordion } from '../Accordion';
import { Setting, App, Notice, ButtonComponent } from 'obsidian';
import { ConfigModal } from '../ConfigModal';
import { MCPConfigGenerator } from '../../services/mcp/MCPConfigGenerator';
import * as path from 'path';

export class SetupInstructionsAccordion {
    private app: App;
    private statusContainer: HTMLElement | null = null;

    constructor(container: HTMLElement, app: App) {
        this.app = app;
        const accordion = new Accordion(container, 'Setup Instructions', false);
        const content = accordion.getContentEl();
        this.createContent(content);
    }

    private createContent(content: HTMLElement): void {
        // Prerequisites
        const prerequisites = content.createEl('div', { cls: 'mcp-section' });
        prerequisites.createEl('h4', { text: 'Prerequisites' });
        const prereqList = prerequisites.createEl('ul');

        const nodejsItem = prereqList.createEl('li');
        const nodejsLink = nodejsItem.createEl('a', {
            text: 'Node.js',
            href: 'https://nodejs.org/en/download'
        });
        nodejsLink.setAttr('target', '_blank');
        nodejsItem.appendChild(document.createTextNode(' installed on your system'));

        const clientItem = prereqList.createEl('li');
        clientItem.appendChild(document.createTextNode('An MCP-compatible client (Claude Desktop, agentic coding tools, etc.)'));

        // Setup options
        content.createEl('h3', { text: 'Setup Options' });

        // === Option 1: Claude Desktop ===
        const claudeDesktopSection = content.createEl('div', { cls: 'mcp-setup-section' });
        claudeDesktopSection.createEl('h4', { text: '1. Claude Desktop (Recommended for Desktop App)' });
        claudeDesktopSection.createEl('p', {
            text: 'Use this if you\'re setting up the Claude Desktop application.',
            cls: 'setting-item-description'
        });

        new Setting(claudeDesktopSection)
            .setName('Claude Desktop Configuration')
            .setDesc('Interactive setup wizard for Claude Desktop app')
            .addButton(button => button
                .setButtonText('Open Setup Wizard')
                .onClick(() => {
                    new ConfigModal(this.app).open();
                }));

        // Separator
        const separator = content.createEl('div', { cls: 'mcp-setup-separator' });
        separator.createEl('hr');
        const orText = content.createEl('p', {
            text: '— OR —',
            cls: 'mcp-setup-or'
        });
        orText.style.textAlign = 'center';
        orText.style.margin = '10px 0';
        orText.style.color = 'var(--text-muted)';

        // === Option 2: Universal MCP Clients ===
        const universalSection = content.createEl('div', { cls: 'mcp-setup-section' });
        universalSection.createEl('h4', { text: '2. Any MCP-Compatible Tool' });
        universalSection.createEl('p', {
            text: 'Use this for agentic coding tools, AI development environments, or any other MCP client. This generates a .mcp.json file in your vault root that any MCP-compatible tool can use.',
            cls: 'setting-item-description'
        });

        this.createUniversalMCPSection(universalSection);

        // Memory Manager Setup
        content.createEl('h4', { text: 'Memory Manager Setup (Optional)' });
        const memorySteps = content.createEl('ol');
        memorySteps.createEl('li', {
            text: 'Go to the Memory Management accordion in Settings'
        });
        memorySteps.createEl('li', {
            text: 'Enable Memory Manager using the toggle switch if it does not automatically enable'
        });

        // Add a note about what the Memory Manager does
        const memoryNote = content.createEl('div', { cls: 'mcp-setup-instructions' });
        memoryNote.createEl('p', { text: 'The Memory Manager enables workspace and session management across your vault, allowing your MCP client to organize content and maintain context. Once configured, your client can use memory management modes to work with your content organization.' });
    }

    private createUniversalMCPSection(container: HTMLElement): void {
        // Status container
        this.statusContainer = container.createDiv({ cls: 'mcp-config-status' });
        this.updateConfigStatus();

        // Generate button
        new Setting(container)
            .setName('MCP Configuration File')
            .setDesc('Generate or update .mcp.json for MCP-compatible tools')
            .addButton(button => button
                .setButtonText('Generate .mcp.json')
                .setClass('mod-cta')
                .onClick(async () => {
                    await this.handleGenerateConfig(button);
                }));

        // Universal usage instructions
        const usageBox = container.createDiv({ cls: 'mcp-info-box' });
        usageBox.createEl('strong', { text: 'How to Use:' });
        const steps = usageBox.createEl('ol');
        steps.createEl('li', { text: 'Click "Generate .mcp.json" above' });
        steps.createEl('li', { text: 'Keep Obsidian running with your vault open' });
        steps.createEl('li', { text: 'In your MCP-compatible tool, point it to this vault\'s .mcp.json file' });
        steps.createEl('li', { text: 'Your tool can now access vault operations through MCP' });
    }

    private async updateConfigStatus(): Promise<void> {
        if (!this.statusContainer) return;

        this.statusContainer.empty();

        const generator = this.getConfigGenerator();
        const status = await generator.checkConfigStatus();

        const statusEl = this.statusContainer.createDiv({ cls: 'mcp-status' });

        if (!status.exists) {
            statusEl.createEl('span', {
                text: '⚪ No .mcp.json found in vault',
                cls: 'mcp-status-neutral'
            });
            statusEl.createEl('p', {
                text: 'Click the button below to create one for MCP client access',
                cls: 'mcp-status-hint'
            });
        } else if (!status.hasOurServer) {
            statusEl.createEl('span', {
                text: `⚠️ .mcp.json exists (${status.totalServers} MCP ${status.totalServers === 1 ? 'server' : 'servers'}), but Claudesidian not configured`,
                cls: 'mcp-status-warning'
            });
            statusEl.createEl('p', {
                text: 'Click to add Claudesidian to your existing MCP configuration',
                cls: 'mcp-status-hint'
            });
        } else if (!status.isUpToDate) {
            statusEl.createEl('span', {
                text: '🔄 Configuration exists but needs update',
                cls: 'mcp-status-warning'
            });
            statusEl.createEl('p', {
                text: 'Click to update to the current vault path',
                cls: 'mcp-status-hint'
            });
        } else {
            statusEl.createEl('span', {
                text: `✅ Ready for MCP clients (${status.totalServers} total ${status.totalServers === 1 ? 'server' : 'servers'})`,
                cls: 'mcp-status-success'
            });
            statusEl.createEl('p', {
                text: 'Your MCP-compatible tools can connect to this vault',
                cls: 'mcp-status-hint'
            });
        }
    }

    private async handleGenerateConfig(button: ButtonComponent): Promise<void> {
        button.setDisabled(true);
        button.setButtonText('Generating...');

        try {
            const generator = this.getConfigGenerator();
            const result = await generator.generateOrUpdateConfig();

            if (result.success) {
                new Notice(result.message);

                // Update status display
                await this.updateConfigStatus();

                // Show next steps if created or updated
                if (result.action === 'created' || result.action === 'updated') {
                    this.showNextSteps(result.action);
                }
            } else {
                new Notice('Failed to generate .mcp.json: ' + result.message, 5000);
            }
        } catch (error) {
            console.error('[SetupInstructions] Error generating config:', error);
            new Notice(`Error: ${(error as Error).message}`, 5000);
        } finally {
            button.setDisabled(false);
            button.setButtonText('Generate .mcp.json');
        }
    }

    private showNextSteps(action: 'created' | 'updated'): void {
        if (!this.statusContainer) return;

        // Find the parent container
        const parentContainer = this.statusContainer.parentElement;
        if (!parentContainer) return;

        // Remove any existing next steps
        const existing = parentContainer.querySelector('.mcp-next-steps');
        if (existing) existing.remove();

        const nextSteps = parentContainer.createDiv({ cls: 'mcp-next-steps' });

        if (action === 'created') {
            nextSteps.createEl('h5', { text: '🎉 .mcp.json Created!' });
        } else {
            nextSteps.createEl('h5', { text: '✅ Configuration Updated!' });
        }

        const info = nextSteps.createDiv({ cls: 'mcp-next-steps-info' });

        // File location
        info.createEl('p', {
            text: `📍 Location: ${this.app.vault.getName()}/.mcp.json`
        });

        // What was done
        const whatHappened = info.createEl('div');
        whatHappened.createEl('strong', { text: 'What this does:' });
        const details = whatHappened.createEl('ul');
        details.createEl('li', { text: 'Exposes your vault operations via MCP protocol' });
        details.createEl('li', { text: 'Works with any MCP-compatible client' });
        details.createEl('li', { text: 'Preserves any other MCP servers you have configured' });

        // Next steps
        const steps = info.createEl('div');
        steps.createEl('strong', { text: 'To use with an MCP client:' });
        const stepsList = steps.createEl('ol');
        stepsList.createEl('li', { text: 'Keep this Obsidian vault open' });
        stepsList.createEl('li', { text: 'Configure your MCP client to use this vault\'s .mcp.json' });
        stepsList.createEl('li', { text: 'The client will have access to all Claudesidian agents and modes' });

        // Auto-hide after 15 seconds
        setTimeout(() => nextSteps.remove(), 15000);
    }

    private getConfigGenerator(): MCPConfigGenerator {
        const vaultPath = (this.app.vault.adapter as any).basePath;
        const pluginPath = path.join(vaultPath, '.obsidian', 'plugins', 'claudesidian-mcp');
        return new MCPConfigGenerator(this.app, vaultPath, pluginPath);
    }
}
