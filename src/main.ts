import { Plugin, Notice, TFile, TAbstractFile, debounce } from 'obsidian';
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
    
    // Event handlers
    private fileCreatedHandler!: (file: TAbstractFile) => void;
    private fileModifiedHandler!: (file: TAbstractFile) => void;
    private fileDeletedHandler!: (file: TAbstractFile) => void;
    private idleTimer: NodeJS.Timeout | null = null;
    private pendingFiles: Set<string> = new Set();
    private isProcessingFiles: boolean = false;
    
    // Service registry
    public services!: {
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
        
        // Initialize file watchers based on embedding strategy
        this.initializeEmbeddingStrategy();
        
        // Handle startup embedding if configured
        this.handleStartupEmbedding();
        
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
            new ConfigModal(this.app).open();
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
        // Remove event listeners
        this.removeEmbeddingEventListeners();
        
        // Clear any pending timers
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
        
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
    
    /**
     * Initialize embedding strategy based on settings
     * This is public so it can be called when settings change
     */
    public initializeEmbeddingStrategy(): void {
        const memorySettings = this.settings.settings.memory;
        if (!memorySettings) return;
        
        // First, remove any existing event listeners
        this.removeEmbeddingEventListeners();
        
        // If embeddings are disabled, don't set up any event listeners
        if (!memorySettings.embeddingsEnabled) {
            console.log("Embeddings are disabled, skipping event listener setup");
            return;
        }
        
        // Setup event handlers based on the chosen strategy
        switch (memorySettings.embeddingStrategy) {
            case 'live':
                this.setupLiveEmbedding();
                break;
            case 'idle':
                this.setupIdleEmbedding();
                break;
            case 'startup':
                // Startup embedding is handled separately in handleStartupEmbedding
                break;
            case 'manual':
            default:
                // No automatic embedding for manual mode
                console.log("Manual embedding mode selected - no automatic embedding");
                break;
        }
    }
    
    /**
     * Helper method to safely register vault event handlers with proper typing
     * @param event The event name
     * @param handler The event handler
     */
    private registerVaultHandler(event: 'create' | 'modify' | 'delete', handler: (file: TAbstractFile) => void): void {
        // Using Function type cast to bypass TypeScript's strict checking
        // @ts-ignore - Ignoring type mismatch as we know the handler signature is compatible
        this.app.vault.on(event, handler);
    }
    
    /**
     * Helper method to safely unregister vault event handlers with proper typing
     * @param event The event name
     * @param handler The event handler
     */
    private unregisterVaultHandler(event: 'create' | 'modify' | 'delete', handler: (file: TAbstractFile) => void): void {
        // Using Function type cast to bypass TypeScript's strict checking
        // @ts-ignore - Ignoring type mismatch as we know the handler signature is compatible
        this.app.vault.off(event, handler);
    }
    
    /**
     * Remove all embedding-related event listeners
     */
    private removeEmbeddingEventListeners(): void {
        // Only remove if handlers were defined
        if (this.fileCreatedHandler) {
            this.unregisterVaultHandler('create', this.fileCreatedHandler);
        }
        
        if (this.fileModifiedHandler) {
            this.unregisterVaultHandler('modify', this.fileModifiedHandler);
        }
        
        if (this.fileDeletedHandler) {
            this.unregisterVaultHandler('delete', this.fileDeletedHandler);
        }
    }
    
    /**
     * Set up event listeners for live embedding
     */
    private setupLiveEmbedding(): void {
        console.log("Setting up live embedding event listeners");
        
        // Handle file creation
        this.fileCreatedHandler = (file: TAbstractFile) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.embedFile(file.path);
            }
        };
        
        // Handle file modification
        this.fileModifiedHandler = (file: TAbstractFile) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.embedFile(file.path);
            }
        };
        
        // Handle file deletion
        this.fileDeletedHandler = (file: TAbstractFile) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.deleteEmbedding(file.path);
            }
        };
        
        // Register event listeners
        this.registerVaultHandler('create', this.fileCreatedHandler);
        this.registerVaultHandler('modify', this.fileModifiedHandler);
        this.registerVaultHandler('delete', this.fileDeletedHandler);
    }
    
    /**
     * Set up event listeners for idle-based embedding
     * Files are added to a queue and processed after a period of inactivity
     */
    private setupIdleEmbedding(): void {
        console.log("Setting up idle-triggered embedding event listeners");
        
        // Get idle threshold from settings
        const idleTimeThreshold = this.settings.settings.memory?.idleTimeThreshold || 60000; // default 1 minute
        
        // Create debounced handler that will process files after idle period
        const processQueueAfterIdle = debounce(() => {
            this.processFileQueue();
        }, idleTimeThreshold);
        
        // Handle file creation
        this.fileCreatedHandler = (file: TAbstractFile) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.pendingFiles.add(file.path);
                processQueueAfterIdle();
            }
        };
        
        // Handle file modification
        this.fileModifiedHandler = (file: TAbstractFile) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.pendingFiles.add(file.path);
                processQueueAfterIdle();
            }
        };
        
        // Handle file deletion
        this.fileDeletedHandler = (file: TAbstractFile) => {
            if (file instanceof TFile && file.extension === 'md') {
                // Remove from pending queue if present
                this.pendingFiles.delete(file.path);
                // Delete embedding
                this.deleteEmbedding(file.path);
            }
        };
        
        // Register event listeners
        this.registerVaultHandler('create', this.fileCreatedHandler);
        this.registerVaultHandler('modify', this.fileModifiedHandler);
        this.registerVaultHandler('delete', this.fileDeletedHandler);
    }
    
    /**
     * Process the queue of pending files
     */
    private async processFileQueue(): Promise<void> {
        if (this.isProcessingFiles || this.pendingFiles.size === 0) {
            return;
        }
        
        // Mark as processing to prevent multiple simultaneous runs
        this.isProcessingFiles = true;
        
        try {
            console.log(`Processing ${this.pendingFiles.size} pending files for embedding`);
            const filePaths = Array.from(this.pendingFiles);
            
            // Clear the queue
            this.pendingFiles.clear();
            
            // Process files in batches with the search service's batch method
            await this.searchService.batchIndexFiles(filePaths);
            
            console.log("Completed processing pending files");
        } catch (error) {
            console.error("Error processing file queue:", error);
            new Notice(`Error generating embeddings: ${(error as Error).message}`);
        } finally {
            this.isProcessingFiles = false;
            
            // If new files were added during processing, schedule another run
            if (this.pendingFiles.size > 0) {
                console.log(`${this.pendingFiles.size} new files added during processing, scheduling another run`);
                this.processFileQueue();
            }
        }
    }
    
    /**
     * Handle startup embedding if configured
     */
    private async handleStartupEmbedding(): Promise<void> {
        const memorySettings = this.settings.settings.memory;
        if (!memorySettings || !memorySettings.embeddingsEnabled) return;
        
        if (memorySettings.embeddingStrategy === 'startup') {
            console.log("Startup embedding strategy detected, indexing all non-indexed files");
            
            // Get all markdown files
            const markdownFiles = this.app.vault.getMarkdownFiles();
            
            // To avoid indexing everything on every startup, we could:
            // 1. Only index files modified since last indexing
            // 2. Only index files that have no embedding yet
            // 3. Skip files that match exclude patterns
            
            // Get existing embeddings
            try {
                const existingEmbeddings = await this.searchService.getAllFileEmbeddings();
                const indexedFilePaths = new Set(existingEmbeddings.map(e => e.filePath));
                
                // Filter to only non-indexed files
                const filesToIndex = markdownFiles
                    .filter(file => !indexedFilePaths.has(file.path))
                    .map(file => file.path);
                
                if (filesToIndex.length > 0) {
                    console.log(`Found ${filesToIndex.length} non-indexed files to process on startup`);
                    
                    // Process files in batches with the search service's batch method
                    await this.searchService.batchIndexFiles(filesToIndex);
                    
                    console.log("Completed startup indexing");
                } else {
                    console.log("No new files to index on startup");
                }
            } catch (error) {
                console.error("Error during startup indexing:", error);
            }
        }
    }
    
    /**
     * Embed a single file
     * @param filePath Path to the file to embed
     */
    private async embedFile(filePath: string): Promise<void> {
        try {
            console.log(`Embedding file: ${filePath}`);
            
            // Use the indexFile method which now shows notices internally
            await this.searchService.indexFile(filePath);
        } catch (error) {
            console.error(`Error embedding file ${filePath}:`, error);
            new Notice(`Error generating embedding for ${filePath}: ${(error as Error).message}`);
        }
    }
    
    /**
     * Delete embedding for a single file
     * @param filePath Path to the file to delete embedding for
     */
    private async deleteEmbedding(filePath: string): Promise<void> {
        try {
            console.log(`Deleting embedding for file: ${filePath}`);
            await this.searchService.deleteFileEmbedding(filePath);
        } catch (error) {
            console.error(`Error deleting embedding for file ${filePath}:`, error);
        }
    }
}