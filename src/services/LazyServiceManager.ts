import { App } from 'obsidian';
import ClaudesidianPlugin from '../main';
import { IVectorStore } from '../database/interfaces/IVectorStore';
import { EmbeddingService } from '../database/services/EmbeddingService';
import { HnswSearchService } from '../database/services/hnsw/HnswSearchService';
import { FileEmbeddingAccessService } from '../database/services/FileEmbeddingAccessService';
import { DirectCollectionService } from '../database/services/DirectCollectionService';
import { WorkspaceService } from '../database/services/WorkspaceService';
import { MemoryService } from '../database/services/MemoryService';
import { EventManager } from './EventManager';
import { FileEventManagerModular } from './file-events/FileEventManagerModular';
import { UsageStatsService } from '../database/services/UsageStatsService';
import { CacheManager } from '../database/services/CacheManager';
import { VectorStoreFactory } from '../database/factory/VectorStoreFactory';

/**
 * Loading stages for progressive service initialization
 */
enum LoadingStage {
    IMMEDIATE = 1,      // 0-1s: Core plugin ready
    BACKGROUND_FAST = 2, // 1-5s: Basic vector operations
    BACKGROUND_SLOW = 3, // 5-15s: Full semantic search
    ON_DEMAND = 4       // 15s+: Specialized features
}

/**
 * Service descriptor for stage-based lazy initialization
 */
interface ServiceDescriptor<T = any> {
    name: string;
    factory: () => Promise<T>;
    dependencies?: string[];
    initialized: boolean;
    instance?: T;
    initPromise?: Promise<T>;
    stage: LoadingStage;
}

/**
 * Workspace-aware caching service
 */
interface WorkspaceCacheEntry {
    workspaceId: string;
    relatedFiles: Set<string>;
    embeddings: Map<string, any>;
    lastAccessed: number;
}

/**
 * Lazy Service Manager with Smart Workspace Caching
 * Manages service initialization with intelligent loading based on user activity
 */
export class LazyServiceManager {
    private services = new Map<string, ServiceDescriptor>();
    private stageQueues = new Map<LoadingStage, string[]>();
    private currentStage = LoadingStage.IMMEDIATE;
    private isStarted = false;
    private toolCallCount = 0;
    private workspaceCache = new Map<string, WorkspaceCacheEntry>();
    private activeWorkspace: string | null = null;
    private stageProgress = new Map<LoadingStage, { loaded: number; total: number }>();

    constructor(
        private app: App,
        private plugin: ClaudesidianPlugin
    ) {
        this.registerServices();
    }

