import { Plugin, Notice } from 'obsidian';
import { UpdateManager } from './utils/UpdateManager';
import { MCPConnector } from './connector';
import { Settings } from './settings';
import { SettingsTab } from './components/SettingsTab';
import { ConfigModal } from './components/ConfigModal';

// Import new ChromaDB services
import { EmbeddingService } from './database/services/EmbeddingService';
import { HnswSearchService } from './database/providers/chroma/services/HnswSearchService';
import { FileEmbeddingAccessService } from './database/services/FileEmbeddingAccessService';
import { DirectCollectionService } from './database/services/DirectCollectionService';
import { IVectorStore } from './database/interfaces/IVectorStore';
import { VectorStoreFactory } from './database/factory/VectorStoreFactory';
import { WorkspaceService } from './database/services/WorkspaceService';
import { MemoryService } from './database/services/MemoryService';
import { EventManager } from './services/EventManager';
import { FileEventManagerModular } from './services/file-events/FileEventManagerModular';
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
    public hnswSearchService!: HnswSearchService;
    public fileEmbeddingAccessService!: FileEmbeddingAccessService;
    public directCollectionService!: DirectCollectionService;
    public workspaceService!: WorkspaceService;
    public memoryService!: MemoryService;
    public fileEventManager!: FileEventManagerModular;
    public eventManager!: EventManager;
    public usageStatsService!: UsageStatsService;
    public cacheManager!: CacheManager;
    
    // Reindexing flag for batch operations
    private isReindexing = false;
    
    // HNSW retry mechanism
    private hnswRetryCount = 0;
    private maxHnswRetries = 3;
    private hnswRetryTimeout?: NodeJS.Timeout;
    
    // Service registry
    public services!: {
        embeddingService: EmbeddingService;
        hnswSearchService: HnswSearchService;
        fileEmbeddingAccessService: FileEmbeddingAccessService;
        directCollectionService: DirectCollectionService;
        workspaceService: WorkspaceService;
        memoryService: MemoryService;
        vectorStore: IVectorStore;
        eventManager: EventManager;
        fileEventManager: FileEventManagerModular;
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
            
            // Directory information logged only for debugging when needed
            
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
                // ChromaDB directory verified
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
            }
            
            // Directory verification complete
            
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
                    useFilters: true,
                    defaultThreshold: 0.7,
                    semanticThreshold: 0.5,
                    vectorStoreType: 'file-based'
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
        
        // Vector store initialization
        
        // Get embedding dimensions from settings
        const memorySettings = this.settings.settings.memory;
        if (!memorySettings) {
            throw new Error('Memory settings not found. Please configure your embedding settings.');
        }
        
        const providerId = memorySettings.apiProvider;
        const providerSettings = memorySettings.providerSettings?.[providerId];
        
        if (!providerSettings?.dimensions) {
            throw new Error(`Embedding dimensions not configured for provider ${providerId}. Please configure your embedding provider settings.`);
        }

        this.vectorStore = VectorStoreFactory.createVectorStore(this, {
            persistentPath: dataDir,
            inMemory: false,
            embedding: {
                dimension: providerSettings.dimensions,
                model: providerSettings.model
            }
        });
        
        try {
            // Mark as system operation to prevent file event handling
            this.vectorStore.startSystemOperation();
            
            await this.vectorStore.initialize();
            // Vector store initialized
            
            // Check if we can access the store and collection
            const diagnostics = await this.vectorStore.getDiagnostics();
            // Database diagnostics completed
            
            // Check if file_embeddings collection has any data
            try {
                const embeddingCount = await this.vectorStore.count('file_embeddings');
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
        
        // Create HnswSearchService with vector store
        this.hnswSearchService = new HnswSearchService(this.app, this.vectorStore, this.embeddingService);
        
        this.fileEmbeddingAccessService = new FileEmbeddingAccessService(this, this.vectorStore);
        this.directCollectionService = new DirectCollectionService(this, this.vectorStore);
        this.workspaceService = new WorkspaceService(this, this.vectorStore, this.embeddingService);
        this.memoryService = new MemoryService(this, this.vectorStore, this.embeddingService, this.settings);
        this.eventManager = new EventManager();
        
        // Initialize collections - do this sequentially to avoid race conditions
        try {
            // Mark as system operation to prevent file event handling
            this.vectorStore.startSystemOperation();
            
            // Legacy search service removed - using modern services instead
            
            await this.hnswSearchService.initialize().catch((error: any) => {
                console.warn(`Failed to initialize semantic search service: ${error.message}`);
            });
            
            await this.fileEmbeddingAccessService.initialize().catch(error => {
                console.warn(`Failed to initialize file embedding access service: ${error.message}`);
            });
            
            // Load existing embeddings into HNSW index for high-performance search
            await this.loadExistingEmbeddingsIntoHNSW().catch(error => {
                console.warn(`Failed to load existing embeddings into HNSW: ${error.message}`);
                // Schedule retry after a delay
                this.scheduleHnswRetry();
            });
            
            
            await this.workspaceService.initialize().catch(error => {
                console.warn(`Failed to initialize workspace service: ${error.message}`);
            });
            
            await this.memoryService.initialize().catch(error => {
                console.warn(`Failed to initialize memory service: ${error.message}`);
            });
            
            
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
        // Get embedding strategy from settings
        const embeddingStrategy = {
            type: (this.settings?.settings?.memory?.embeddingStrategy || 'manual') as 'manual' | 'idle' | 'startup',
            idleTimeThreshold: this.settings?.settings?.memory?.idleTimeThreshold || 60000,
            batchSize: this.settings?.settings?.memory?.batchSize || 10,
            processingDelay: 1000 // Default processing delay
        };

        // Diagnostic: Log the actual embedding strategy being used
        // Embedding strategy configured
        
        this.fileEventManager = new FileEventManagerModular(
            this.app,
            this,
            this.memoryService,
            this.workspaceService,
            this.embeddingService,
            this.eventManager,
            embeddingStrategy
        );
        try {
            await this.fileEventManager.initialize();
            
            // Process startup queue if using startup embedding strategy
            if (embeddingStrategy.type === 'startup') {
                // Processing startup queue
                // Add a short delay to ensure vault is fully ready
                setTimeout(async () => {
                    await this.fileEventManager.processStartupQueue();
                    // After startup queue processing is complete, initialize search indexes
                    if (this.connector) {
                        await this.initializeSearchIndexes().catch(error => {
                            console.warn(`Failed to initialize search indexes after startup processing: ${error.message}`);
                        });
                    }
                }, 1000); // 1 second delay
            }
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
            this.app,
            this.workspaceService,
            this.memoryService
        );
        // Temporarily disable cache manager to see if it's causing issues
        // await this.cacheManager.initialize();
        
        // Expose services
        this.services = {
            embeddingService: this.embeddingService,
            hnswSearchService: this.hnswSearchService,
            fileEmbeddingAccessService: this.fileEmbeddingAccessService,
            directCollectionService: this.directCollectionService,
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
        
        // Check for updates on startup in background
        // Run update check in background without blocking startup
        this.checkForUpdatesOnStartup();
        
        // Initialize connector with settings
        this.connector = new MCPConnector(this.app, this);
        
        // Initialize agents before starting the server
        await this.connector.initializeAgents();
        
        await this.connector.start();
        
        // Initialize search indexes after connector is ready (for non-startup strategies)
        // For startup strategy, this happens after queue processing completes
        if (embeddingStrategy.type !== 'startup') {
            await this.initializeSearchIndexes().catch(error => {
                console.warn(`Failed to initialize search indexes: ${error.message}`);
            });
        }
        
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
        // Clear any pending HNSW retry timeout
        this.clearHnswRetryTimeout();
        
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
        
        // Clean up cache manager and metadata events
        if (this.cacheManager) {
            this.cacheManager.cleanup();
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
     * Check for updates on startup in background
     * This runs asynchronously without blocking plugin initialization
     */
    private async checkForUpdatesOnStartup(): Promise<void> {
        try {
            // Don't check more than once per day
            const lastCheck = this.settings.settings.lastUpdateCheckDate;
            if (lastCheck) {
                const lastCheckTime = new Date(lastCheck);
                const now = new Date();
                const daysDiff = (now.getTime() - lastCheckTime.getTime()) / (1000 * 60 * 60 * 24);
                if (daysDiff < 1) {
                    return;
                }
            }

            console.log('Checking for updates on startup...');
            const updateManager = new UpdateManager(this);
            const hasUpdate = await updateManager.checkForUpdate();
            
            // Update the last check date
            this.settings.settings.lastUpdateCheckDate = new Date().toISOString();
            
            if (hasUpdate) {
                // Get the latest version info
                const release = await (updateManager as any).fetchLatestRelease();
                const availableVersion = release.tag_name.replace('v', '');
                
                // Store the available update version
                this.settings.settings.availableUpdateVersion = availableVersion;
                console.log(`Update available: ${availableVersion}`);
                
                // Show a subtle notification
                new Notice(`Plugin update available: v${availableVersion}. Check settings to update.`, 8000);
            } else {
                // Clear any stored available update version
                this.settings.settings.availableUpdateVersion = undefined;
                console.log('Plugin is up to date');
            }
            
            // Save the updated settings
            await this.settings.saveSettings();
            
        } catch (error) {
            console.error('Failed to check for updates on startup:', error);
            // Don't throw error to avoid blocking plugin startup
        }
    }

    /**
     * Validate that collections are properly loaded and accessible
     * This runs after service initialization to ensure everything is working correctly
     */
    private async validateCollections(): Promise<void> {
        
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
        
        try {
            // Check if cache manager is initialized before using it
            if (!this.cacheManager || !this.cacheManager.isReady()) {
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

    /**
     * Load existing embeddings from ChromaDB into HNSW index for high-performance search
     * Bridges the gap between persistent storage and in-memory HNSW optimization
     */
    private async loadExistingEmbeddingsIntoHNSW(): Promise<void> {
        try {
            console.log('[ClaudesidianPlugin] Loading existing embeddings into HNSW index...');
            
            // Get all existing file embeddings from ChromaDB
            const fileEmbeddings = await this.fileEmbeddingAccessService.getAllFileEmbeddings();
            
            if (fileEmbeddings.length === 0) {
                console.log('[ClaudesidianPlugin] No existing embeddings found - HNSW index will be empty');
                return;
            }
            
            // Convert FileEmbedding objects to DatabaseItem format required by HNSW
            const databaseItems = fileEmbeddings.map(embedding => ({
                id: embedding.id,
                embedding: embedding.vector,
                metadata: {
                    filePath: embedding.filePath,
                    fileName: embedding.filePath.split('/').pop() || embedding.filePath,
                    timestamp: embedding.timestamp,
                    workspaceId: embedding.workspaceId,
                    chunkIndex: embedding.chunkIndex,
                    totalChunks: embedding.totalChunks,
                    contentHash: (embedding as any).contentHash,
                    lastModified: (embedding as any).lastModified,
                    fileSize: (embedding as any).fileSize
                },
                document: embedding.content || '' // Use content if available, otherwise empty string
            }));
            
            // Load items into HNSW index for the file_embeddings collection
            await this.hnswSearchService.indexCollection('file_embeddings', databaseItems);
            
            console.log(`[ClaudesidianPlugin] Successfully loaded ${databaseItems.length} embeddings into HNSW index`);
            
        } catch (error) {
            console.error('[ClaudesidianPlugin] Failed to load existing embeddings into HNSW:', error);
            throw error;
        }
    }

    private async initializeSearchIndexes(): Promise<void> {
        try {
            console.log('[ClaudesidianPlugin] Initializing search indexes...');
            
            // Get the VaultLibrarian agent from the connector
            if (!this.connector) {
                console.warn('[ClaudesidianPlugin] Connector not available yet - skipping search index initialization');
                return;
            }
            
            const vaultLibrarian = this.connector.getVaultLibrarian();
            if (!vaultLibrarian) {
                console.warn('[ClaudesidianPlugin] VaultLibrarian not available - skipping search index initialization');
                return;
            }
            
            // Get the UniversalSearchService from the search mode
            const searchMode = vaultLibrarian.getMode('search');
            if (!searchMode || !('universalSearchService' in searchMode)) {
                console.warn('[ClaudesidianPlugin] SearchMode or UniversalSearchService not available - skipping search index initialization');
                return;
            }
            
            const universalSearchService = (searchMode as any).universalSearchService;
            if (universalSearchService && typeof universalSearchService.populateHybridSearchIndexes === 'function') {
                const startTime = Date.now();
                await universalSearchService.populateHybridSearchIndexes();
                const duration = Date.now() - startTime;
                console.log(`[ClaudesidianPlugin] ✓ Plugin fully initialized - vector store, search indexes, and all services ready (${duration}ms)`);
            } else {
                console.warn('[ClaudesidianPlugin] populateHybridSearchIndexes method not available');
            }
            
        } catch (error) {
            console.error('[ClaudesidianPlugin] Failed to initialize search indexes:', error);
            throw error;
        }
    }

    /**
     * Schedule a retry for HNSW index loading after a delay
     */
    private scheduleHnswRetry(): void {
        if (this.hnswRetryCount >= this.maxHnswRetries) {
            console.warn(`[ClaudesidianPlugin] Maximum HNSW retry attempts (${this.maxHnswRetries}) reached. HNSW index will remain unavailable.`);
            return;
        }

        this.hnswRetryCount++;
        const retryDelay = Math.min(5000 * this.hnswRetryCount, 30000); // Exponential backoff, max 30s

        console.log(`[ClaudesidianPlugin] Scheduling HNSW retry ${this.hnswRetryCount}/${this.maxHnswRetries} in ${retryDelay}ms`);

        this.hnswRetryTimeout = setTimeout(async () => {
            try {
                console.log(`[ClaudesidianPlugin] Attempting HNSW retry ${this.hnswRetryCount}/${this.maxHnswRetries}`);
                await this.loadExistingEmbeddingsIntoHNSW();
                console.log(`[ClaudesidianPlugin] HNSW retry ${this.hnswRetryCount} successful!`);
                this.hnswRetryCount = 0; // Reset counter on success
            } catch (error) {
                console.warn(`[ClaudesidianPlugin] HNSW retry ${this.hnswRetryCount} failed: ${(error as Error).message}`);
                // Schedule next retry
                this.scheduleHnswRetry();
            }
        }, retryDelay);
    }

    /**
     * Clear any pending HNSW retry timeout
     */
    private clearHnswRetryTimeout(): void {
        if (this.hnswRetryTimeout) {
            clearTimeout(this.hnswRetryTimeout);
            this.hnswRetryTimeout = undefined;
        }
    }
}