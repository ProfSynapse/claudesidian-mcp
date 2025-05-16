import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { UpdateManager } from './utils/UpdateManager';
import { MCPConnector } from './connector';
import { Settings } from './settings';
import { SettingsTab } from './components/SettingsTab';
import { ConfigModal } from './components/ConfigModal';
import { EmbeddingManager } from './database/services/embeddingManager';
import { SearchService } from './database/services/searchService';
import { IndexingService } from './database/services/indexingService';
import { IndexedDBWorkspaceDatabase } from './database/workspace-db';

export default class ClaudesidianPlugin extends Plugin {
    public settings: Settings;
    private connector: MCPConnector;
    private settingsTab: SettingsTab;
    
    // Services
    public embeddingManager: EmbeddingManager;
    public searchService: SearchService;
    public indexingService: IndexingService;
    public workspaceDb: IndexedDBWorkspaceDatabase;
    public services: {
        embeddingManager: EmbeddingManager;
        searchService: SearchService;
        indexingService: IndexingService;
        workspaceDb: IndexedDBWorkspaceDatabase;
    };
    
    async onload() {
        // Initialize settings
        this.settings = new Settings(this);
        await this.settings.loadSettings();
        
        // Initialize workspace database
        this.workspaceDb = new IndexedDBWorkspaceDatabase();
        try {
            await this.workspaceDb.initialize();
            console.log("Workspace database initialized successfully");
        } catch (error) {
            console.error("Failed to initialize workspace database:", error);
        }
        
        // Initialize services
        this.embeddingManager = new EmbeddingManager(this.app);
        this.searchService = new SearchService(this.app, this.embeddingManager);
        this.indexingService = new IndexingService(this.app, this.embeddingManager);
        
        // Expose services
        this.services = {
            embeddingManager: this.embeddingManager,
            searchService: this.searchService,
            indexingService: this.indexingService,
            workspaceDb: this.workspaceDb
        };
        
        // Initialize connector with settings
        this.connector = new MCPConnector(this.app, this);
        await this.connector.start();
        
        // Add settings tab with services and agents for compatibility
        // Convert null to undefined when getting the agents
        const vaultLibrarian = this.connector.getVaultLibrarian();
        const memoryManager = this.getMemoryManager();
        
        // Create settings tab with services directly (preferred) + agents (for backward compatibility)
        this.settingsTab = new SettingsTab(
            this.app, 
            this, 
            this.settings,
            this.indexingService,
            this.embeddingManager,
            this.searchService,
            vaultLibrarian || undefined,
            memoryManager || undefined
        );
        this.addSettingTab(this.settingsTab);
        
        // Add ribbon icons
        this.addRibbonIcon('bot', 'Open Claudesidian MCP', () => {
            new ConfigModal(this.app, this.settings).open();
        });

        this.addRibbonIcon('refresh-cw', 'Check for Updates', async () => {
            try {
                const updateManager = new UpdateManager(this);
                const hasUpdate = await updateManager.checkForUpdate();
                
                if (!hasUpdate) {
                    new Notice('You are already on the latest version!');
                    return;
                }

                await updateManager.updatePlugin();
            } catch (error) {
                new Notice(`Update failed: ${(error as Error).message}`);
            }
        });
        
        // No need to register commands as clients use MCP to interact with tools directly
        
    }
    
    async onunload() {
        // Clean up the vault librarian if necessary
        const vaultLibrarian = this.connector.getVaultLibrarian();
        if (vaultLibrarian && typeof vaultLibrarian.onunload === 'function') {
            vaultLibrarian.onunload();
        }
        
        // Clean up services
        if (this.embeddingManager && typeof this.embeddingManager.onunload === 'function') {
            this.embeddingManager.onunload();
        }
        
        // Close the workspace database
        if (this.workspaceDb) {
            try {
                await this.workspaceDb.close();
                console.log("Workspace database closed successfully");
            } catch (error) {
                console.error("Failed to close workspace database:", error);
            }
        }
        
        // Stop the MCP server
        await this.connector.stop();
    }
    
    /**
     * Get the settings instance
     * @returns Settings instance
     */
    getSettings(): Settings {
        return this.settings;
    }
    
    /**
     * Get the connector instance
     * @returns MCPConnector instance
     */
    getConnector(): MCPConnector {
        return this.connector;
    }
    
    /**
     * Get the activity embedder from the vault librarian
     * Used by agents to access shared embedder functionality
     * @returns ToolActivityEmbedder instance if available
     */
    getActivityEmbedder(): any {
        // Get the vault librarian
        const vaultLibrarian = this.connector.getVaultLibrarian();
        if (!vaultLibrarian) {
            return null;
        }
        
        // If the vault librarian has an activity embedder, return it
        if ((vaultLibrarian as any).activityEmbedder) {
            return (vaultLibrarian as any).activityEmbedder;
        }
        
        return null;
    }
    
    /**
     * Get the memory manager agent
     * @returns MemoryManagerAgent instance if available
     */
    getMemoryManager(): any {
        return this.connector.getMemoryManager();
    }
}