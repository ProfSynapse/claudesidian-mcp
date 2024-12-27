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
    public vaultManager: VaultManager; // Add this line
    settings: MCPSettings;

    private async waitForObsidian(): Promise<void> {
        // Wait for workspace and file explorer to be ready
        let attempts = 0;
        while (attempts < 50) {
            if (this.app.workspace.layoutReady && 
                this.app.workspace.getLeavesOfType('file-explorer').length > 0) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        throw new Error('Timeout waiting for Obsidian to initialize');
    }

    async onload() {
        console.log('BridgeMCPPlugin: onload started');
        try {
            // Load settings first
            this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
            
            // Initialize VaultManager before anything else
            this.vaultManager = new VaultManager(this.app);
            
            // Initialize remaining services
            const eventManager = new EventManager();
            const indexManager = new IndexManager(this.vaultManager, eventManager, this.settings);
            
            // Create memory manager
            this.memoryManager = new MemoryManager(
                this.vaultManager, 
                eventManager,
                this.settings
            );

            // Only create initial folder structure if it doesn't exist yet
            this.app.workspace.onLayoutReady(async () => {
                const rootExists = await this.vaultManager.folderExists(this.settings.rootPath);
                if (!rootExists) {
                    await this.initializeFolderStructure();
                }
            });
            
            // Initialize remaining components
            this.toolRegistry = new ToolRegistry(
                this.app,
                this,
                this.vaultManager,
                this.memoryManager,
                indexManager  // Add this parameter
            );
            this.mcpServer = new BridgeMCPServer(
                this.app, 
                this.toolRegistry,
                this.vaultManager,
                this.settings
            );
            
            // Add settings tab and initialize UI
            this.addSettingTab(new SettingsTab(this.app, this));
            this.initializeStatusBar();
            this.registerCommands();

            // Start server
            await this.mcpServer.start();
        } catch (error: any) {
            console.error('BridgeMCPPlugin: Error during onload', error);
        }
    }

    public async initializeFolderStructure() {
        try {
            // Create root folder if it doesn't exist
            const rootExists = await this.vaultManager.folderExists(this.settings.rootPath);
            if (!rootExists) {
                await this.vaultManager.createFolder(this.settings.rootPath);
            }

            // Create subfolders only if their features are enabled
            if (this.settings.enabledMemory) {
                const memoryPath = `${this.settings.rootPath}/memory`;
                const memoryExists = await this.vaultManager.folderExists(memoryPath);
                if (!memoryExists) {
                    await this.vaultManager.createFolder(memoryPath);
                }
            }

            if (this.settings.enabledReasoning) {
                const reasoningPath = `${this.settings.rootPath}/reasoning`;
                const reasoningExists = await this.vaultManager.folderExists(reasoningPath);
                if (!reasoningExists) {
                    await this.vaultManager.createFolder(reasoningPath);
                }
            }
        } catch (error) {
            console.error('Error initializing folder structure:', error);
        }
    }

    public async migrateAndInitializeFolders(oldRootPath?: string): Promise<void> {
        try {
            const newRootPath = this.settings.rootPath;
            // Use provided oldRootPath or try to get it from settings
            const sourceRootPath = oldRootPath || await this.getOldPath();

            console.log(`Migrating from ${sourceRootPath} to ${newRootPath}`);

            if (sourceRootPath === newRootPath) {
                console.log('Paths are the same, no migration needed');
                await this.initializeFolderStructure();
                return;
            }

            const oldPathExists = await this.vaultManager.folderExists(sourceRootPath);
            if (oldPathExists) {
                // Store old paths
                const oldMemoryPath = `${sourceRootPath}/memory`;
                const oldReasoningPath = `${sourceRootPath}/reasoning`;
                const hadMemory = await this.vaultManager.folderExists(oldMemoryPath);
                const hadReasoning = await this.vaultManager.folderExists(oldReasoningPath);

                console.log(`Old folder exists: ${sourceRootPath}`);
                console.log(`Memory exists: ${hadMemory}, Reasoning exists: ${hadReasoning}`);

                // Create new structure first
                await this.initializeFolderStructure();

                // Migrate contents
                if (hadMemory && this.settings.enabledMemory) {
                    const newMemoryPath = `${newRootPath}/memory`;
                    console.log(`Moving memory from ${oldMemoryPath} to ${newMemoryPath}`);
                    await this.vaultManager.moveContents(oldMemoryPath, newMemoryPath);
                }

                if (hadReasoning && this.settings.enabledReasoning) {
                    const newReasoningPath = `${newRootPath}/reasoning`;
                    console.log(`Moving reasoning from ${oldReasoningPath} to ${newReasoningPath}`);
                    await this.vaultManager.moveContents(oldReasoningPath, newReasoningPath);
                }

                // Clean up old folders
                if (hadMemory) await this.vaultManager.cleanupEmptyFolders(oldMemoryPath);
                if (hadReasoning) await this.vaultManager.cleanupEmptyFolders(oldReasoningPath);
                await this.vaultManager.cleanupEmptyFolders(sourceRootPath); // Use sourceRootPath instead of oldRootPath
            } else {
                console.log('No old folder found, creating new structure');
                await this.initializeFolderStructure();
            }
        } catch (error) {
            console.error('Error during folder migration:', error);
            throw error;
        }
    }

    private async getOldPath(): Promise<string> {
        try {
            const settingsPath = '.obsidian/plugins/bridge-mcp/data.json';
            const exists = await this.app.vault.adapter.exists(settingsPath);
            
            if (exists) {
                const content = await this.app.vault.adapter.read(settingsPath);
                const data = JSON.parse(content);
                return data.rootPath || DEFAULT_SETTINGS.rootPath;
            }
        } catch (e) {
            console.log('Could not read old settings:', e);
        }
        return DEFAULT_SETTINGS.rootPath;
    }

    private registerVaultEvents() {
        // Use 'layout-change' instead of 'layout-ready'
        this.app.workspace.onLayoutReady(() => {
            this.checkAndCreateFolders();
        });

        // Listen for file changes instead of 'indexed'
        this.registerEvent(
            this.app.vault.on('create', () => {
                this.checkAndCreateFolders();
            })
        );
    }

    private async checkAndCreateFolders() {
        if (!this.app.workspace.layoutReady) return;

        try {
            const rootExists = await this.vaultManager.folderExists(this.settings.rootPath);
            if (!rootExists) {
                await this.vaultManager.createFolder(this.settings.rootPath);
            }

            if (this.settings.enabledMemory) {
                const memoryPath = `${this.settings.rootPath}/memory`;
                const memoryExists = await this.vaultManager.folderExists(memoryPath);
                if (!memoryExists) {
                    await this.vaultManager.createFolder(memoryPath);
                }
            }

            if (this.settings.enabledReasoning) {
                const reasoningPath = `${this.settings.rootPath}/reasoning`;
                const reasoningExists = await this.vaultManager.folderExists(reasoningPath);
                if (!reasoningExists) {
                    await this.vaultManager.createFolder(reasoningPath);
                }
            }
        } catch (error) {
            console.error('Error checking/creating folders:', error);
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