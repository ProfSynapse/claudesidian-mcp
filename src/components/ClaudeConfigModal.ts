import { App, Modal, Platform } from 'obsidian';
import * as path from 'path';

export class ClaudeConfigModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Claude Desktop Configuration' });

        const instructions = contentEl.createEl('div');
        instructions.createEl('p', { text: 'To configure Claude Desktop to work with Claudesidian MCP:' });

        const steps = instructions.createEl('ol');
        steps.createEl('li', { text: 'Open your Claude Desktop config file:' });

        const paths = steps.createEl('ul');
        
        // Create clickable links instead of plain text
        const macPath = paths.createEl('li');
        const macLink = macPath.createEl('a', {
            text: 'Mac: ~/Library/Application Support/Claude/claude_desktop_config.json',
            href: '#'
        });
        
        const winPath = paths.createEl('li');
        const winLink = winPath.createEl('a', {
            text: 'Windows: %AppData%\\Claude\\claude_desktop_config.json',
            href: '#'
        });

        // Add click handlers to open the config file
        const configPath = this.getConfigPath();
        [macLink, winLink].forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                // Use system's default program to open the file
                window.open('file:///' + configPath.replace(/\\/g, '/'), '_blank');
            });
        });

        steps.createEl('li', { text: 'Copy the following JSON configuration:' });

        const config = {
            mcpServers: {
                "claudesidian-mcp": {
                    command: "node",
                    args: [this.getConnectorPath()]
                }
            }
        };

        const codeBlock = contentEl.createEl('pre');
        codeBlock.createEl('code', {
            text: JSON.stringify(config, null, 2)
        });

        steps.createEl('li', { text: 'Paste this into your config file, replacing any existing content' });
        steps.createEl('li', { text: 'Save the file and restart Claude Desktop' });

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
        // Get the vault's root path using the correct method
        const vaultRoot = (this.app.vault.adapter as any).basePath;
        return path.join(vaultRoot, '.obsidian/plugins/claudesidian-mcp/connector.js');
    }

    private getConfigPath(): string {
        if (Platform.isMacOS) {
            return path.join(process.env.HOME || '', 'Library/Application Support/Claude/claude_desktop_config.json');
        }
        return path.join(process.env.APPDATA || '', 'Claude/claude_desktop_config.json');
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
