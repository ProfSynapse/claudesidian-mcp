import { Plugin } from 'obsidian';
import { ClaudesidianMCPServer } from './mcp/server';
import { StatusBar } from './components/StatusBar';
import { MemoryManager } from './services/MemoryManager';
import { ToolRegistry } from './tools/ToolRegistry';
import { VaultManager } from './services/VaultManager';
import { MCPSettings, DEFAULT_SETTINGS } from './types';
import { SettingsTab } from './components/SettingsTab';
import { EventManager } from './services/EventManager';
import { IndexManager } from './services/IndexManager';

export default class ClaudesidianMCPPlugin extends Plugin {
    private mcpServer: ClaudesidianMCPServer;
    private statusBar: StatusBar;
    private toolRegistry: ToolRegistry;
    private memoryManager: MemoryManager;
    public vaultManager: VaultManager;
    settings: MCPSettings;

    private initStage = {
        CORE: 'core',
        FEATURES: 'features',
        SERVER: 'server'
    } as const;

    private currentStage: keyof typeof this.initStage = 'CORE';

    private async initializeCoreComponents(): Promise<void> {
        console.debug('ClaudesidianMCPPlugin: Initializing essential components...');
        
        if (!this.app.workspace || !this.app.vault) {
            throw new Error('Essential Obsidian components not available');
        }

        // Only load settings and create essential managers
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.vaultManager = new VaultManager(this.app);
        
        console.debug('ClaudesidianMCPPlugin: Essential components initialized');
    }

    private async initializeFeatures(eventManager: EventManager): Promise<void> {
        console.debug('ClaudesidianMCPPlugin: Initializing features...');
        
        // Create both instances but don't pass MemoryManager dependency yet
        let memoryManagerTemp: any = {};
        
        const indexManager = new IndexManager(
            this.vaultManager,
            eventManager,
            this.settings,
            { memoryManager: memoryManagerTemp }
        );

        this.memoryManager = new MemoryManager(
            this.vaultManager,
            eventManager,
            indexManager,
            this.settings
        );
        
        // Now update the temporary reference to point to the real MemoryManager
        Object.assign(memoryManagerTemp, this.memoryManager);

        this.toolRegistry = new ToolRegistry(
            this.app,
            this,
            this.vaultManager,
            this.memoryManager,
            indexManager,
            eventManager
        );

        // Start non-blocking folder creation
        this.initializeFolderStructure().catch(error => 
            console.error('Error creating folders:', error)
        );

        console.debug('ClaudesidianMCPPlugin: Basic features initialized');
    }

    private async initializeServer(): Promise<void> {
        console.debug('ClaudesidianMCPPlugin: Initializing server components...');
        
        // Create MCP server
        this.mcpServer = new ClaudesidianMCPServer(
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
        
        console.debug('ClaudesidianMCPPlugin: Server components initialized');
    }

    async onload() {
        console.log('ClaudesidianMCPPlugin: Starting minimal initialization');
        
        try {
            // Phase 1: Essential Setup
            this.currentStage = 'CORE';
            await this.initializeCoreComponents();
            const eventManager = new EventManager();

            // Register status bar early for user feedback
            this.initializeStatusBar();
            this.statusBar.setStatus('initializing');

            // Register minimal commands
            this.addSettingTab(new SettingsTab(this.app, this));
            this.registerCommands();

            // Phase 2: Deferred Initialization
            this.app.workspace.onLayoutReady(() => {
                this.completeInitialization(eventManager).catch(error => {
                    console.error('Error during post-layout initialization:', error);
                    this.statusBar.setStatus('error');
                });
            });

            console.log('ClaudesidianMCPPlugin: Essential initialization complete');
            
        } catch (error: any) {
            console.error('ClaudesidianMCPPlugin: Error during initialization', {
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

    private async completeInitialization(eventManager: EventManager) {
        try {
            console.debug('ClaudesidianMCPPlugin: Starting post-layout initialization');
            
            // Phase 2a: Feature Initialization
            this.currentStage = 'FEATURES';
            await this.initializeFeatures(eventManager);
            
            // Phase 2b: Server Initialization
            this.currentStage = 'SERVER';
            await this.initializeServer();
            
            this.statusBar.setStatus('running');
            console.log('ClaudesidianMCPPlugin: Full initialization complete');
        } catch (error) {
            console.error('Error during post-layout initialization:', error);
            this.statusBar.setStatus('error');
            throw error;
        }
    }

    public async initializeFolderStructure() {
        // Create all folders concurrently for better performance
        const folderCreationPromises = [
            this.createFolderIfNeeded(this.settings.rootPath),
            this.createFolderIfNeeded(`${this.settings.rootPath}/inbox`),
            this.settings.enabledMemory && this.createFolderIfNeeded(`${this.settings.rootPath}/memory`),
            this.settings.enabledReasoning && this.createFolderIfNeeded(`${this.settings.rootPath}/reasoning`)
        ].filter(Boolean); // Remove undefined promises from disabled features

        // Wait for all folder creations to complete
        await Promise.all(folderCreationPromises);
    }

    private async createFolderIfNeeded(path: string): Promise<void> {
        try {
            if (!await this.vaultManager.folderExists(path)) {
                await this.vaultManager.createFolder(path);
            }
        } catch (error) {
            console.error(`Error creating folder ${path}:`, error);
            // Don't throw - allow other operations to continue
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
                await this.vaultManager.cleanupEmptyFolders(sourceRootPath);
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
                console.log('ClaudesidianMCPPlugin: start-mcp-server command triggered');
                try {
                this.statusBar.setStatus('starting');
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
                console.log('ClaudesidianMCPPlugin: stop-mcp-server command triggered');
                try {
            this.statusBar.setStatus('stopping');
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
        console.log('MCP Plugin: Saving settings');
        await this.saveData(this.settings);
        console.log('MCP Plugin: Settings saved');
    }

    async onunload() {
        console.log('ClaudesidianMCPPlugin: onunload started');
        try {
            await this.mcpServer?.stop();
        } catch (error: any) {
            console.error('ClaudesidianMCPPlugin: Error during onunload', error);
        }
    }
}
