import { Plugin, Notice } from 'obsidian';
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
import { EventManager } from './services/EventManager';
import { FileEventManager } from './services/FileEventManager';
import { UsageStatsService } from './database/services/UsageStatsService';
import { CacheManager } from './database/services/CacheManager';

export default class ClaudesidianPlugin extends Plugin {
    public settings!: Settings;
    private connector!: MCPConnector;
    private settingsTab!: SettingsTab;
    
    // ChromaDB infrastructure
    public vectorStore!: IVectorStore;
    
    // Services
    public embeddingService!: EmbeddingService;
    public searchService!: ChromaSearchService;
    public workspaceService!: WorkspaceService;
    public memoryService!: MemoryService;
    public fileEventManager!: FileEventManager;
    public eventManager!: EventManager;
    public usageStatsService!: UsageStatsService;
    public cacheManager!: CacheManager;
    
    // Reindexing flag for batch operations
    private isReindexing: boolean = false;
    
    // Service registry
    public services!: {
        embeddingService: EmbeddingService;
        searchService: ChromaSearchService;
        workspaceService: WorkspaceService;
        memoryService: MemoryService;
        vectorStore: IVectorStore;
        eventManager: EventManager;
        fileEventManager: FileEventManager;
        usageStatsService: UsageStatsService;
        cacheManager: CacheManager;
    };
    
