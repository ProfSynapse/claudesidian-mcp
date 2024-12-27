import { Plugin } from 'obsidian';
import { BridgeMCPServer } from './mcp/server';
import { StatusBar } from './components/StatusBar';
import { MemoryManager } from './services/MemoryManager';
import { ToolRegistry } from './tools/ToolRegistry';
import { VaultManager } from './services/VaultManager';
import { MCPSettings, DEFAULT_SETTINGS } from './types';
import { SettingsTab } from './components/SettingsTab';
import { EventManager } from './services/EventManager';
import { IndexManager } from './services/IndexManager';

export default class BridgeMCPPlugin extends Plugin {
    private mcpServer: BridgeMCPServer;
    private statusBar: StatusBar;
    private toolRegistry: ToolRegistry;
    private memoryManager: MemoryManager;
    settings: MCPSettings;

    async onload() {
        console.log('BridgeMCPPlugin: onload started');
        try {
            // Load settings
            this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
            
            // Initialize core managers
            const vaultManager = new VaultManager(this.app);
            const eventManager = new EventManager();
            const indexManager = new IndexManager(vaultManager, eventManager, this.settings);
            
            // Create memory manager
            this.memoryManager = new MemoryManager(
                vaultManager, 
                eventManager,
                this.settings
            );
            
            // Initialize Tool Registry with memory manager
            this.toolRegistry = new ToolRegistry(
                this.app,
                this, // Add plugin instance
                vaultManager,
                this.memoryManager
            );
            
            // Initialize MCP Server
            this.mcpServer = new BridgeMCPServer(this.app, this.toolRegistry);
            
            // Add settings tab and initialize UI
            this.addSettingTab(new SettingsTab(this.app, this));
            this.initializeStatusBar();
            this.registerCommands();

            // Always start server when plugin loads
            await this.mcpServer.start();
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