    /**
     * Register all services with their descriptors and smart loading triggers
     */
    private registerServices(): void {
        // STAGE 1 (IMMEDIATE): Core services only - plugin ready in <1s
        this.register('eventManager', {
            name: 'eventManager',
            factory: async () => new EventManager(),
            dependencies: [],
            initialized: false,
            stage: LoadingStage.IMMEDIATE
        });

        // STAGE 2 (BACKGROUND_FAST): Basic vector operations - ready in 1-5s
        this.register('vectorStore', {
            name: 'vectorStore',
            factory: async () => this.createVectorStore(),
            dependencies: [],
            initialized: false,
            stage: LoadingStage.BACKGROUND_FAST
        });

        this.register('embeddingService', {
            name: 'embeddingService',
            factory: async () => new EmbeddingService(this.plugin),
            dependencies: [],
            initialized: false,
            stage: LoadingStage.BACKGROUND_FAST
        });

        // STAGE 3 (BACKGROUND_SLOW): Full semantic search - loads in background after delay
        this.register('hnswSearchService', {
            name: 'hnswSearchService',
            factory: async () => {
                const vectorStore = await this.get<IVectorStore>('vectorStore');
                const embeddingService = await this.get<EmbeddingService>('embeddingService');
                
                // Get persistent path from memory settings for HNSW optimization
                // HNSW needs the base ChromaDB directory, not the collections subdirectory
                const basePath = this.plugin.settings?.settings?.memory?.dbStoragePath;
                const hnswPath = basePath;
                
                // Create service with new IndexedDB-based architecture
                const service = new HnswSearchService(this.app, vectorStore, embeddingService, hnswPath);
                
                // Initialize with full discovery - now happens in background after startup
                await service.initialize();
                await service.ensureFullyInitialized();
                
                return service;
            },
            dependencies: ['vectorStore', 'embeddingService'],
            initialized: false,
            stage: LoadingStage.BACKGROUND_SLOW
        });

        this.register('workspaceService', {
            name: 'workspaceService',
            factory: async () => {
                const vectorStore = await this.get<IVectorStore>('vectorStore');
                const embeddingService = await this.get<EmbeddingService>('embeddingService');
                return new WorkspaceService(this.plugin, vectorStore, embeddingService);
            },
            dependencies: ['vectorStore', 'embeddingService'],
            initialized: false,
            stage: LoadingStage.BACKGROUND_SLOW
        });

        this.register('memoryService', {
            name: 'memoryService',
            factory: async () => {
                const vectorStore = await this.get<IVectorStore>('vectorStore');
                const embeddingService = await this.get<EmbeddingService>('embeddingService');
                return new MemoryService(this.plugin, vectorStore, embeddingService, this.plugin.settings);
            },
            dependencies: ['vectorStore', 'embeddingService'],
            initialized: false,
            stage: LoadingStage.BACKGROUND_SLOW
        });

        // STAGE 1 (IMMEDIATE): File event manager - no vector dependencies at startup
        this.register('fileEventManager', {
            name: 'fileEventManager',
            factory: async () => this.createSmartFileEventManager(),
            dependencies: ['eventManager'],
            initialized: false,
            stage: LoadingStage.IMMEDIATE
        });

        // STAGE 4 (ON_DEMAND): Specialized features - load when needed
        this.register('fileEmbeddingAccessService', {
            name: 'fileEmbeddingAccessService',
            factory: async () => {
                const vectorStore = await this.get<IVectorStore>('vectorStore');
                return new FileEmbeddingAccessService(this.plugin, vectorStore);
            },
            dependencies: ['vectorStore'],
            initialized: false,
            stage: LoadingStage.ON_DEMAND
        });

        this.register('directCollectionService', {
            name: 'directCollectionService',
            factory: async () => {
                const vectorStore = await this.get<IVectorStore>('vectorStore');
                return new DirectCollectionService(this.plugin, vectorStore);
            },
            dependencies: ['vectorStore'],
            initialized: false,
            stage: LoadingStage.ON_DEMAND
        });

        this.register('usageStatsService', {
            name: 'usageStatsService',
            factory: async () => {
                const embeddingService = await this.get<EmbeddingService>('embeddingService');
                const vectorStore = await this.get<IVectorStore>('vectorStore');
                const eventManager = await this.get<EventManager>('eventManager');
                return new UsageStatsService(
                    embeddingService,
                    vectorStore,
                    this.plugin.settings.settings.memory,
                    eventManager
                );
            },
            dependencies: ['embeddingService', 'vectorStore', 'eventManager'],
            initialized: false,
            stage: LoadingStage.BACKGROUND_SLOW
        });

        this.register('cacheManager', {
            name: 'cacheManager',
            factory: async () => {
                const workspaceService = await this.get<WorkspaceService>('workspaceService');
                const memoryService = await this.get<MemoryService>('memoryService');
                return new CacheManager(this.app, workspaceService, memoryService);
            },
            dependencies: ['workspaceService', 'memoryService'],
            initialized: false,
            stage: LoadingStage.ON_DEMAND
        });
    }

    /**
     * Called when any tool is invoked - tracks usage
     */
    async onToolCall(): Promise<void> {
        this.toolCallCount++;
        // Tool call tracking only - vector store loads automatically in background
    }

    /**
     * Called when workspace is loaded - triggers smart caching
     */
    async onWorkspaceLoad(workspaceId: string, workspacePath?: string[]): Promise<void> {
        this.activeWorkspace = workspaceId;
        
        // Start intelligent workspace caching
        this.scheduleWorkspaceCaching(workspaceId, workspacePath);
    }


    /**
     * Schedule intelligent workspace caching
     */
    private async scheduleWorkspaceCaching(workspaceId: string, workspacePath?: string[]): Promise<void> {
        setTimeout(async () => {
            try {
                await this.cacheWorkspaceFiles(workspaceId, workspacePath);
            } catch (error) {
                console.warn(`[LazyServiceManager] Error caching workspace ${workspaceId}:`, error);
            }
        }, 200); // Delay to let initial workspace load complete
    }

