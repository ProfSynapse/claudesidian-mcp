import { Plugin, Notice } from 'obsidian';
import { UpdateManager } from './utils/UpdateManager';
import { MCPConnector } from './connector';
import { Settings } from './settings';
import { SettingsTab } from './components/SettingsTab';
import { ServiceContainer } from './core/ServiceContainer';
import { logger } from './utils/logger';

// Type imports for service interfaces
import type { EmbeddingService } from './database/services/EmbeddingService';
import type { FileEmbeddingAccessService } from './database/services/FileEmbeddingAccessService';
import type { DirectCollectionService } from './database/services/DirectCollectionService';
import type { IVectorStore } from './database/interfaces/IVectorStore';
import type { WorkspaceService } from './database/services/WorkspaceService';
import type { MemoryService } from './database/services/MemoryService';
import type { EventManager } from './services/EventManager';
import type { FileEventManagerModular } from './services/file-events/FileEventManagerModular';
import type { UsageStatsService } from './database/services/UsageStatsService';
import type { CacheManager } from './database/services/CacheManager';
import type { ProcessedFilesStateManager } from './database/services/state/ProcessedFilesStateManager';
import type { MemoryTraceService } from './database/services/memory/MemoryTraceService';
import type { ToolCallCaptureService } from './services/toolcall-capture/ToolCallCaptureService';

export default class ClaudesidianPlugin extends Plugin {
    public settings!: Settings;
    private connector!: MCPConnector;
    private settingsTab!: SettingsTab;
    private serviceContainer!: ServiceContainer;
    private isInitialized: boolean = false;
    private startTime: number = Date.now();
    
    // Service properties - now proxied through ServiceContainer for singleton management
    public get vectorStore(): IVectorStore | null { 
        return this.serviceContainer?.getIfReady<IVectorStore>('vectorStore') || null; 
    }
    public get embeddingService(): EmbeddingService | null { 
        return this.serviceContainer?.getIfReady<EmbeddingService>('embeddingService') || null; 
    }
    public get fileEmbeddingAccessService(): FileEmbeddingAccessService | null { 
        return this.serviceContainer?.getIfReady<FileEmbeddingAccessService>('fileEmbeddingAccessService') || null; 
    }
    public get directCollectionService(): DirectCollectionService | null { 
        return this.serviceContainer?.getIfReady<DirectCollectionService>('directCollectionService') || null; 
    }
    public get workspaceService(): WorkspaceService | null { 
        return this.serviceContainer?.getIfReady<WorkspaceService>('workspaceService') || null; 
    }
    public get memoryService(): MemoryService | null { 
        return this.serviceContainer?.getIfReady<MemoryService>('memoryService') || null; 
    }
    public get fileEventManager(): FileEventManagerModular | null { 
        return this.serviceContainer?.getIfReady<FileEventManagerModular>('fileEventManager') || null; 
    }
    public get eventManager(): EventManager | null { 
        return this.serviceContainer?.getIfReady<EventManager>('eventManager') || null; 
    }
    public get usageStatsService(): UsageStatsService | null { 
        return this.serviceContainer?.getIfReady<UsageStatsService>('usageStatsService') || null; 
    }
    public get cacheManager(): CacheManager | null { 
        return this.serviceContainer?.getIfReady<CacheManager>('cacheManager') || null; 
    }
    public get stateManager(): ProcessedFilesStateManager | null { 
        return this.serviceContainer?.getIfReady<ProcessedFilesStateManager>('stateManager') || null; 
    }
    public get memoryTraceService(): MemoryTraceService | null { 
        return this.serviceContainer?.getIfReady<MemoryTraceService>('memoryTraceService') || null; 
    }
    public get toolCallCaptureService(): ToolCallCaptureService | null { 
        return this.serviceContainer?.getIfReady<ToolCallCaptureService>('toolCallCaptureService') || null; 
    }
    
    /**
     * Get a service asynchronously, waiting for it to be ready if needed
     */
    public async getService<T>(name: string, timeoutMs: number = 10000): Promise<T | null> {
        if (!this.serviceContainer) {
            return null;
        }
        
        // If already ready, return immediately
        if (this.serviceContainer.isReady(name)) {
            return this.serviceContainer.getIfReady<T>(name);
        }
        
        // Otherwise try to get it (will initialize if needed)
        try {
            return await this.serviceContainer.get<T>(name);
        } catch (error) {
            console.warn(`[ClaudesidianPlugin] Failed to get service '${name}':`, error);
            return null;
        }
    }
    
