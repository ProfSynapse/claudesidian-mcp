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

    private initStage = {
        CORE: 'core',
        FEATURES: 'features',
        SERVER: 'server'
    } as const;

    private currentStage: keyof typeof this.initStage = 'CORE';

    private async initializeCoreComponents(): Promise<void> {
        console.debug('BridgeMCPPlugin: Initializing core components...');
        
        if (!this.app.workspace) {
            throw new Error('Workspace not available during core initialization');
        }

        // Load settings
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        
        if (!this.app.vault) {
            throw new Error('Vault not available during core initialization');
        }

        // Initialize vault manager
        this.vaultManager = new VaultManager(this.app);
        
        console.debug('BridgeMCPPlugin: Core components initialized');
    }

    private async initializeFeatures(eventManager: EventManager): Promise<void> {
        console.debug('BridgeMCPPlugin: Initializing features...');
        
        // Initialize base folder structure
        await this.initializeFolderStructure();
        
        // Create memory manager
        this.memoryManager = new MemoryManager(
            this.vaultManager,
            eventManager,
            this.settings
        );

        // Wait for file operations to settle
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Create index manager
        const indexManager = new IndexManager(
            this.vaultManager,
            eventManager,
            this.settings,
            { memoryManager: this.memoryManager }
        );

        // Initialize tool registry
        this.toolRegistry = new ToolRegistry(
            this.app,
            this,
            this.vaultManager,
            this.memoryManager,
            indexManager
        );

        console.debug('BridgeMCPPlugin: Features initialized');
    }

    private async initializeServer(): Promise<void> {
        console.debug('BridgeMCPPlugin: Initializing server components...');
        
        // Create MCP server
        this.mcpServer = new BridgeMCPServer(
            this.app,
            this.toolRegistry,
            this.vaultManager,
            this.settings
        );

        // Initialize UI components
        this.addSettingTab(new SettingsTab(this.app, this));
        this.initializeStatusBar();
        this.registerCommands();

        // Start server
        await this.mcpServer.start();
        
        console.debug('BridgeMCPPlugin: Server components initialized');
    }

    async onload() {
        console.log('BridgeMCPPlugin: onload started');
        
        try {
            this.currentStage = 'CORE';
            await this.initializeCoreComponents();
            
            // Create event manager for inter-component communication
            const eventManager = new EventManager();

            this.currentStage = 'FEATURES';
            // Set up staged initialization with timeout
            const timeoutMs = 10000; // 10 second timeout
            const layoutReadyPromise = new Promise<void>((resolve) => {
                if (this.app.workspace.layoutReady) {
                    resolve();
                    return;
                }

                // Register event using Obsidian's event system
                const eventRef = this.registerEvent(
                    this.app.workspace.on('layout-change', () => {
                        if (this.app.workspace.layoutReady) {
                            resolve();
                        }
                    })
                );

                // Timeout fallback
                setTimeout(() => {
                    // Event will be automatically cleaned up by Obsidian's plugin system
                    console.warn('BridgeMCPPlugin: Layout ready timeout - proceeding with limited functionality');
                    resolve();
                }, timeoutMs);
            });

            // Wait for layout or timeout
            await layoutReadyPromise;
            
            // Initialize features
            await this.initializeFeatures(eventManager);
            
            this.currentStage = 'SERVER';
            // Start server and UI components
            await this.initializeServer();
            
            console.log('BridgeMCPPlugin: Initialization complete');
            
        } catch (error: any) {
            console.error('BridgeMCPPlugin: Error during initialization', {
                error: error.message || error,
                failedStage: this.initStage[this.currentStage],
                workspaceStatus: {
                    exists: !!this.app.workspace,
                    layoutReady: this.app.workspace?.layoutReady
                },
                vaultStatus: {
                    exists: !!this.app.vault,
                    adapter: !!this.app.vault?.adapter
                }
            });
            throw error;
        }
    }

    public async initializeFolderStructure() {
        try {
            // Create root folder if it doesn't exist
            const rootExists = await this.vaultManager.folderExists(this.settings.rootPath);
            if (!rootExists) {
                await this.vaultManager.createFolder(this.settings.rootPath);
            }

            // Create inbox folder for default content
            const inboxPath = `${this.settings.rootPath}/inbox`;
            const inboxExists = await this.vaultManager.folderExists(inboxPath);
            if (!inboxExists) {
                await this.vaultManager.createFolder(inboxPath);
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
            const settingsPath = '.obsidian/plugins/claudesidian-mcp/data.json';
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
