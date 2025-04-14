import { App, Modal, Platform, Setting } from 'obsidian';
import * as path from 'path';
import { Settings } from '../settings';

/**
 * Configuration modal for the plugin
 * Provides setup instructions for different operating systems
 */
export class ConfigModal extends Modal {
    private activeTab: string = 'windows';
    private tabButtons: Record<string, HTMLElement> = {};
    private tabContents: Record<string, HTMLElement> = {};
    private settings?: Settings;
    
    /**
     * Create a new configuration modal
     * @param app Obsidian app instance
     * @param settings Settings instance (optional)
     */
    constructor(app: App, settings?: Settings) {
        super(app);
        this.settings = settings;
    }
    
    /**
     * Called when the modal is opened
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'MCP Configuration' });
        
        // Create tab container
        const tabContainer = contentEl.createDiv({ cls: 'mcp-config-tabs' });
        
        // Add tab buttons
        this.createTabButtons(tabContainer);
        
        // Create content container
        const contentContainer = contentEl.createDiv({ cls: 'mcp-config-content' });
        
        // Create tab contents
        this.createWindowsTab(contentContainer);
        this.createMacTab(contentContainer);
        this.createLinuxTab(contentContainer);
        
        // Show default tab
        this.showTab(this.activeTab);
        
        // Add CSS
        this.addStyles();
        
        // Close button
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Close')
                .onClick(() => {
                    this.close();
                }));
    }
    
    /**
     * Create tab buttons
     * @param container Container element
     */
    private createTabButtons(container: HTMLElement) {
        const tabButtonContainer = container.createDiv({ cls: 'mcp-tab-buttons' });
        
        // Windows tab button
        const windowsButton = tabButtonContainer.createEl('button', {
            text: 'Windows',
            cls: 'mcp-tab-button'
        });
        windowsButton.addEventListener('click', () => this.showTab('windows'));
        this.tabButtons['windows'] = windowsButton;
        
        // Mac tab button
        const macButton = tabButtonContainer.createEl('button', {
            text: 'Mac',
            cls: 'mcp-tab-button'
        });
        macButton.addEventListener('click', () => this.showTab('mac'));
        this.tabButtons['mac'] = macButton;
        
        // Linux tab button
        const linuxButton = tabButtonContainer.createEl('button', {
            text: 'Linux',
            cls: 'mcp-tab-button'
        });
        linuxButton.addEventListener('click', () => this.showTab('linux'));
        this.tabButtons['linux'] = linuxButton;
        
        // Auto-select current platform
        if (Platform.isMacOS) {
            this.activeTab = 'mac';
        } else if (Platform.isLinux) {
            this.activeTab = 'linux';
        }
    }
    
    /**
     * Create Windows tab content
     * @param container Container element
     */
    private createWindowsTab(container: HTMLElement) {
        const windowsContent = container.createDiv({ cls: 'mcp-tab-content' });
        windowsContent.style.display = 'none';
        this.tabContents['windows'] = windowsContent;
        
        const instructions = windowsContent.createEl('div');
        instructions.createEl('p', { text: 'To configure Claude Desktop to work with Claudesidian MCP on Windows:' });
        
        const steps = instructions.createEl('ol');
        
        // Step 1: Open config file
        steps.createEl('li', { text: 'Open your Claude Desktop config file:' });
        
        const configPath = '%AppData%\\Claude\\claude_desktop_config.json';
        const configLink = steps.createEl('a', {
            text: configPath,
            href: '#'
        });
        
        configLink.addEventListener('click', async (e) => {
            e.preventDefault();
            // Try to open the file with system's default program
            const actualPath = this.getWindowsConfigPath();
            window.open('file:///' + actualPath.replace(/\\/g, '/'), '_blank');
        });
        
        // Step 2: Copy configuration
        steps.createEl('li', { text: 'Copy the following JSON configuration:' });
        
        const config = this.getConfiguration('windows');
        
        const codeBlock = windowsContent.createEl('pre');
        codeBlock.createEl('code', {
            text: JSON.stringify(config, null, 2)
        });
        
        // Copy button
        const copyButton = windowsContent.createEl('button', {
            text: 'Copy Configuration',
            cls: 'mod-cta'
        });
        
        copyButton.onclick = () => {
            navigator.clipboard.writeText(JSON.stringify(config, null, 2));
            copyButton.setText('Copied!');
            setTimeout(() => copyButton.setText('Copy Configuration'), 2000);
        };
        
        // Remaining steps
        steps.createEl('li', { text: 'Paste this into your config file, replacing any existing content' });
        steps.createEl('li', { text: 'Save the file and restart Claude Desktop' });
    }
    