    // Service registry - returns initialized services from container
    public get services(): Record<string, any> {
        if (!this.serviceContainer) return {};
        
        const services: Record<string, any> = {};
        for (const serviceName of this.serviceContainer.getReadyServices()) {
            services[serviceName] = this.serviceContainer.getIfReady(serviceName);
        }
        return services;
    }
    
    async onload() {
        console.log('[ClaudesidianPlugin] 🚨🚨🚨 PLUGIN ONLOAD CALLED - FRESH START V2:', Date.now());
        const startTime = Date.now();
        
        try {
            // PHASE 1: Foundation - Create service container and settings (<50ms)
            this.settings = new Settings(this);
            this.serviceContainer = new ServiceContainer();
            
            // PHASE 2: Register core services (no initialization yet)
            this.registerCoreServices();
            
            // PHASE 3: Initialize essential services only
            await this.initializeEssentialServices();
            
            // Initialize connector skeleton (no agents yet)
            this.connector = new MCPConnector(this.app, this);
            
            // Plugin is now "loaded" - defer full initialization to background
            const loadTime = Date.now() - startTime;
            console.log(`[ClaudesidianPlugin] Plugin loaded in ${loadTime}ms`);
            
            // PHASE 4: Start background initialization after onload completes
            setTimeout(() => {
                this.startBackgroundInitialization().catch(error => {
                    console.error('[ClaudesidianPlugin] Background initialization failed:', error);
                });
            }, 0);
            
        } catch (error) {
            console.error('[ClaudesidianPlugin] Critical initialization failure:', error);
            this.enableFallbackMode();
        }
    }
    
    /**
     * Background initialization - runs after onload() completes
     */
    private async startBackgroundInitialization(): Promise<void> {
        const bgStartTime = Date.now();
        
        try {
            // Load settings first
            await this.settings.loadSettings();
            
            // Log data.json for debugging StateManager
            try {
                const data = await this.loadData();
                console.log('[StateManager] Plugin data.json loaded:', {
                    hasProcessedFiles: !!data?.processedFiles,
                    processedFilesCount: data?.processedFiles?.files ? Object.keys(data.processedFiles.files).length : 0,
                    processedFilesVersion: data?.processedFiles?.version,
                    processedFilesLastUpdated: data?.processedFiles?.lastUpdated
                });
            } catch (error) {
                console.warn('[StateManager] Failed to debug data.json:', error);
            }
            
            // Initialize data directories
            await this.initializeDataDirectories();
            
            // Initialize core services in proper dependency order
            await this.initializeBusinessServices();
            
            // Pre-initialize UI-critical services to avoid long loading times
            await this.preInitializeUICriticalServices();
            
            // Validate search functionality
            await this.validateSearchFunctionality();
            
            // Initialize connector with agents
            try {
                await this.connector.initializeAgents();
                await this.connector.start();
            } catch (error) {
                console.warn('[ClaudesidianPlugin] MCP initialization failed:', error);
            }
            
            // Create settings tab
            await this.initializeSettingsTab();
            
            // Register all maintenance commands
            this.registerMaintenanceCommands();
            
            // Check for updates
            this.checkForUpdatesOnStartup();
            
            // Update settings tab with loaded services
            this.updateSettingsTabServices();
            
            // Mark as fully initialized
            this.isInitialized = true;
            
            const bgLoadTime = Date.now() - bgStartTime;
            console.log(`[ClaudesidianPlugin] Background initialization completed in ${bgLoadTime}ms`);
            
        } catch (error) {
            console.error('[ClaudesidianPlugin] Background initialization failed:', error);
        }
    }
    
