import { Plugin } from 'obsidian';
import { ClaudesidianMCPServer } from './mcp/server';
import { StatusBar } from './components/StatusBar';
import { ToolRegistry } from './tools/ToolRegistry';
import { VaultManager } from './services/VaultManager';
import { MCPSettings, DEFAULT_SETTINGS } from './types';
import { SettingsTab } from './components/SettingsTab';
import { EventManager } from './services/EventManager';
import { ServiceProvider } from './services/ServiceProvider';
import { IVaultManager } from './tools/interfaces/ToolInterfaces';
import { VaultManagerFacade } from './services/VaultManagerFacade';

export default class ClaudesidianMCPPlugin extends Plugin {
    private mcpServer: ClaudesidianMCPServer;
    private statusBar: StatusBar;
    private toolRegistry: ToolRegistry;
    public vaultManager: VaultManager;
    settings: MCPSettings;

    private initStage = {
        CORE: 'core',
        FEATURES: 'features',
        SERVER: 'server'
    } as const;

    private currentStage: keyof typeof this.initStage = 'CORE';

    private serviceProvider: ServiceProvider;

    private async initializeCoreComponents(): Promise<void> {
        console.debug('ClaudesidianMCPPlugin: Initializing essential components...');
        
        if (!this.app.workspace || !this.app.vault) {
            throw new Error('Essential Obsidian components not available');
        }

        // Only load settings and create essential managers
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        
        // Create service provider
        this.serviceProvider = new ServiceProvider(this.app, this);
        
        // Get vault manager from service provider
        this.vaultManager = this.serviceProvider.get<VaultManager>('vaultManager');
        
        console.debug('ClaudesidianMCPPlugin: Essential components initialized');
    }

    private async initializeFeatures(eventManager: EventManager): Promise<void> {
        console.debug('ClaudesidianMCPPlugin: Initializing features...');
        
        try {
            // First ensure folder structure exists
            console.debug('ClaudesidianMCPPlugin: Creating folder structure');
            await this.initializeFolderStructure();
            console.debug('ClaudesidianMCPPlugin: Folder structure created');

            // Initialize tool registry using service provider
            this.toolRegistry = this.serviceProvider.initializeToolRegistry(
                eventManager
            );
            
            // Register tools
            this.serviceProvider.registerTools(
                this.toolRegistry,
                eventManager
            );

            // Configure AI adapter
            this.serviceProvider.configureAIAdapter();

            console.debug('ClaudesidianMCPPlugin: Basic features initialized');
        } catch (error) {
            console.error('Error initializing features:', error);
            throw error;
        }
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
        
        // Register MCP server with service provider
        this.serviceProvider.register('mcpServer', this.mcpServer);

        // Initialize UI components
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
            
            // Create event manager
            const eventManager = new EventManager();
            
            // Register event manager with service provider
            this.serviceProvider.register('eventManager', eventManager);

            // Register status bar early for user feedback
            this.initializeStatusBar();
            this.statusBar.setStatus('initializing');

            // Register minimal commands and vault events
            this.addSettingTab(new SettingsTab(this.app, this));
            this.registerCommands();
            this.registerVaultEvents(); // Register vault events to ensure folders are created

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
            this.createFolderIfNeeded(this.settings.templateFolderPath)
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
            // Simply initialize the folder structure without complex migration
            console.log('Initializing folder structure');
            await this.initializeFolderStructure();
        } catch (error) {
            console.error('Error during folder initialization:', error);
            throw error;
        }
    }

    private async getOldPath(): Promise<string> {
        try {
            // Try to read settings from claudesidian-mcp first
            const newSettingsPath = '.obsidian/plugins/claudesidian-mcp/data.json';
            const newExists = await this.app.vault.adapter.exists(newSettingsPath);
            
            if (newExists) {
                const content = await this.app.vault.adapter.read(newSettingsPath);
                const data = JSON.parse(content);
                return data.rootPath || DEFAULT_SETTINGS.rootPath;
            }
            
            // If not found, try to read from bridge-mcp (for migration)
            const oldSettingsPath = '.obsidian/plugins/bridge-mcp/data.json';
            const oldExists = await this.app.vault.adapter.exists(oldSettingsPath);
            
            if (oldExists) {
                console.log('Found old bridge-mcp settings, migrating...');
                const content = await this.app.vault.adapter.read(oldSettingsPath);
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
            // Create root folder if it doesn't exist
            const rootExists = await this.vaultManager.folderExists(this.settings.rootPath);
            if (!rootExists) {
                await this.vaultManager.createFolder(this.settings.rootPath);
                console.debug(`Created root folder: ${this.settings.rootPath}`);
            }

            // Create inbox folder if it doesn't exist
            const inboxPath = `${this.settings.rootPath}/inbox`;
            const inboxExists = await this.vaultManager.folderExists(inboxPath);
            if (!inboxExists) {
                await this.vaultManager.createFolder(inboxPath);
                console.debug(`Created inbox folder: ${inboxPath}`);
            }

            // Create template folder if it doesn't exist
            const templateExists = await this.vaultManager.folderExists(this.settings.templateFolderPath);
            if (!templateExists) {
                await this.vaultManager.createFolder(this.settings.templateFolderPath);
                console.debug(`Created template folder: ${this.settings.templateFolderPath}`);
            }

        } catch (error) {
            console.error('Error checking/creating folders:', error);
        }
    }

    private initializeStatusBar() {
        this.statusBar = new StatusBar(this);
        
        // Register status bar with service provider
        this.serviceProvider.register('statusBar', this.statusBar);
        
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
