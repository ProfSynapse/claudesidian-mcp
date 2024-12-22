import { Plugin } from 'obsidian';
import { BridgeMCPServer } from './mcp/server';
import { StatusBar } from './components/StatusBar';
import { MemoryManager } from './services/MemoryManager';
import { ReasoningManager } from './services/ReasoningManager';
import { SearchEngine } from './services/SearchEngine';
import { ToolRegistry } from './tools/ToolRegistry';
import { VaultManager } from './services/VaultManager';
import { BridgeMCPSettings, DEFAULT_SETTINGS } from './settings';
import { SettingsTab } from './components/SettingsTab';
import { EventManager } from './services/EventManager';
import { IndexManager } from './services/IndexManager';

export default class BridgeMCPPlugin extends Plugin {
    private mcpServer: BridgeMCPServer;
    private statusBar: StatusBar;
    private toolRegistry: ToolRegistry;
    private memoryManager: MemoryManager;
    private reasoningManager: ReasoningManager;
    private searchEngine: SearchEngine;
    settings: BridgeMCPSettings;  // Changed from MCPSettings to BridgeMCPSettings

    async onload() {
        console.log('BridgeMCPPlugin: onload started');
        try {
            // Load settings
            this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
            
            // Initialize managers
            const vaultManager = new VaultManager(this.app);
            this.searchEngine = new SearchEngine(this.app.vault, vaultManager);
            
            const eventManager = new EventManager();
            const indexManager = new IndexManager(vaultManager, eventManager, this.settings);
            
            this.memoryManager = new MemoryManager(vaultManager, this.searchEngine, eventManager);
            this.reasoningManager = new ReasoningManager(vaultManager, this.settings, eventManager);
            
            // Initialize Tool Registry and MCP Server
            this.toolRegistry = new ToolRegistry(
                this.app,
                vaultManager,
                this.memoryManager,
                this.reasoningManager,
                this.searchEngine
            );

            this.mcpServer = new BridgeMCPServer(this.app, this.toolRegistry);
            
            // Add settings tab and initialize UI
            this.addSettingTab(new SettingsTab(this.app, this));
            this.initializeStatusBar();
            this.registerCommands();

            // Start server if auto-start is enabled
            if (this.settings.autoStart) {
                await this.mcpServer.start();
            }
        } catch (error: any) {
            console.error('BridgeMCPPlugin: Error during onload', error);
        }
    }

    private initializeStatusBar() {
        this.statusBar = new StatusBar(this);
        const statusBarItem = this.addStatusBarItem();
        statusBarItem.appendChild(this.statusBar.getElement());
    }

    private registerCommands() {
        this.addCommand({
            id: 'start-mcp-server',
            name: 'Start MCP Server',
            callback: async () => {
                console.log('BridgeMCPPlugin: start-mcp-server command triggered');
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
                console.log('BridgeMCPPlugin: stop-mcp-server command triggered');
                try {
                    await this.mcpServer.stop();
                    this.statusBar.setStatus('stopped');
                } catch (error: any) {
                    console.error('Failed to stop MCP server:', error);
                    this.statusBar.setStatus('error');
                }
            }
        });
    }

    async saveSettings() {
        console.log('MCP Plugin: Saving settings'); // Log settings saving
        await this.saveData(this.settings);
        console.log('MCP Plugin: Settings saved'); // Confirm save
    }

    async onunload() {
        console.log('BridgeMCPPlugin: onunload started');
        try {
            await this.mcpServer?.stop();
        } catch (error: any) {
            console.error('BridgeMCPPlugin: Error during onunload', error);
        }
    }
}