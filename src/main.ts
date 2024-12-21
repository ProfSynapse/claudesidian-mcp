import { Plugin } from 'obsidian';
import { ObsidianMCPServer } from './mcp/server';
import { StatusBar } from './components/StatusBar';
import { MemoryManager } from './services/MemoryManager';
import { ReasoningManager } from './services/ReasoningManager';
import { SearchEngine } from './services/SearchEngine';
import { ToolRegistry } from './tools/ToolRegistry';
import { VaultManager } from './services/VaultManager';
import { MCPSettings, DEFAULT_SETTINGS } from './types';
import { SettingsTab } from './components/SettingsTab';  // Add this import

export default class ObsidianMCPPlugin extends Plugin {
    private mcpServer: ObsidianMCPServer;
    private statusBar: StatusBar;
    private toolRegistry: ToolRegistry;
    private memoryManager: MemoryManager;
    private reasoningManager: ReasoningManager;
    private searchEngine: SearchEngine;
    settings: MCPSettings;

    async onload() {
        console.log('MCP Plugin: onload started'); // Log start of onload
        try {
            console.log('Loading MCP plugin');

            // Load settings
            this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
            console.log('MCP Plugin: Settings loaded'); // Log after settings are loaded

            const vaultManager = new VaultManager(this.app);

            // Initialize SearchEngine first since MemoryManager depends on it
            this.searchEngine = new SearchEngine(this.app.vault, vaultManager);

            // Initialize service managers with required dependencies
            this.memoryManager = new MemoryManager(vaultManager, this.searchEngine);
            this.reasoningManager = new ReasoningManager(vaultManager);

            // Initialize Tool Registry
            this.toolRegistry = new ToolRegistry(
                this.app,
                vaultManager,
                this.memoryManager,
                this.reasoningManager
            );

            // Add this after initializing settings
            this.addSettingTab(new SettingsTab(this.app, this));

            // Check if plugin was launched with MCP server flag
            const params = new URLSearchParams(window.location.search);
            if (params.has('mcp-server')) {
                // Start server immediately in MCP mode
                this.mcpServer = new ObsidianMCPServer(this.app, this.toolRegistry);
                await this.mcpServer.start();
                console.log('MCP Plugin: MCP server started'); // Log after MCP server starts
                return;
            }

            // Initialize MCP server
            this.mcpServer = new ObsidianMCPServer(this.app, this.toolRegistry);
            console.log('MCP Plugin: MCP server initialized'); // Log after MCP server is initialized
            
            // Initialize status bar
            this.statusBar = new StatusBar(this);
            const statusBarItem = this.addStatusBarItem();
            statusBarItem.appendChild(this.statusBar.getElement());

            // Add commands
            this.addCommand({
                id: 'start-mcp-server',
                name: 'Start MCP Server',
                callback: async () => {
                    try {
                        await this.mcpServer.start();
                        this.statusBar.setStatus('running');
                    } catch (error: any) {
                        console.error('Failed to start MCP server:', error);
                        this.statusBar.setStatus('error');
                    }
                }
            });

            this.addCommand({
                id: 'stop-mcp-server',
                name: 'Stop MCP Server',
                callback: async () => {
                    try {
                        await this.mcpServer.stop();
                        this.statusBar.setStatus('stopped');
                    } catch (error: any) {
                        console.error('Failed to stop MCP server:', error);
                        this.statusBar.setStatus('error');
                    }
                }
            });

            // Start server if auto-start is enabled
            if (this.settings.autoStart) {
                await this.mcpServer.start();
                console.log('MCP Plugin: MCP server started');
            }
        } catch (error: any) {
            console.error('MCP Plugin: Error during onload', error);
        }
    }

    async saveSettings() {
        console.log('MCP Plugin: Saving settings'); // Log settings saving
        await this.saveData(this.settings);
        console.log('MCP Plugin: Settings saved'); // Confirm save
    }

    async onunload() {
        console.log('MCP Plugin: onunload started'); // Log start of onunload
        try {
            if (this.mcpServer) {
                await this.mcpServer.stop();
                console.log('MCP Plugin: MCP server stopped'); // Log after MCP server stops
            }
        } catch (error: any) {
            console.error('MCP Plugin: Error during onunload', error); // Log any errors
        }
    }
}