    /**
     * Create Mac tab content
     * @param container Container element
     */
    private createMacTab(container: HTMLElement) {
        const macContent = container.createDiv({ cls: 'mcp-tab-content' });
        macContent.style.display = 'none';
        this.tabContents['mac'] = macContent;
        
        const instructions = macContent.createEl('div');
        instructions.createEl('p', { text: 'To configure Claude Desktop to work with Claudesidian MCP on Mac:' });
        
        const steps = instructions.createEl('ol');
        
        // Step 1: Open config file
        steps.createEl('li', { text: 'Open your Claude Desktop config file:' });
        
        const configPath = '~/Library/Application Support/Claude/claude_desktop_config.json';
        const configLink = steps.createEl('a', {
            text: configPath,
            href: '#'
        });
        
        configLink.addEventListener('click', async (e) => {
            e.preventDefault();
            // Try to open the file with system's default program
            const actualPath = this.getMacConfigPath();
            window.open('file:///' + actualPath, '_blank');
        });
        
        // Step 2: Copy configuration
        steps.createEl('li', { text: 'Copy the following JSON configuration:' });
        
        const config = this.getConfiguration('mac');
        
        const codeBlock = macContent.createEl('pre');
        codeBlock.createEl('code', {
            text: JSON.stringify(config, null, 2)
        });
        
        // Copy button
        const copyButton = macContent.createEl('button', {
            text: 'Copy Configuration',
            cls: 'mod-cta'
        });
        
        copyButton.onclick = () => {
            navigator.clipboard.writeText(JSON.stringify(config, null, 2));
            copyButton.setText('Copied!');
            setTimeout(() => copyButton.setText('Copy Configuration'), 2000);
        };
        
        // Remaining steps
        steps.createEl('li', { text: 'Paste this into your config file, replacing any existing content' });
        steps.createEl('li', { text: 'Save the file and restart Claude Desktop' });
    }
    
    /**
     * Create Linux tab content
     * @param container Container element
     */
    private createLinuxTab(container: HTMLElement) {
        const linuxContent = container.createDiv({ cls: 'mcp-tab-content' });
        linuxContent.style.display = 'none';
        this.tabContents['linux'] = linuxContent;
        
        const instructions = linuxContent.createEl('div');
        instructions.createEl('p', { text: 'To configure Claude Desktop to work with Claudesidian MCP on Linux:' });
        
        const steps = instructions.createEl('ol');
        
        // Step 1: Open config file
        steps.createEl('li', { text: 'Open your Claude Desktop config file:' });
        
        const configPath = '~/.config/Claude/claude_desktop_config.json';
        const configLink = steps.createEl('a', {
            text: configPath,
            href: '#'
        });
        
        configLink.addEventListener('click', async (e) => {
            e.preventDefault();
            // Try to open the file with system's default program
            const actualPath = this.getLinuxConfigPath();
            window.open('file:///' + actualPath, '_blank');
        });
        
        // Step 2: Copy configuration
        steps.createEl('li', { text: 'Copy the following JSON configuration:' });
        
        const config = this.getConfiguration('linux');
        
        const codeBlock = linuxContent.createEl('pre');
        codeBlock.createEl('code', {
            text: JSON.stringify(config, null, 2)
        });
        
        // Copy button
        const copyButton = linuxContent.createEl('button', {
            text: 'Copy Configuration',
            cls: 'mod-cta'
        });
        
        copyButton.onclick = () => {
            navigator.clipboard.writeText(JSON.stringify(config, null, 2));
            copyButton.setText('Copied!');
            setTimeout(() => copyButton.setText('Copy Configuration'), 2000);
        };
        
        // Remaining steps
        steps.createEl('li', { text: 'Paste this into your config file, replacing any existing content' });
        steps.createEl('li', { text: 'Save the file and restart Claude Desktop' });
    }
    