    /**
     * Cache files related to the workspace for fast access
     */
    private async cacheWorkspaceFiles(workspaceId: string, workspacePath?: string[]): Promise<void> {
        const workspaceService = await this.get<WorkspaceService>('workspaceService');
        const fileEmbeddingService = await this.get<FileEmbeddingAccessService>('fileEmbeddingAccessService');
        
        // Get workspace details
        const workspace = await workspaceService.getWorkspace(workspaceId);
        if (!workspace) {
            console.warn(`[LazyServiceManager] Workspace ${workspaceId} not found for caching`);
            return;
        }

        // Find files related to this workspace
        const relatedFiles = await this.findWorkspaceRelatedFiles(workspace, workspacePath);
        
        // Pre-load embeddings for these files
        const embeddings = new Map();
        const batchSize = 10;
        const fileBatches = Array.from(relatedFiles).reduce((batches, file, index) => {
            const batchIndex = Math.floor(index / batchSize);
            if (!batches[batchIndex]) batches[batchIndex] = [];
            batches[batchIndex].push(file);
            return batches;
        }, [] as string[][]);

        for (const batch of fileBatches) {
            try {
                const batchEmbeddings = await Promise.all(
                    batch.map(async (filePath) => {
                        try {
                            const embedding = await fileEmbeddingService.getFileEmbedding(filePath);
                            return { filePath, embedding };
                        } catch (error) {
                            return null;
                        }
                    })
                );
                
                batchEmbeddings.forEach(result => {
                    if (result && result.embedding) {
                        embeddings.set(result.filePath, result.embedding);
                    }
                });
                
                // Small delay between batches
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (error) {
                console.warn(`[LazyServiceManager] Error processing batch for workspace ${workspaceId}:`, error);
            }
        }

        // Cache the workspace data
        this.workspaceCache.set(workspaceId, {
            workspaceId,
            relatedFiles,
            embeddings,
            lastAccessed: Date.now()
        });

        if (embeddings.size > 0) {
        }
    }

    /**
     * Find files related to a workspace based on its configuration
     */
    private async findWorkspaceRelatedFiles(workspace: any, workspacePath?: string[]): Promise<Set<string>> {
        const relatedFiles = new Set<string>();
        
        // Add files from workspace root path if specified
        if (workspace.rootPath) {
            const files = this.app.vault.getFiles()
                .filter(file => file.path.startsWith(workspace.rootPath))
                .map(file => file.path);
            files.forEach(file => relatedFiles.add(file));
        }
        
        // Add files from workspace path if specified
        if (workspacePath && workspacePath.length > 0) {
            const pathPrefix = workspacePath.join('/');
            const files = this.app.vault.getFiles()
                .filter(file => file.path.startsWith(pathPrefix))
                .map(file => file.path);
            files.forEach(file => relatedFiles.add(file));
        }
        
        // Add files from workspace tags if available
        if (workspace.tags && Array.isArray(workspace.tags)) {
            for (const tag of workspace.tags) {
                const taggedFiles = this.app.vault.getFiles()
                    .filter(file => {
                        const cache = this.app.metadataCache.getFileCache(file);
                        return cache?.tags?.some(t => t.tag === tag);
                    })
                    .map(file => file.path);
                taggedFiles.forEach(file => relatedFiles.add(file));
            }
        }
        
        return relatedFiles;
    }

    /**
     * Schedule workspace-specific indexing for HNSW
     */
    private scheduleWorkspaceIndexing(hnswService: HnswSearchService): void {
        if (this.activeWorkspace) {
            const cacheEntry = this.workspaceCache.get(this.activeWorkspace);
            if (cacheEntry && cacheEntry.embeddings.size > 0) {
                
                setTimeout(async () => {
                    try {
                        // Convert cached embeddings to format expected by HNSW
                        const indexData = Array.from(cacheEntry.embeddings.entries()).map(([filePath, embedding]) => ({
                            id: `${cacheEntry.workspaceId}-${filePath}`,
                            embedding: embedding.vector || embedding,
                            metadata: {
                                filePath,
                                workspaceId: cacheEntry.workspaceId,
                                ...embedding.metadata
                            },
                            document: embedding.content || ''
                        }));
                        
                        await hnswService.indexCollection('file_embeddings', indexData);
                    } catch (error) {
                        console.warn('[LazyServiceManager] Error pre-loading HNSW index:', error);
                    }
                }, 100);
            }
        }
    }

    /**
     * Register a service descriptor
     */
    private register<T>(name: string, descriptor: ServiceDescriptor<T>): void {
        this.services.set(name, descriptor);
    }

    /**
     * Get a service instance, initializing if needed
     */
    async get<T>(name: string): Promise<T> {
        const descriptor = this.services.get(name);
        if (!descriptor) {
            throw new Error(`Service '${name}' not found`);
        }

        if (descriptor.initialized && descriptor.instance) {
            return descriptor.instance as T;
        }

        if (descriptor.initPromise) {
            return descriptor.initPromise as Promise<T>;
        }

        // Initialize dependencies first
        if (descriptor.dependencies) {
            await Promise.all(
                descriptor.dependencies.map(dep => this.get(dep))
            );
        }

        // Initialize the service
        descriptor.initPromise = this.initializeService(descriptor);
        const instance = await descriptor.initPromise;
        
        descriptor.instance = instance;
        descriptor.initialized = true;
        descriptor.initPromise = undefined;

        return instance as T;
    }

    /**
     * Initialize a service using its factory
     */
    private async initializeService<T>(descriptor: ServiceDescriptor<T>): Promise<T> {
        const startTime = Date.now();
        
        try {
            const instance = await descriptor.factory();
            
            // Initialize the service if it has an initialize method
            if (instance && typeof (instance as any).initialize === 'function') {
                await (instance as any).initialize();
            }
            
            const duration = Date.now() - startTime;
            
            return instance;
        } catch (error) {
            console.error(`[LazyServiceManager] Failed to initialize ${descriptor.name}:`, error);
            throw error;
        }
    }

    /**
     * Start the service manager with stage-based initialization
     */
    async start(): Promise<void> {
        if (this.isStarted) {
            return;
        }

        const startTime = Date.now();

        // Initialize stage queues
        this.initializeStageQueues();

        // STAGE 1: Initialize immediate services only (blocking)
        await this.initializeStage(LoadingStage.IMMEDIATE);
        
        this.isStarted = true;
        const duration = Date.now() - startTime;

        // Start cascading background initialization
        this.startCascadingInitialization();
    }

    /**
     * Initialize stage queues with service names organized by stage
     */
    private initializeStageQueues(): void {
        // Clear existing queues
        this.stageQueues.clear();
        
        // Organize services by stage
        for (const [name, descriptor] of this.services) {
            const stage = descriptor.stage;
            if (!this.stageQueues.has(stage)) {
                this.stageQueues.set(stage, []);
            }
            this.stageQueues.get(stage)!.push(name);
        }
        
        // Initialize progress tracking
        for (const [stage, serviceNames] of this.stageQueues) {
            this.stageProgress.set(stage, { loaded: 0, total: serviceNames.length });
        }
        
    }

    /**
     * Initialize all services in a specific stage
     */
    private async initializeStage(stage: LoadingStage): Promise<void> {
        const serviceNames = this.stageQueues.get(stage) || [];
        if (serviceNames.length === 0) {
            return;
        }

        const stageName = LoadingStage[stage];
        
        const startTime = Date.now();
        
        // Initialize services in parallel within the stage
        const promises = serviceNames.map(async (name) => {
            try {
                await this.get(name);
                
                // Update progress
                const progress = this.stageProgress.get(stage)!;
                progress.loaded++;
                this.stageProgress.set(stage, progress);
                
            } catch (error) {
                console.error(`[LazyServiceManager] ✗ Failed to initialize ${name}:`, error);
                throw error;
            }
        });
        
        await Promise.all(promises);
        
        const duration = Date.now() - startTime;
    }

    /**
     * Start cascading background initialization for remaining stages
     * Now properly deferred until after plugin startup completes
     */
    private startCascadingInitialization(): void {
        // Wait for plugin to fully complete startup before starting background services
        setTimeout(async () => {
            try {
                console.log('[LazyServiceManager] Starting background services after plugin startup...');
                await this.initializeStage(LoadingStage.BACKGROUND_FAST);
                
                // After BACKGROUND_FAST, start BACKGROUND_SLOW (includes HNSW)
                setTimeout(async () => {
                    try {
                        console.log('[LazyServiceManager] Starting slow background services (including HNSW)...');
                        await this.initializeStage(LoadingStage.BACKGROUND_SLOW);
                        
                        // Process startup queue now that embedding services are ready
                        await this.processStartupQueueIfNeeded();
                        
                        // Initialize agents now that HNSW and all core services are ready
                        await this.initializeAgentsInBackground();
                        
                        console.log('[LazyServiceManager] All background services loaded');
                        // ON_DEMAND services are initialized only when requested
                    } catch (error) {
                        console.warn('[LazyServiceManager] Background slow initialization failed:', error);
                    }
                }, 2000); // 2s delay to ensure plugin startup is complete
                
            } catch (error) {
                console.warn('[LazyServiceManager] Background fast initialization failed:', error);
            }
        }, 3000); // 3s delay to ensure plugin startup is fully complete
    }

    /**
     * Initialize agents in background after all core services are ready
     */
    private async initializeAgentsInBackground(): Promise<void> {
        try {
            
            // Get the connector from the plugin and initialize agents
            const plugin = this.plugin as any;
            if (plugin.connector) {
                await plugin.connector.initializeAgents();
            } else {
                console.warn('[LazyServiceManager] No connector found for agent initialization');
            }
        } catch (error) {
            console.error('[LazyServiceManager] Failed to initialize agents in background:', error);
        }
    }

    /**
     * Process startup queue if file event manager is using startup strategy
     */
    private async processStartupQueueIfNeeded(): Promise<void> {
        try {
            const fileEventManager = this.getIfReady<FileEventManagerModular>('fileEventManager');
            if (!fileEventManager) {
                console.warn('[LazyServiceManager] File event manager not ready for startup queue processing');
                return;
            }

            const strategy = fileEventManager.getEmbeddingStrategy();
            if (strategy.type === 'startup') {
                await fileEventManager.processStartupQueue();
            }
        } catch (error) {
            console.error('[LazyServiceManager] Error processing startup queue:', error);
        }
    }

    /**
     * Get all initialized services
     */
    getAllInitialized(): Record<string, any> {
        const services: Record<string, any> = {};
        
        for (const [name, descriptor] of this.services) {
            if (descriptor.initialized && descriptor.instance) {
                services[name] = descriptor.instance;
            }
        }
        
        return services;
    }

    /**
     * Check if a service is initialized
     */
    isInitialized(name: string): boolean {
        const descriptor = this.services.get(name);
        return descriptor?.initialized || false;
    }

    /**
     * Check if a service is ready for use (initialized and not currently initializing)
     */
    isReady(name: string): boolean {
        const descriptor = this.services.get(name);
        return Boolean(descriptor?.initialized && !descriptor?.initPromise);
    }

    /**
     * Check if all services in a stage are ready
     */
    isStageReady(stage: LoadingStage): boolean {
        const serviceNames = this.stageQueues.get(stage) || [];
        return serviceNames.every(name => this.isReady(name));
    }

    /**
     * Get service readiness status for diagnostics
     */
    getReadinessStatus(): Record<string, { stage: number; ready: boolean; initialized: boolean }> {
        const status: Record<string, { stage: number; ready: boolean; initialized: boolean }> = {};
        
        for (const [name, descriptor] of this.services) {
            status[name] = {
                stage: descriptor.stage,
                ready: this.isReady(name),
                initialized: descriptor.initialized
            };
        }
        
        return status;
    }

    /**
     * Get a service if ready, otherwise return null without initializing
     */
    getIfReady<T>(name: string): T | null {
        const descriptor = this.services.get(name);
        if (descriptor?.initialized && descriptor.instance) {
            return descriptor.instance as T;
        }
        return null;
    }

    /**
     * Wait for a service to be ready with timeout
     */
    async waitForService<T>(name: string, timeoutMs: number = 10000): Promise<T | null> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            if (this.isReady(name)) {
                return this.getIfReady<T>(name);
            }
            
            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.warn(`[LazyServiceManager] Timeout waiting for service '${name}' (${timeoutMs}ms)`);
        return null;
    }