    /**
     * Register core services with ServiceContainer
     */
    private registerCoreServices(): void {
        console.log('[ClaudesidianPlugin] Registering core services...');
        
        // Foundation services (no dependencies)
        this.serviceContainer.register('eventManager', async () => {
            const { EventManager } = await import('./services/EventManager');
            return new EventManager();
        });
        
        this.serviceContainer.register('stateManager', async () => {
            const { ProcessedFilesStateManager } = await import('./database/services/state/ProcessedFilesStateManager');
            return new ProcessedFilesStateManager(this);
        });
        
        // Memory services
        this.serviceContainer.register('simpleMemoryService', async () => {
            const { SimpleMemoryService } = await import('./services/memory/SimpleMemoryService');
            return new SimpleMemoryService();
        });
        
        this.serviceContainer.register('sessionService', async () => {
            const { SessionService } = await import('./services/session/SessionService');
            const memoryService = await this.serviceContainer.get<any>('simpleMemoryService');
            return new SessionService(memoryService);
        }, { dependencies: ['simpleMemoryService'] });
        
        this.serviceContainer.register('toolCallCaptureService', async (deps) => {
            const { ToolCallCaptureService } = await import('./services/toolcall-capture/ToolCallCaptureService');
            const memoryService = deps.simpleMemoryService;
            const sessionService = deps.sessionService;
            
            // Create service with simple storage initially
            const service = new ToolCallCaptureService(memoryService, sessionService);
            
            // Enable full functionality with embeddings if services are available
            try {
                const memoryTraceService = deps.memoryTraceService;
                const embeddingService = deps.embeddingService;
                
                if (memoryTraceService && embeddingService) {
                    await service.upgrade(memoryTraceService, embeddingService);
                    console.log('[ToolCallCapture] ✅ Initialized with full functionality');
                } else {
                    console.log('[ToolCallCapture] ⏳ Using simple storage mode');
                }
            } catch (error) {
                console.warn('[ToolCallCapture] Failed to enable full functionality:', error);
            }
            
            return service;
        }, { dependencies: ['simpleMemoryService', 'sessionService', 'memoryTraceService', 'embeddingService'] });
        
        // Vector store - CRITICAL: Single instance with proper initialization
        this.serviceContainer.register('vectorStore', async () => {
            console.log('[ServiceContainer] 🚀 Creating SINGLE vectorStore instance');
            const { ChromaVectorStoreModular } = await import('./database/providers/chroma/ChromaVectorStoreModular');
            
            // Get embedding configuration from settings based on actual provider
            const memorySettings = this.settings.settings.memory;
            if (!memorySettings?.apiProvider || !memorySettings?.providerSettings) {
                throw new Error('Memory settings not configured - cannot determine embedding dimensions');
            }
            
            const activeProvider = memorySettings.apiProvider;
            const providerSettings = memorySettings.providerSettings[activeProvider];
            
            if (!providerSettings?.dimensions) {
                throw new Error(`Embedding dimensions not configured for provider '${activeProvider}'`);
            }
            
            const embeddingConfig = {
                dimension: providerSettings.dimensions,
                model: providerSettings.model
            };
            
            console.log(`[VectorStore] Using embedding config for provider '${activeProvider}':`, embeddingConfig);
            
            // Create vectorStore with proper embedding configuration
            const vectorStore = new ChromaVectorStoreModular(this, {
                embedding: embeddingConfig,
                persistentPath: memorySettings.dbStoragePath,
                inMemory: false,
                cache: {
                    enabled: true,
                    maxItems: 1000,
                    ttl: 3600000
                }
            });
            
            await vectorStore.initialize();
            console.log('[ServiceContainer] ✅ VectorStore initialized successfully with embedding dimension:', embeddingConfig.dimension);
            return vectorStore;
        });
        
        // Business services with dependencies
        this.serviceContainer.register('embeddingService', async (deps) => {
            const { EmbeddingService } = await import('./database/services/EmbeddingService');
            return new EmbeddingService(this, deps.stateManager);
        }, { dependencies: ['stateManager'] });
        
        this.serviceContainer.register('memoryService', async (deps) => {
            const { MemoryService } = await import('./database/services/MemoryService');
            return new MemoryService(this, deps.vectorStore, deps.embeddingService, this.settings.settings.memory || {});
        }, { dependencies: ['vectorStore', 'embeddingService'] });
        
        this.serviceContainer.register('workspaceService', async (deps) => {
            const { WorkspaceService } = await import('./database/services/WorkspaceService');
            return new WorkspaceService(this, deps.vectorStore, deps.embeddingService);
        }, { dependencies: ['vectorStore', 'embeddingService'] });
        
        // Memory trace service - moved from registerAdditionalServices to ensure availability
        this.serviceContainer.register('memoryTraceService', async (deps) => {
            const { MemoryTraceService } = await import('./database/services/memory/MemoryTraceService');
            const { VectorStoreFactory } = await import('./database/factory/VectorStoreFactory');
            
            // Create memory trace collection through factory
            const memoryTraceCollection = VectorStoreFactory.createMemoryTraceCollection(deps.vectorStore);
            const sessionCollection = VectorStoreFactory.createSessionCollection(deps.vectorStore, deps.embeddingService);
            const maintenanceService = await import('./database/services/memory/DatabaseMaintenanceService').then(m => new m.DatabaseMaintenanceService(deps.vectorStore, memoryTraceCollection, sessionCollection, {}));
            
            return new MemoryTraceService(memoryTraceCollection, deps.embeddingService, maintenanceService);
        }, { dependencies: ['vectorStore', 'embeddingService'] });
        
        console.log('[ClaudesidianPlugin] Core services registered successfully');
    }
    