    /**
     * Show a specific tab
     * @param tabId Tab ID to show
     */
    private showTab(tabId: string) {
        // Update active tab
        this.activeTab = tabId;
        
        // Update button styles
        for (const [id, button] of Object.entries(this.tabButtons)) {
            if (id === tabId) {
                button.addClass('mcp-tab-active');
            } else {
                button.removeClass('mcp-tab-active');
            }
        }
        
        // Show/hide content
        for (const [id, content] of Object.entries(this.tabContents)) {
            content.style.display = id === tabId ? 'block' : 'none';
        }
    }
    
    /**
     * Add CSS styles for the modal
     */
    private addStyles() {
        const { contentEl } = this;
        
        // Add styles to the document
        const styleEl = contentEl.createEl('style');
        styleEl.textContent = `
            .mcp-config-tabs {
                margin-bottom: 20px;
            }
            
            .mcp-tab-buttons {
                display: flex;
                border-bottom: 1px solid var(--background-modifier-border);
                margin-bottom: 10px;
            }
            
            .mcp-tab-button {
                padding: 8px 16px;
                background: transparent;
                border: none;
                cursor: pointer;
                border-bottom: 2px solid transparent;
                margin-right: 10px;
            }
            
            .mcp-tab-button:hover {
                background-color: var(--background-modifier-hover);
            }
            
            .mcp-tab-active {
                border-bottom: 2px solid var(--interactive-accent);
                font-weight: bold;
            }
            
            .mcp-tab-content {
                margin-bottom: 20px;
            }
            
            pre {
                background-color: var(--background-secondary);
                padding: 10px;
                border-radius: 5px;
                overflow-x: auto;
                margin-bottom: 10px;
            }
            
            code {
                font-family: monospace;
            }
        `;
    }
    
    /**
     * Get the configuration object for a specific OS
     * @param os Operating system (windows, mac, linux)
     * @returns Configuration object
     */
    private getConfiguration(os: string) {
        const connectorPath = this.getConnectorPath(os);
        
        // Create base configuration
        const config = {
            mcpServers: {
                "claudesidian-mcp": {
                    command: "node",
                    args: [connectorPath]
                }
            }
        };
        
        // Add settings if available
        if (this.settings) {
            // Add any settings-specific configuration here if needed
            // For example, could include enabled agents or other settings
        }
        
        return config;
    }
    
    /**
     * Get the connector path for a specific OS
     * @param os Operating system (windows, mac, linux)
     * @returns Connector path
     */
    private getConnectorPath(os: string): string {
        // Get the vault's root path
        const vaultRoot = (this.app.vault.adapter as any).basePath;
        
        // Build the path based on the OS
        if (os === 'windows') {
            return path.join(vaultRoot, '.obsidian', 'plugins', 'claudesidian-mcp', 'connector.js');
        } else if (os === 'mac') {
            return path.join(vaultRoot, '.obsidian', 'plugins', 'claudesidian-mcp', 'connector.js');
        } else if (os === 'linux') {
            return path.join(vaultRoot, '.obsidian', 'plugins', 'claudesidian-mcp', 'connector.js');
        }
        
        // Default to a generic path
        return path.join(vaultRoot, '.obsidian', 'plugins', 'claudesidian-mcp', 'connector.js');
    }
    
    /**
     * Get the Windows config path
     * @returns Windows config path
     */
    private getWindowsConfigPath(): string {
        return path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
    }
    
    /**
     * Get the Mac config path
     * @returns Mac config path
     */
    private getMacConfigPath(): string {
        return path.join(process.env.HOME || '', 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    }
    
    /**
     * Get the Linux config path
     * @returns Linux config path
     */
    private getLinuxConfigPath(): string {
        return path.join(process.env.HOME || '', '.config', 'Claude', 'claude_desktop_config.json');
    }
    
    /**
     * Called when the modal is closed
     */
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}