    /**
     * Wait for an entire stage to be ready
     */
    async waitForStage(stage: LoadingStage, timeoutMs: number = 30000): Promise<boolean> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            if (this.isStageReady(stage)) {
                return true;
            }
            
            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.warn(`[LazyServiceManager] Timeout waiting for stage ${stage} (${timeoutMs}ms)`);
        return false;
    }

    /**
     * Get workspace cache information
     */
    getWorkspaceCache(workspaceId: string): WorkspaceCacheEntry | undefined {
        return this.workspaceCache.get(workspaceId);
    }

    /**
     * Clear workspace cache
     */
    clearWorkspaceCache(workspaceId?: string): void {
        if (workspaceId) {
            this.workspaceCache.delete(workspaceId);
        } else {
            this.workspaceCache.clear();
        }
    }

    /**
     * Cleanup all services
     */
    async cleanup(): Promise<void> {
        for (const [name, descriptor] of this.services) {
            if (descriptor.initialized && descriptor.instance) {
                if (typeof (descriptor.instance as any).cleanup === 'function') {
                    try {
                        await (descriptor.instance as any).cleanup();
                    } catch (error) {
                        console.warn(`[LazyServiceManager] Error cleaning up ${name}:`, error);
                    }
                }
            }
        }
        
        this.workspaceCache.clear();
    }

    /**
     * Create vector store instance
     */
    private async createVectorStore(): Promise<IVectorStore> {
        const path = require('path');
        
        let basePath;
        if (this.app.vault.adapter instanceof require('obsidian').FileSystemAdapter) {
            basePath = (this.app.vault.adapter as any).getBasePath();
        } else {
            throw new Error('FileSystemAdapter not available');
        }
        
        const pluginDir = path.join(basePath, '.obsidian', 'plugins', this.plugin.manifest.id);
        const dataDir = path.join(pluginDir, 'data', 'chroma-db');
        
        const memorySettings = this.plugin.settings.settings.memory;
        if (!memorySettings) {
            throw new Error('Memory settings not found');
        }
        
        const providerId = memorySettings.apiProvider;
        const providerSettings = memorySettings.providerSettings?.[providerId];
        
        if (!providerSettings?.dimensions) {
            throw new Error(`Embedding dimensions not configured for provider ${providerId}`);
        }

        const vectorStore = VectorStoreFactory.createVectorStore(this.plugin, {
            persistentPath: dataDir,
            inMemory: false,
            embedding: {
                dimension: providerSettings.dimensions,
                model: providerSettings.model
            }
        });

        vectorStore.startSystemOperation();
        
        try {
            await vectorStore.initialize();
        } finally {
            vectorStore.endSystemOperation();
        }

        return vectorStore;
    }

    /**
     * Create enhanced workspace service with smart caching hooks
     */
    private async createEnhancedWorkspaceService(): Promise<WorkspaceService> {
        // Create workspace service without vector dependencies initially
        const service = new (class extends WorkspaceService {
            constructor(plugin: ClaudesidianPlugin, serviceManager: LazyServiceManager) {
                // Initialize with null dependencies - will be loaded lazily
                super(plugin, null as any, null as any);
                this.serviceManager = serviceManager;
            }

            private serviceManager: LazyServiceManager;

            async getWorkspace(id: string) {
                const result = await super.getWorkspace(id);
                if (result) {
                    // Trigger workspace caching when workspace is accessed
                    this.serviceManager.onWorkspaceLoad(id);
                }
                return result;
            }

            async setActiveWorkspace(id: string) {
                // Trigger workspace caching when workspace is set as active
                this.serviceManager.onWorkspaceLoad(id);
                return true;
            }
        })(this.plugin, this);

        return service;
    }

    /**
     * Create smart file event manager with workspace awareness
     */
    private async createSmartFileEventManager(): Promise<FileEventManagerModular> {
        const eventManager = await this.get<EventManager>('eventManager');
        
        const embeddingStrategy = {
            type: (this.plugin.settings?.settings?.memory?.embeddingStrategy || 'idle') as 'idle' | 'startup',
            idleTimeThreshold: this.plugin.settings?.settings?.memory?.idleTimeThreshold || 60000,
            batchSize: 10,
            processingDelay: 1000
        };

        const fileEventManager = new FileEventManagerModular(
            this.app,
            this.plugin,
            null as any,
            null as any,
            null as any,
            eventManager,
            embeddingStrategy
        );

        // Override service getters for lazy loading
        (fileEventManager as any).getMemoryService = async () => {
            return await this.get<MemoryService>('memoryService');
        };

        (fileEventManager as any).getWorkspaceService = async () => {
            return await this.get<WorkspaceService>('workspaceService');
        };

        (fileEventManager as any).getEmbeddingService = async () => {
            return await this.get<EmbeddingService>('embeddingService');
        };

        return fileEventManager;
    }

    /**
     * Create workspace-aware cache manager
     */
    private async createWorkspaceAwareCacheManager(): Promise<CacheManager> {
        const workspaceService = await this.get<WorkspaceService>('workspaceService');
        const memoryService = await this.get<MemoryService>('memoryService');
        
        const cacheManager = new CacheManager(this.app, workspaceService, memoryService);
        
        // Override warmCache to use our workspace cache
        const originalWarmCache = cacheManager.warmCache.bind(cacheManager);
        (cacheManager as any).warmCache = async (workspaceId: string) => {
            const cacheEntry = this.workspaceCache.get(workspaceId);
            if (cacheEntry) {
                return;
            }
            return originalWarmCache(workspaceId);
        };
        
        return cacheManager;
    }
}