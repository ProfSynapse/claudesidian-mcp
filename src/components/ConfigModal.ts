import { App, Modal, Platform, Setting } from 'obsidian';
import * as path from 'path';
import { Settings } from '../settings';
import { sanitizeVaultName } from '../utils/vaultUtils';

/**
 * Configuration modal for the plugin
 * Provides setup instructions for different operating systems
 */
export class ConfigModal extends Modal {
    private activeTab: string = 'windows';
    private tabButtons: Record<string, HTMLElement> = {};
    private tabContents: Record<string, HTMLElement> = {};
    private settings?: Settings;
    private isFirstTimeSetup: boolean = true;
    
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

        // Add configuration type toggle
        const toggleContainer = contentEl.createDiv({ cls: 'mcp-config-toggle' });
        toggleContainer.createEl('span', { text: 'Configuration Type:', cls: 'mcp-config-label' });
        const toggleComponent = new Setting(toggleContainer)
            .setName('First Time Setup')
            .setDesc('Toggle between first-time setup and adding to existing configuration')
            .addToggle(toggle => toggle
                .setValue(this.isFirstTimeSetup)
                .onChange(value => {
                    this.isFirstTimeSetup = value;
                    this.updateConfigDisplay();
                }));

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
        const windowsContent = container.createDiv({ cls: 'mcp-tab-content hidden' });
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
        steps.createEl('li', { text: this.isFirstTimeSetup
            ? 'Paste this into your config file, replacing any existing content'
            : 'Add this to the mcpServers section of your existing config file'
        });
        steps.createEl('li', { text: 'Save the file and restart Claude Desktop' });
    }
    
    /**
     * Create Mac tab content
     * @param container Container element
     */
    private createMacTab(container: HTMLElement) {
        const macContent = container.createDiv({ cls: 'mcp-tab-content hidden' });
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
        steps.createEl('li', { text: this.isFirstTimeSetup
            ? 'Paste this into your config file, replacing any existing content'
            : 'Add this to the mcpServers section of your existing config file'
        });
        steps.createEl('li', { text: 'Save the file and restart Claude Desktop' });
    }
    
    /**
     * Create Linux tab content
     * @param container Container element
     */
    private createLinuxTab(container: HTMLElement) {
        const linuxContent = container.createDiv({ cls: 'mcp-tab-content hidden' });
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
        steps.createEl('li', { text: this.isFirstTimeSetup
            ? 'Paste this into your config file, replacing any existing content'
            : 'Add this to the mcpServers section of your existing config file'
        });
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
            if (id === tabId) {
                content.removeClass('hidden');
                content.addClass('active');
            } else {
                content.addClass('hidden');
                content.removeClass('active');
            }
        }
    }
    
    /**
     * Add CSS styles for the modal (now implemented in styles.css)
     */
    private addStyles() {
        // All styles are now in the global styles.css file
    }
    
    /**
     * Get the configuration object for a specific OS
     * @param os Operating system (windows, mac, linux)
     * @returns Configuration object
     */
    /**
     * Update the configuration display based on selected mode
     */
    private updateConfigDisplay() {
        // Update all tab contents with new configuration
        Object.keys(this.tabContents).forEach(tabId => {
            const content = this.tabContents[tabId];
            const codeBlock = content.querySelector('pre code');
            if (codeBlock) {
                const config = this.getConfiguration(tabId);
                codeBlock.textContent = JSON.stringify(config, null, 2);
            }
        });
    }

    /**
     * Get the configuration object for a specific OS
     * @param os Operating system (windows, mac, linux)
     * @returns Configuration object
     */
    /**
     * Gets a sanitized version of the vault name suitable for use in a configuration key
     * Uses the centralized sanitizeVaultName utility function
     * @returns Sanitized vault name
     */
    private getSanitizedVaultName(): string {
        // Get the vault name from the app
        const vaultName = this.app.vault.getName();
        
        // Use the centralized utility function to sanitize the vault name
        return sanitizeVaultName(vaultName);
    }
    
    /**
     * Get the configuration object for a specific OS
     * @param os Operating system (windows, mac, linux)
     * @returns Configuration object
     */
    private getConfiguration(os: string) {
        const connectorPath = this.getConnectorPath(os);
        
        // Get the sanitized vault name for the server key
        const sanitizedVaultName = this.getSanitizedVaultName();
        
        // Create the server key with vault name
        const serverKey = `claudesidian-mcp-${sanitizedVaultName}`;
        
        // Create server configuration
        const serverConfig = {
            command: "node",
            args: [connectorPath]
        };
        
        // Return different configurations based on setup type
        if (this.isFirstTimeSetup) {
            return {
                mcpServers: {
                    [serverKey]: serverConfig
                }
            };
        } else {
            return {
                [serverKey]: serverConfig
            };
        }
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