    /**
     * Initialize essential services that must be ready immediately
     */
    private async initializeEssentialServices(): Promise<void> {
        console.log('[ClaudesidianPlugin] Initializing essential services...');
        
        try {
            // Initialize only the most critical services synchronously
            await this.serviceContainer.get('eventManager');
            await this.serviceContainer.get('stateManager');
            await this.serviceContainer.get('simpleMemoryService');
            
            console.log('[ClaudesidianPlugin] Essential services initialized');
        } catch (error) {
            console.error('[ClaudesidianPlugin] Essential service initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * Initialize business services with proper dependency resolution
     */
    private async initializeBusinessServices(): Promise<void> {
        console.log('[ClaudesidianPlugin] Initializing business services...');
        
        try {
            // Initialize in dependency order to prevent multiple VectorStore instances
            const vectorStore = await this.serviceContainer.get('vectorStore');
            console.log('[ClaudesidianPlugin] ✅ Single VectorStore instance created');
            
            // Initialize dependent services sequentially to avoid circular dependency issues
            console.log('[ClaudesidianPlugin] Initializing embeddingService...');
            await this.serviceContainer.get('embeddingService');
            console.log('[ClaudesidianPlugin] ✅ EmbeddingService initialized');
            
            console.log('[ClaudesidianPlugin] Initializing memoryService...');
            await this.serviceContainer.get('memoryService');
            console.log('[ClaudesidianPlugin] ✅ MemoryService initialized');
            
            console.log('[ClaudesidianPlugin] Initializing workspaceService...');
            await this.serviceContainer.get('workspaceService');
            console.log('[ClaudesidianPlugin] ✅ WorkspaceService initialized');
            
            console.log('[ClaudesidianPlugin] Initializing memoryTraceService...');
            await this.serviceContainer.get('memoryTraceService');
            console.log('[ClaudesidianPlugin] ✅ MemoryTraceService initialized');
            
            console.log('[ClaudesidianPlugin] Business services initialized');
        } catch (error) {
            console.error('[ClaudesidianPlugin] Business service initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * Enable fallback mode with minimal functionality
     */
    private enableFallbackMode(): void {
        try {
            this.addCommand({
                id: 'troubleshoot-services',
                name: 'Troubleshoot service initialization',
                callback: () => {
                    const stats = this.serviceContainer?.getStats() || { registered: 0, instantiated: 0 };
                    const message = `Service initialization failed. Registered: ${stats.registered}, Ready: ${stats.instantiated}`;
                    new Notice(message, 10000);
                    console.log('[ClaudesidianPlugin] Service troubleshooting:', {
                        isInitialized: this.isInitialized,
                        containerStats: stats,
                        registeredServices: this.serviceContainer?.getRegisteredServices() || []
                    });
                }
            });
            
            console.log('[ClaudesidianPlugin] Fallback mode enabled');
        } catch (error) {
            console.error('[ClaudesidianPlugin] Fallback mode setup failed:', error);
        }
    }
    
    /**
     * Initialize data directories asynchronously in background
     */
    private async initializeDataDirectories(): Promise<void> {
        const fs = require('fs').promises;
        
        try {
            let basePath;
            if (this.app.vault.adapter instanceof require('obsidian').FileSystemAdapter) {
                basePath = (this.app.vault.adapter as any).getBasePath();
            } else {
                console.warn('[ClaudesidianPlugin] FileSystemAdapter not available, using defaults');
                return;
            }
            
            // Use simple string concatenation to avoid path duplication in Electron environment
            const pluginDir = `${basePath}/.obsidian/plugins/${this.manifest.id}`;
            const dataDir = `${pluginDir}/data`;
            const chromaDbDir = `${dataDir}/chroma-db`;
            const collectionsDir = `${chromaDbDir}/collections`;
            
            console.log('[STARTUP] Initializing ChromaDB-only data directories...');
            
            // Create directories in parallel - ChromaDB only  
            await Promise.all([
                fs.mkdir(dataDir, { recursive: true }),
                fs.mkdir(chromaDbDir, { recursive: true }),
                fs.mkdir(collectionsDir, { recursive: true })
            ]);
            
            console.log('[STARTUP] ✅ ChromaDB data directories created successfully');
            
            // Update settings with correct path
            if (!this.settings.settings.memory) {
                this.settings.settings.memory = this.getDefaultMemorySettings(chromaDbDir);
            } else {
                this.settings.settings.memory.dbStoragePath = chromaDbDir;
            }
            
            // Save settings in background
            this.settings.saveSettings().catch(error => {
                console.warn('[ClaudesidianPlugin] Failed to save settings after directory init:', error);
            });
            
            console.log('[ClaudesidianPlugin] Data directories initialized');
            
        } catch (error) {
            console.error('[ClaudesidianPlugin] Failed to initialize data directories:', error);
            // Don't throw - plugin should function without directories for now
        }
    }
    
    /**
     * Get default memory settings
     */
    private getDefaultMemorySettings(chromaDbDir: string) {
        return {
            dbStoragePath: chromaDbDir,
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
            chunkStrategy: 'paragraph' as 'paragraph',
            chunkSize: 512,
            chunkOverlap: 50,
            includeFrontmatter: true,
            excludePaths: ['.obsidian/**/*'],
            minContentLength: 50,
            embeddingStrategy: 'idle' as 'idle',
            idleTimeThreshold: 60000,
            autoCleanOrphaned: true,
            maxDbSize: 500,
            pruningStrategy: 'least-used' as 'least-used',
            defaultResultLimit: 10,
            includeNeighbors: true,
            graphBoostFactor: 0.3,
            backlinksEnabled: true,
            useFilters: true,
            defaultThreshold: 0.7,
            // PHASE 1 COMPATIBILITY: Keep for settings migration (will be ignored by search logic)
            semanticThreshold: 0.5,
            vectorStoreType: 'file-based' as 'file-based'
        };
    }
    
    /**
     * Initialize settings tab asynchronously in background
     * Services will be loaded and UI will update when ready
     */
    private async initializeSettingsTab(): Promise<void> {
        console.log('[STARTUP] Creating Settings UI in background...');
        
        try {
            // Get agent references - may not be available yet
            const vaultLibrarian = this.connector?.getVaultLibrarian();
            const memoryManager = this.connector?.getMemoryManager();
            
            // Create settings tab with current state
            this.settingsTab = new SettingsTab(
                this.app,
                this,
                this.settings,
                this.services, // Pass current services (may be empty initially)
                vaultLibrarian || undefined,
                memoryManager || undefined,
                this.serviceContainer as any // Pass service container for compatibility
            );
            this.addSettingTab(this.settingsTab);
            
            console.log('[STARTUP] Settings tab created successfully');
            
        } catch (error) {
            console.error('[STARTUP] Settings tab initialization failed:', error);
            // Plugin should still function without settings tab
        }
    }
    
    /**
     * Pre-initialize UI-critical services to avoid Memory Management loading delays
     */
    private async preInitializeUICriticalServices(): Promise<void> {
        if (!this.serviceContainer) return;
        
        console.log('[STARTUP] Pre-initializing UI-critical services...');
        const startTime = Date.now();
        
        try {
            // Initialize services that Memory Management accordion depends on
            const uiCriticalServices = [
                'fileEmbeddingAccessService',
                'usageStatsService',
                'cacheManager'
            ];
            
            // Register additional services if not already registered
            this.registerAdditionalServices();
            
            // Initialize in parallel where possible
            await Promise.allSettled(
                uiCriticalServices.map(async (serviceName) => {
                    try {
                        const serviceStart = Date.now();
                        await this.serviceContainer.get(serviceName);
                        const serviceTime = Date.now() - serviceStart;
                        console.log(`[STARTUP] ${serviceName} initialized in ${serviceTime}ms`);
                    } catch (error) {
                        console.warn(`[STARTUP] Failed to pre-initialize ${serviceName}:`, error);
                    }
                })
            );
            
            const totalTime = Date.now() - startTime;
            console.log(`[STARTUP] UI-critical services pre-initialization completed in ${totalTime}ms`);
            
            // Inject vector store into SimpleMemoryService for persistence
            try {
                const vectorStore = this.serviceContainer.getIfReady('vectorStore');
                const simpleMemoryService = this.serviceContainer.getIfReady<any>('simpleMemoryService');
                
                if (vectorStore && simpleMemoryService && typeof simpleMemoryService.setVectorStore === 'function') {
                    simpleMemoryService.setVectorStore(vectorStore);
                    console.log('[STARTUP] ✅ Vector store injected into SimpleMemoryService for memory trace persistence');
                } else {
                    console.warn('[STARTUP] ❌ Vector store or SimpleMemoryService not available for injection');
                }
            } catch (error) {
                console.error('[STARTUP] Failed to inject vector store:', error);
            }
            
        } catch (error) {
            console.error('[STARTUP] UI-critical services pre-initialization failed:', error);
        }
    }

    /**
     * Update settings tab with available services (non-blocking)
     */
    private updateSettingsTabServices(): void {
        if (this.settingsTab) {
            this.settingsTab.updateServices(this.services);
        }
    }
    
    /**
     * Register additional services needed by UI components
     */
    private registerAdditionalServices(): void {
        // Register services that weren't included in core registration
        if (!this.serviceContainer.has('fileEmbeddingAccessService')) {
            this.serviceContainer.register('fileEmbeddingAccessService', async (deps) => {
                const { FileEmbeddingAccessService } = await import('./database/services/FileEmbeddingAccessService');
                return new FileEmbeddingAccessService(this, deps.vectorStore);
            }, { dependencies: ['vectorStore'] });
        }
        
        if (!this.serviceContainer.has('usageStatsService')) {
            this.serviceContainer.register('usageStatsService', async (deps) => {
                const { UsageStatsService } = await import('./database/services/UsageStatsService');
                return new UsageStatsService(deps.embeddingService, deps.vectorStore, this.settings.settings.memory || {});
            }, { dependencies: ['embeddingService', 'vectorStore'] });
        }
        
        if (!this.serviceContainer.has('cacheManager')) {
            this.serviceContainer.register('cacheManager', async (deps) => {
                const { CacheManager } = await import('./database/services/CacheManager');
                return new CacheManager(this.app, deps.workspaceService, deps.memoryService);
            }, { dependencies: ['workspaceService', 'memoryService'] });
        }
        
        // memoryTraceService is now registered in registerCoreServices() to ensure proper initialization order
    }
    
    /**
     * Register maintenance commands
     */
    private registerMaintenanceCommands(): void {
        this.addCommand({
            id: 'repair-collections',
            name: 'Repair vector collections',
            callback: async () => {
                try {
                    const notice = new Notice('Repairing vector collections...', 0);
                    
                    const vectorStore = await this.getService<IVectorStore>('vectorStore', 15000);
                    if (!vectorStore) {
                        notice.setMessage('Vector store not available or failed to initialize');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    if (typeof (vectorStore as any).repairCollections !== 'function') {
                        notice.setMessage('Repair function not available');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const result = await (vectorStore as any).repairCollections();
                    
                    if (result.success) {
                        notice.setMessage(`Repair successful: ${result.repairedCollections.length} collections restored`);
                    } else {
                        notice.setMessage(`Repair completed with issues: ${result.errors.length} errors`);
                        console.error('Collection repair errors:', result.errors);
                    }
                    
                    setTimeout(() => notice.hide(), 5000);
                } catch (error) {
                    new Notice(`Repair failed: ${(error as Error).message}`);
                    console.error('Collection repair error:', error);
                }
            }
        });
        
        this.addCommand({
            id: 'cleanup-obsolete-collections',
            name: 'Clean up obsolete HNSW collections',
            callback: async () => {
                try {
                    const notice = new Notice('Cleaning up obsolete HNSW collections...', 0);
                    
                    const vectorStore = await this.getService<IVectorStore>('vectorStore', 15000);
                    if (!vectorStore) {
                        notice.setMessage('Vector store not available or failed to initialize');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    // Access the collection manager through the vector store
                    const collectionManager = (vectorStore as any).collectionManager;
                    if (!collectionManager || typeof collectionManager.cleanupObsoleteCollections !== 'function') {
                        notice.setMessage('Collection cleanup not available');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const result = await collectionManager.cleanupObsoleteCollections();
                    
                    if (result.cleaned.length > 0) {
                        notice.setMessage(`Cleaned up ${result.cleaned.length} collections: ${result.cleaned.join(', ')}`);
                    } else {
                        notice.setMessage('No obsolete collections found to clean up');
                    }
                    
                    if (result.errors.length > 0) {
                        console.warn('Collection cleanup errors:', result.errors);
                    }
                    
                    setTimeout(() => notice.hide(), 8000);
                } catch (error) {
                    new Notice(`Cleanup failed: ${(error as Error).message}`);
                    console.error('Collection cleanup error:', error);
                }
            }
        });
        
        this.addCommand({
            id: 'check-vector-storage',
            name: 'Check vector storage status',
            callback: async () => {
                try {
                    const notice = new Notice('Checking vector storage...', 0);
                    
                    const vectorStore = await this.getService<IVectorStore>('vectorStore', 15000);
                    if (!vectorStore) {
                        notice.setMessage('Vector store not available or failed to initialize');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const diagnostics = await vectorStore.getDiagnostics();
                    
                    const message = [
                        `Storage mode: ${diagnostics.storageMode}`,
                        `Path: ${diagnostics.persistentPath}`,
                        `Collections: ${diagnostics.totalCollections}`,
                        `Directory exists: ${diagnostics.dataDirectoryExists ? 'Yes' : 'No'}`,
                        `Permissions OK: ${diagnostics.filePermissionsOk ? 'Yes' : 'No'}`
                    ].join('\n');
                    
                    notice.setMessage(message);
                    
                    setTimeout(() => notice.hide(), 10000);
                } catch (error) {
                    new Notice(`Diagnostics failed: ${(error as Error).message}`);
                    console.error('Diagnostics error:', error);
                }
            }
        });
        
        this.addCommand({
            id: 'check-service-readiness',
            name: 'Check service readiness status',
            callback: async () => {
                try {
                    const notice = new Notice('Checking service readiness...', 0);
                    
                    if (!this.serviceContainer) {
                        notice.setMessage('Service container not available');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const stats = this.serviceContainer.getStats();
                    const metadata = this.serviceContainer.getAllServiceMetadata();
                    
                    const readyServices = Object.values(metadata).filter(m => m.initialized).length;
                    const totalServices = Object.keys(metadata).length;
                    
                    const message = [
                        `Services: ${readyServices}/${totalServices} ready`,
                        `Registered: ${stats.registered}`,
                        `Instantiated: ${stats.instantiated}`,
                        `Singletons: ${stats.singletons}`,
                        `Plugin initialized: ${this.isInitialized ? 'Yes' : 'No'}`
                    ].join('\n');
                    
                    notice.setMessage(message);
                    
                    setTimeout(() => notice.hide(), 8000);
                } catch (error) {
                    new Notice(`Readiness check failed: ${(error as Error).message}`);
                    console.error('Service readiness check error:', error);
                }
            }
        });
    }
    
    /**
     * Check for updates on startup in background
     */
    private async checkForUpdatesOnStartup(): Promise<void> {
        // Run in background to avoid blocking startup
        setTimeout(async () => {
            try {
                const lastCheck = this.settings.settings.lastUpdateCheckDate;
                if (lastCheck) {
                    const lastCheckTime = new Date(lastCheck);
                    const now = new Date();
                    const daysDiff = (now.getTime() - lastCheckTime.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysDiff < 1) {
                        return;
                    }
                }

                const updateManager = new UpdateManager(this);
                const hasUpdate = await updateManager.checkForUpdate();
                
                this.settings.settings.lastUpdateCheckDate = new Date().toISOString();
                
                if (hasUpdate) {
                    const release = await (updateManager as any).fetchLatestRelease();
                    const availableVersion = release.tag_name.replace('v', '');
                    
                    this.settings.settings.availableUpdateVersion = availableVersion;
                    
                    new Notice(`Plugin update available: v${availableVersion}. Check settings to update.`, 8000);
                } else {
                    this.settings.settings.availableUpdateVersion = undefined;
                }
                
                await this.settings.saveSettings();
                
            } catch (error) {
                console.error('Failed to check for updates:', error);
            }
        }, 2000); // 2 second delay
    }
    
    /**
     * Reload configuration for all services after settings change
     */
    reloadConfiguration(): void {
        if (this.serviceContainer?.isReady('fileEventManager')) {
            const fileEventManager = this.serviceContainer.getIfReady('fileEventManager');
            if (fileEventManager && typeof (fileEventManager as any).reloadConfiguration === 'function') {
                try {
                    (fileEventManager as any).reloadConfiguration();
                    console.log('[ClaudesidianPlugin] File event manager configuration reloaded');
                } catch (error) {
                    console.warn('Error reloading file event manager configuration:', error);
                }
            }
        }
    }
    
    /**
     * Get the connector instance
     */
    getConnector(): MCPConnector {
        return this.connector;
    }
    
    /**
     * Validate search functionality - ensure core services are available
     */
    private async validateSearchFunctionality(): Promise<void> {
        try {
            // Test 1: Validate vectorStore service is available (ChromaDB)
            const vectorStore = await this.getService<IVectorStore>('vectorStore', 5000);
            if (vectorStore) {
                // Test basic collection operations
                try {
                    const collections = await vectorStore.listCollections();
                    console.log('[VALIDATION] ✅ VectorStore collections accessible');
                } catch (collectionError) {
                    console.warn('[VALIDATION] Collection access error (may be normal during startup):', collectionError);
                }
            } else {
                console.warn('[VALIDATION] ⚠️ VectorStore service not available');
            }
            
            // Test 2: Validate core services are available
            const serviceContainer = this.serviceContainer;
            if (serviceContainer) {
                const metadata = serviceContainer.getAllServiceMetadata();
                const serviceNames = Object.keys(metadata);
                
                const coreServices = ['vectorStore', 'embeddingService', 'workspaceService', 'memoryService'];
                const availableCore = coreServices.filter(service => serviceNames.includes(service));
                console.log(`[VALIDATION] Core services available: ${availableCore.length}/${coreServices.length}`);
            }
            
        } catch (error) {
            console.warn('[VALIDATION] Service validation error:', error);
        }
    }

    /**
     * Get the settings instance
     */
    getSettings(): Settings {
        return this.settings;
    }
    
    /**
     * Get the memory manager agent
     */
    getMemoryManager(): any {
        return this.connector?.getMemoryManager();
    }
    
    /**
     * Get service container instance (compatibility method)
     */
    getServiceManager(): ServiceContainer {
        return this.serviceContainer;
    }
    
    /**
     * Get service container for direct access
     */
    getServiceContainer(): ServiceContainer {
        return this.serviceContainer;
    }
    
    async onunload() {
        
        try {
            // NEW: Save processed files state before cleanup
            const stateManager = this.stateManager;
            if (stateManager) {
                await stateManager.saveState();
                console.log('[ClaudesidianPlugin] Processed files state saved');
            }
            
            // Cleanup settings tab accordions
            if (this.settingsTab && typeof (this.settingsTab as any).cleanup === 'function') {
                (this.settingsTab as any).cleanup();
            }
            
            // Cleanup service container (handles all service cleanup)
            if (this.serviceContainer) {
                this.serviceContainer.clear();
            }
            
            // Stop the MCP connector
            if (this.connector) {
                await this.connector.stop();
            }
            
        } catch (error) {
            console.error('[ClaudesidianPlugin] Error during cleanup:', error);
        }
    }
}
