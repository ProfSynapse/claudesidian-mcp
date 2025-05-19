import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { UpdateManager } from './utils/UpdateManager';
import { MCPConnector } from './connector';
import { Settings } from './settings';
import { SettingsTab } from './components/SettingsTab';
import { ConfigModal } from './components/ConfigModal';

// Import new ChromaDB services
import { EmbeddingService } from './database/services/EmbeddingService';
import { ChromaSearchService } from './database/services/ChromaSearchService';
import { IVectorStore } from './database/interfaces/IVectorStore';
import { VectorStoreFactory } from './database/factory/VectorStoreFactory';
import { WorkspaceService } from './database/services/WorkspaceService';
import { MemoryService } from './database/services/MemoryService';

export default class ClaudesidianPlugin extends Plugin {
    public settings: Settings;
    private connector: MCPConnector;
    private settingsTab: SettingsTab;
    
    // ChromaDB infrastructure
    public vectorStore: IVectorStore;
    
    // Services
    public embeddingService: EmbeddingService;
    public searchService: ChromaSearchService;
    public workspaceService: WorkspaceService;
    public memoryService: MemoryService;
    
    // Service registry
    public services: {
        embeddingService: EmbeddingService;
        searchService: ChromaSearchService;
        workspaceService: WorkspaceService;
        memoryService: MemoryService;
        vectorStore: IVectorStore;
    };
    
    async onload() {
        // Initialize settings
        this.settings = new Settings(this);
        await this.settings.loadSettings();
        
        // Initialize ChromaDB vector store
        this.vectorStore = VectorStoreFactory.createVectorStore(this);
        try {
            await this.vectorStore.initialize();
            console.log("ChromaDB vector store initialized successfully");
        } catch (error) {
            console.error("Failed to initialize ChromaDB vector store:", error);
        }
        
        // Initialize services
        this.embeddingService = new EmbeddingService(this);
        this.searchService = new ChromaSearchService(this, this.vectorStore, this.embeddingService);
        this.workspaceService = new WorkspaceService(this, this.vectorStore);
        this.memoryService = new MemoryService(this, this.vectorStore, this.embeddingService);
        
        // Initialize collections - do this sequentially to avoid race conditions
        try {
            await this.searchService.initialize().catch(error => {
                console.warn(`Failed to initialize search service: ${error.message}`);
            });
            
            await this.workspaceService.initialize().catch(error => {
                console.warn(`Failed to initialize workspace service: ${error.message}`);
            });
            
            await this.memoryService.initialize().catch(error => {
                console.warn(`Failed to initialize memory service: ${error.message}`);
            });
            
            console.log("ChromaDB collections initialization complete");
        } catch (error) {
            console.error("Failed to initialize ChromaDB collections:", error);
            // Continue with plugin loading despite initialization errors
        }
        
        // Expose services
        this.services = {
            embeddingService: this.embeddingService,
            searchService: this.searchService,
            workspaceService: this.workspaceService,
            memoryService: this.memoryService,
            vectorStore: this.vectorStore
        };
        
        // Initialize connector with settings
        this.connector = new MCPConnector(this.app, this);
        await this.connector.start();
        
        // Add settings tab with services directly
        // Get agent references for settings tab
        const vaultLibrarian = this.connector.getVaultLibrarian();
        const memoryManager = this.connector.getMemoryManager();
        
        // Create settings tab with services directly
        this.settingsTab = new SettingsTab(
            this.app, 
            this, 
            this.settings,
            this.services, // Pass all services
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
        if (this.embeddingService && typeof this.embeddingService.onunload === 'function') {
            this.embeddingService.onunload();
        }
        
        // Close the vector store connection
        if (this.vectorStore) {
            try {
                await this.vectorStore.close();
                console.log("ChromaDB vector store closed successfully");
            } catch (error) {
                console.error("Failed to close ChromaDB vector store:", error);
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
     * Get the memory manager agent
     * @returns MemoryManagerAgent instance if available
     */
    getMemoryManager(): any {
        return this.connector.getMemoryManager();
    }
    
}