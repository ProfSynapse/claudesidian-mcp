import { Plugin } from 'obsidian';
import { ClaudesidianMCPServer } from './mcp/server';
import { ToolRegistry } from './tools/ToolRegistry';
import { StatusManager } from './services/StatusManager';
import { MCPSettings, DEFAULT_SETTINGS } from './types';
import { SettingsTab } from './components/SettingsTab';
import { EventManager } from './services/EventManager';
import { ServiceProvider } from './services/ServiceProvider';
import { IVaultManager } from './tools/interfaces/ToolInterfaces';
import { VaultManagerFacade } from './services/VaultManagerFacade';

export default class ClaudesidianMCPPlugin extends Plugin {
    // Hardcoded paths
    private static readonly CLAUDESIDIAN_PATH = 'claudesidian';
    private static readonly INBOX_PATH = `${ClaudesidianMCPPlugin.CLAUDESIDIAN_PATH}/inbox`;

    private mcpServer: ClaudesidianMCPServer;
    private statusManager: StatusManager;
    private toolRegistry: ToolRegistry;
    public vaultManager: VaultManagerFacade;
    settings: MCPSettings;

    private initStage = {
        CORE: 'core',
        FEATURES: 'features',
        SERVER: 'server'
    } as const;

    private currentStage: keyof typeof this.initStage = 'CORE';

    private serviceProvider: ServiceProvider;

    // Helper method to get claudesidian path
    public static getClaudesidianPath(): string {
        return this.CLAUDESIDIAN_PATH;
    }

    // Helper method to get inbox path
    public static getInboxPath(): string {
        return this.INBOX_PATH;
    }

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
        this.vaultManager = this.serviceProvider.get<VaultManagerFacade>('vaultManager');
        
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

        // Initialize components
        this.statusManager = new StatusManager();
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

            // Initialize status manager early for feedback
            this.statusManager = new StatusManager();
            this.statusManager.setStatus('initializing');

            // Register minimal commands and vault events
            this.addSettingTab(new SettingsTab(this.app, this));
            this.registerCommands();
            this.registerVaultEvents(); // Register vault events to ensure folders are created

            // Phase 2: Deferred Initialization
            this.app.workspace.onLayoutReady(() => {
                this.completeInitialization(eventManager).catch(error => {
                    console.error('Error during post-layout initialization:', error);
                    this.statusManager.setStatus('error');
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
            this.statusManager.setStatus('running');
            console.log('ClaudesidianMCPPlugin: Full initialization complete');
            console.log('ClaudesidianMCPPlugin: Full initialization complete');
        } catch (error) {
            console.error('Error during post-layout initialization:', error);
            this.statusManager.setStatus('error');
            throw error;
        }
    }

    public async initializeFolderStructure() {
        // Create all folders concurrently for better performance
        const folderCreationPromises = [
            this.createFolderIfNeeded(ClaudesidianMCPPlugin.CLAUDESIDIAN_PATH),
            this.createFolderIfNeeded(ClaudesidianMCPPlugin.INBOX_PATH)
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

    // Removed migrateAndInitializeFolders and getOldPath methods as they are no longer needed

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
            const rootExists = await this.vaultManager.folderExists(ClaudesidianMCPPlugin.CLAUDESIDIAN_PATH);
            if (!rootExists) {
                await this.vaultManager.createFolder(ClaudesidianMCPPlugin.CLAUDESIDIAN_PATH);
                console.debug(`Created root folder: ${ClaudesidianMCPPlugin.CLAUDESIDIAN_PATH}`);
            }

            // Create inbox folder if it doesn't exist
            const inboxExists = await this.vaultManager.folderExists(ClaudesidianMCPPlugin.INBOX_PATH);
            if (!inboxExists) {
                await this.vaultManager.createFolder(ClaudesidianMCPPlugin.INBOX_PATH);
                console.debug(`Created inbox folder: ${ClaudesidianMCPPlugin.INBOX_PATH}`);
            }
        } catch (error) {
            console.error('Error checking/creating folders:', error);
        }
    }

    private registerCommands() {
        this.addCommand({
            id: 'start-mcp-server',
            name: 'Start MCP Server',
            callback: async () => {
                console.log('ClaudesidianMCPPlugin: start-mcp-server command triggered');
                try {
                    this.statusManager.setStatus('starting');
                    await this.mcpServer.start();
                    this.statusManager.setStatus('running');
                } catch (error: any) {
                    console.error('Failed to start MCP server:', error);
                    this.statusManager.setStatus('error');
                }
            }
        });

        this.addCommand({
            id: 'stop-mcp-server',
            name: 'Stop MCP Server',
            callback: async () => {
                console.log('ClaudesidianMCPPlugin: stop-mcp-server command triggered');
                try {
                    this.statusManager.setStatus('stopping');
                    await this.mcpServer.stop();
                    this.statusManager.setStatus('stopped');
                } catch (error: any) {
                    console.error('Failed to stop MCP server:', error);
                    this.statusManager.setStatus('error');
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