    async onload() {
        // Initialize settings
        this.settings = new Settings(this);
        await this.settings.loadSettings();
        
        // Ensure data directories exist before initialization
        try {
            // Use the correct vault's plugin directory path
            const fs = require('fs');
            const path = require('path');
            
            // Get path to the plugin in the current vault
            // Get the vault's base path using FileSystemAdapter
            let basePath;
            if (this.app.vault.adapter instanceof require('obsidian').FileSystemAdapter) {
                // Use type assertion to access getBasePath
                basePath = (this.app.vault.adapter as any).getBasePath();
            } else {
                throw new Error('FileSystemAdapter not available');
            }
            
            const pluginId = this.manifest.id;
            
            // Construct the correct plugin directory within the vault
            const pluginDir = path.join(basePath, '.obsidian', 'plugins', pluginId);
            const dataDir = path.join(pluginDir, 'data');
            const chromaDbDir = path.join(dataDir, 'chroma-db');
            const collectionsDir = path.join(chromaDbDir, 'collections');
            
            // Log directory information for debugging
            console.log(`Plugin directory (from manifest): ${pluginDir}`);
            console.log(`Plugin ID: ${pluginId}`);
            console.log(`Data directory path: ${dataDir}`);
            console.log(`ChromaDB directory path: ${chromaDbDir}`);
            
            // Check and create the main data directory
            if (!fs.existsSync(dataDir)) {
                console.log(`Creating main data directory at: ${dataDir} (does not exist)`);
                fs.mkdirSync(dataDir, { recursive: true });
                // Verify creation
                if (fs.existsSync(dataDir)) {
                    console.log(`Successfully created data directory at: ${dataDir}`);
                } else {
                    console.error(`Failed to verify data directory creation at: ${dataDir}`);
                }
            } else {
                console.log(`Data directory exists at: ${dataDir}`);
            }
            
            // Check and create the ChromaDB directory
            if (!fs.existsSync(chromaDbDir)) {
                console.log(`Creating ChromaDB directory at: ${chromaDbDir} (does not exist)`);
                fs.mkdirSync(chromaDbDir, { recursive: true });
                // Verify creation
                if (fs.existsSync(chromaDbDir)) {
                    console.log(`Successfully created ChromaDB directory at: ${chromaDbDir}`);
                } else {
                    console.error(`Failed to verify ChromaDB directory creation at: ${chromaDbDir}`);
                }
            } else {
                console.log(`ChromaDB directory exists at: ${chromaDbDir}`);
            }
            
            // Check if there's a collections folder
            if (!fs.existsSync(collectionsDir)) {
                console.log(`Creating ChromaDB collections directory at: ${collectionsDir} (does not exist)`);
                fs.mkdirSync(collectionsDir, { recursive: true });
                // Verify creation
                if (fs.existsSync(collectionsDir)) {
                    console.log(`Successfully created collections directory at: ${collectionsDir}`);
                } else {
                    console.error(`Failed to verify collections directory creation at: ${collectionsDir}`);
                }
            } else {
                console.log(`ChromaDB collections directory exists at: ${collectionsDir}`);
            }
            
            // After creating all directories, list the contents for verification
            console.log("Listing data directory contents:");
            if (fs.existsSync(dataDir)) {
                console.log(fs.readdirSync(dataDir));
            } else {
                console.log("Data directory still doesn't exist");
            }
            
            // Ensure memory settings exist before setting the path
            if (!this.settings.settings.memory) {
                this.settings.settings.memory = {
                    dbStoragePath: chromaDbDir,
                    // Add other required memory settings with defaults
                    enabled: true,
                    embeddingsEnabled: true,
                    apiProvider: 'openai',
                    providerSettings: {
                        openai: {
                            apiKey: '',
                            model: 'text-embedding-3-small',
                            dimensions: 1536
                        }
                    },
                    maxTokensPerMonth: 1000000,
                    apiRateLimitPerMinute: 500,
                    chunkStrategy: 'paragraph',
                    chunkSize: 512,
                    chunkOverlap: 50,
                    includeFrontmatter: true,
                    excludePaths: ['.obsidian/**/*'],
                    minContentLength: 50,
                    embeddingStrategy: 'manual',
                    idleTimeThreshold: 60000,
                    batchSize: 10,
                    concurrentRequests: 3,
                    processingDelay: 1000,
                    autoCleanOrphaned: true,
                    maxDbSize: 500,
                    pruningStrategy: 'least-used',
                    defaultResultLimit: 10,
                    includeNeighbors: true,
                    graphBoostFactor: 0.3,
                    backlinksEnabled: true,
                    backlinksWeight: 0.5,
                    useFilters: true,
                    defaultThreshold: 0.7
                };
            } else {
                // Just update the dbStoragePath if memory settings already exist
                this.settings.settings.memory.dbStoragePath = chromaDbDir;
            }
            
            await this.settings.saveSettings();
        } catch (dirError) {
            console.error("Failed to create data directories:", dirError);
        }
        
        // Initialize ChromaDB vector store with path in the plugin directory
        const path = require('path');
        
        // Get the vault's base path using FileSystemAdapter
        let basePath;
        if (this.app.vault.adapter instanceof require('obsidian').FileSystemAdapter) {
            // Use type assertion to access getBasePath
            basePath = (this.app.vault.adapter as any).getBasePath();
        } else {
            throw new Error('FileSystemAdapter not available');
        }
        
        // Construct the correct plugin directory within the vault
        const pluginDir = path.join(basePath, '.obsidian', 'plugins', this.manifest.id);
        const dataDir = path.join(pluginDir, 'data', 'chroma-db');
        
        console.log(`Plugin directory: ${pluginDir}`);
        console.log(`Creating vector store with path: ${dataDir}`);
        
        this.vectorStore = VectorStoreFactory.createVectorStore(this, {
            persistentPath: dataDir,
            inMemory: false // Explicitly set to false to ensure persistence
        });
        
        try {
            // Mark as system operation to prevent file event handling
            this.vectorStore.startSystemOperation();
            
            await this.vectorStore.initialize();
            console.log("ChromaDB vector store initialized successfully");
            
            // Check if we can access the store and collection
            const diagnostics = await this.vectorStore.getDiagnostics();
            console.log(`ChromaDB diagnostics: ${diagnostics.totalCollections} collections found`);
            console.log(`Storage mode: ${diagnostics.storageMode}, path: ${diagnostics.persistentPath}`);
            
            // Check if file_embeddings collection has any data
            try {
                const embeddingCount = await this.vectorStore.count('file_embeddings');
                console.log(`[Main] file_embeddings collection contains ${embeddingCount} embeddings at startup`);
            } catch (countError) {
                console.log(`[Main] Could not count file_embeddings (collection may not exist yet):`, countError);
            }
            
            // Clear system operation flag
            this.vectorStore.endSystemOperation();
        } catch (error) {
            // Make sure to clear the flag even on error
            this.vectorStore.endSystemOperation();
            console.error("Failed to initialize ChromaDB vector store:", error);
        }
        
        // Initialize services
        this.embeddingService = new EmbeddingService(this);
        this.searchService = new ChromaSearchService(this, this.vectorStore, this.embeddingService);
        this.workspaceService = new WorkspaceService(this, this.vectorStore, this.embeddingService);
        this.memoryService = new MemoryService(this, this.vectorStore, this.embeddingService, this.settings);
        this.eventManager = new EventManager();
        
        // Initialize collections - do this sequentially to avoid race conditions
        try {
            // Mark as system operation to prevent file event handling
            this.vectorStore.startSystemOperation();
            
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
            
            // Add a validation step to ensure collections are properly loaded
            this.validateCollections();
            
            // End system operation
            this.vectorStore.endSystemOperation();
        } catch (error) {
            // Make sure to clear the flag even on error
            this.vectorStore.endSystemOperation();
            console.error("Failed to initialize ChromaDB collections:", error);
            // Continue with plugin loading despite initialization errors
        }
        
        // Initialize the file event manager with all required services
        console.log('[Main] Creating FileEventManager...');
        this.fileEventManager = new FileEventManager(
            this.app,
            this,
            this.memoryService,
            this.workspaceService,
            this.embeddingService,
            this.eventManager
        );
        console.log('[Main] FileEventManager created, calling initialize...');
        try {
            await this.fileEventManager.initialize();
            console.log('[Main] FileEventManager initialization completed successfully');
        } catch (error) {
            console.error('[Main] FileEventManager initialization failed:', error);
            throw error;
        }
        
        // Initialize the usage stats service
        this.usageStatsService = new UsageStatsService(
            this.embeddingService,
            this.vectorStore,
            this.settings.settings.memory,
            this.eventManager  // Pass the existing event manager
        );
        
        // Initialize the cache manager
        this.cacheManager = new CacheManager(
            this.app.vault,
            this.workspaceService,
            this.memoryService
        );
        // Temporarily disable cache manager to see if it's causing issues
        // await this.cacheManager.initialize();
        
        // Expose services
        this.services = {
            embeddingService: this.embeddingService,
            searchService: this.searchService,
            workspaceService: this.workspaceService,
            memoryService: this.memoryService,
            vectorStore: this.vectorStore,
            eventManager: this.eventManager,
            fileEventManager: this.fileEventManager,
            usageStatsService: this.usageStatsService,
            cacheManager: this.cacheManager
        };
        
        // FileEventManager now handles all embedding strategies
        
        // Warm the cache with active workspace (if any)
        try {
            await this.warmCache();
        } catch (error) {
            console.warn('Failed to warm cache:', error);
        }
        
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
        
        // Register commands for maintenance and troubleshooting
        this.addCommand({
            id: 'repair-collections',
            name: 'Repair vector collections',
            callback: async () => {
                try {
                    const notice = new Notice('Repairing vector collections...', 0);
                    
                    if (!this.vectorStore) {
                        notice.setMessage('Vector store not initialized');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    // Check if the repair method exists
                    if (typeof (this.vectorStore as any).repairCollections !== 'function') {
                        notice.setMessage('Repair function not available');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    // Run the repair
                    const result = await (this.vectorStore as any).repairCollections();
                    
                    if (result.success) {
                        notice.setMessage(`Repair successful: ${result.repairedCollections.length} collections restored`);
                    } else {
                        notice.setMessage(`Repair completed with issues: ${result.errors.length} errors`);
                        console.error('Collection repair errors:', result.errors);
                    }
                    
                    // Show the result for a few seconds
                    setTimeout(() => notice.hide(), 5000);
                } catch (error) {
                    new Notice(`Repair failed: ${(error as Error).message}`);
                    console.error('Collection repair error:', error);
                }
            }
        });
        
        this.addCommand({
            id: 'check-vector-storage',
            name: 'Check vector storage status',
            callback: async () => {
                try {
                    const notice = new Notice('Checking vector storage...', 0);
                    
                    if (!this.vectorStore) {
                        notice.setMessage('Vector store not initialized');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const diagnostics = await this.vectorStore.getDiagnostics();
                    
                    // Format a message with the key information
                    const message = [
                        `Storage mode: ${diagnostics.storageMode}`,
                        `Path: ${diagnostics.persistentPath}`,
                        `Collections: ${diagnostics.totalCollections}`,
                        `Directory exists: ${diagnostics.dataDirectoryExists ? 'Yes' : 'No'}`,
                        `Permissions OK: ${diagnostics.filePermissionsOk ? 'Yes' : 'No'}`
                    ].join('\n');
                    
                    // Update the notice
                    notice.setMessage(message);
                    
                    // Show detailed information in the console
                    console.log('Vector storage diagnostics:', diagnostics);
                    
                    // Keep the notice visible for longer so user can read it
                    setTimeout(() => notice.hide(), 10000);
                } catch (error) {
                    new Notice(`Diagnostics failed: ${(error as Error).message}`);
                    console.error('Diagnostics error:', error);
                }
            }
        });
        
    }
    
    async onunload() {
        // Clean up the file event manager
        if (this.fileEventManager) {
            this.fileEventManager.unload();
        }
        
        // Clean up the vault librarian if necessary
        const vaultLibrarian = this.connector.getVaultLibrarian();
        if (vaultLibrarian && typeof vaultLibrarian.onunload === 'function') {
            vaultLibrarian.onunload();
        }
        
        // Clean up services
        // EmbeddingService doesn't need explicit cleanup
        
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
    
    /**
     * Reload configuration for all services after settings change
     * Called when memory settings are updated to ensure immediate effect
     */
    reloadConfiguration(): void {
        console.log('[ClaudesidianPlugin] Reloading configuration after settings change');
        
        // Reload FileEventManager configuration (handles embedding strategy)
        if (this.fileEventManager && typeof this.fileEventManager.reloadConfiguration === 'function') {
            this.fileEventManager.reloadConfiguration();
        }
        
        console.log('[ClaudesidianPlugin] Configuration reload complete');
    }
    
    /**
     * Validate that collections are properly loaded and accessible
     * This runs after service initialization to ensure everything is working correctly
     */
    private async validateCollections(): Promise<void> {
        console.log("Starting post-initialization collection validation");
        
        // This should be running within a system operation context already,
        // but we'll ensure it here just in case it's called separately
        const wasInSystemOperation = !!this.vectorStore.isSystemOperation;
        if (!wasInSystemOperation) {
            this.vectorStore.startSystemOperation();
        }
        
        try {
            // Define our essential collections that should always exist
            const essentialCollections = [
                'file_embeddings',
                'memory_traces',
                'sessions',
                'snapshots',
                'workspaces'
            ];
            
            // Get current collections from memory service
            const memoryService = this.memoryService;
            const collectionManager = memoryService.getCollectionManager();
            const existingCollections = await collectionManager.listCollections();
            
            // Track missing collections
            const missingCollections = essentialCollections.filter(
                name => !existingCollections.includes(name)
            );
            
            // Validate each existing collection by trying to access it
            const validationIssues: string[] = [];
            const validatedCollections: string[] = [];
            
            for (const collectionName of existingCollections) {
                try {
                    // Get the collection and try a basic operation to validate it
                    const collection = await collectionManager.getCollection(collectionName);
                    
                    if (collection) {
                        // Try to count items to verify collection functionality
                        await collectionManager.count(collectionName);
                        validatedCollections.push(collectionName);
                    } else {
                        validationIssues.push(`Collection ${collectionName} exists but returned null`);
                    }
                } catch (error) {
                    validationIssues.push(`Collection ${collectionName} exists but failed validation: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            
            // Create any missing essential collections
            for (const collectionName of missingCollections) {
                try {
                    await collectionManager.createCollection(collectionName, {
                        createdAt: new Date().toISOString(),
                        createdBy: 'validation',
                    });
                    console.log(`Created missing essential collection: ${collectionName}`);
                } catch (error) {
                    validationIssues.push(`Failed to create missing collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            
            // Log validation results
            const validationSummary = [
                `Validated ${validatedCollections.length} collections`,
                missingCollections.length > 0 ? `Found ${missingCollections.length} missing collections` : null,
                validationIssues.length > 0 ? `Found ${validationIssues.length} validation issues` : null,
            ].filter(Boolean).join('. ');
            
            console.log(validationSummary);
            
            // Log detailed issues if any
            if (validationIssues.length > 0) {
                console.warn("Collection validation issues:");
                for (const issue of validationIssues) {
                    console.warn(`- ${issue}`);
                }
            }
        } catch (error) {
            console.error("Error during collection validation:", error);
        } finally {
            // Only clear the flag if we set it here
            if (!wasInSystemOperation) {
                this.vectorStore.endSystemOperation();
            }
        }
    }
    
    
    
    /**
     * Warm the cache with commonly accessed data
     */
    private async warmCache(): Promise<void> {
        console.log('Warming cache on plugin startup...');
        
        try {
            // Check if cache manager is initialized before using it
            if (!this.cacheManager || !this.cacheManager.isReady()) {
                console.log('CacheManager not ready, skipping cache warming');
                return;
            }
            
            // Get the most recently accessed workspace
            const workspaces = await this.workspaceService.getWorkspaces();
            if (workspaces.length > 0) {
                // Sort by last accessed time
                const sortedWorkspaces = workspaces.sort((a, b) => 
                    (b.lastAccessed || 0) - (a.lastAccessed || 0)
                );
                
                // Warm cache with the most recently accessed workspace
                const activeWorkspace = sortedWorkspaces[0];
                console.log(`Warming cache with workspace: ${activeWorkspace.name}`);
                await this.cacheManager.warmCache(activeWorkspace.id);
            }
        } catch (error) {
            console.error('Error warming cache:', error);
        }
    }
}