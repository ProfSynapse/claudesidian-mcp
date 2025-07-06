import { App } from 'obsidian';
import ClaudesidianPlugin from '../main';
import { IVectorStore } from '../database/interfaces/IVectorStore';
import { EmbeddingService } from '../database/services/EmbeddingService';
import { HnswSearchService } from '../database/providers/chroma/services/HnswSearchService';
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
 * Service descriptor for lazy initialization
 */
interface ServiceDescriptor<T = any> {
    name: string;
    factory: () => Promise<T>;
    dependencies?: string[];
    initialized: boolean;
    instance?: T;
    initPromise?: Promise<T>;
    priority: 'immediate' | 'on-demand' | 'background';
    loadTriggers?: string[]; // Events that should trigger loading
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
    private backgroundInitQueue: string[] = [];
    private isStarted = false;
    private toolCallCount = 0;
    private vectorStoreTriggered = false;
    private workspaceCache = new Map<string, WorkspaceCacheEntry>();
    private activeWorkspace: string | null = null;

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
        // Core services - immediate initialization
        this.register('eventManager', {
            name: 'eventManager',
            factory: async () => new EventManager(),
            dependencies: [],
            initialized: false,
            priority: 'immediate'
        });

        // Vector store - loads on any tool call (user engagement indicator)
        this.register('vectorStore', {
            name: 'vectorStore',
            factory: async () => this.createVectorStore(),
            dependencies: [],
            initialized: false,
            priority: 'on-demand',
            loadTriggers: ['tool-call', 'workspace-load']
        });

        // Embedding service - loads with vector store
        this.register('embeddingService', {
            name: 'embeddingService',
            factory: async () => new EmbeddingService(this.plugin),
            dependencies: [],
            initialized: false,
            priority: 'on-demand',
            loadTriggers: ['tool-call', 'workspace-load']
        });

        // Search service - loads with vector store but initializes index in background
        this.register('hnswSearchService', {
            name: 'hnswSearchService',
            factory: async () => {
                const vectorStore = await this.get<IVectorStore>('vectorStore');
                const embeddingService = await this.get<EmbeddingService>('embeddingService');
                const service = new HnswSearchService(this.app, vectorStore, embeddingService);
                
                // Initialize with workspace-specific embeddings if available
                this.scheduleWorkspaceIndexing(service);
                
                return service;
            },
            dependencies: ['vectorStore', 'embeddingService'],
            initialized: false,
            priority: 'on-demand',
            loadTriggers: ['tool-call', 'workspace-load']
        });

        // File embedding access - loads with vector store
        this.register('fileEmbeddingAccessService', {
            name: 'fileEmbeddingAccessService',
            factory: async () => {
                const vectorStore = await this.get<IVectorStore>('vectorStore');
                return new FileEmbeddingAccessService(this.plugin, vectorStore);
            },
            dependencies: ['vectorStore'],
            initialized: false,
            priority: 'on-demand',
            loadTriggers: ['tool-call', 'workspace-load']
        });

        // Direct collection service - loads with vector store
        this.register('directCollectionService', {
            name: 'directCollectionService',
            factory: async () => {
                const vectorStore = await this.get<IVectorStore>('vectorStore');
                return new DirectCollectionService(this.plugin, vectorStore);
            },
            dependencies: ['vectorStore'],
            initialized: false,
            priority: 'on-demand',
            loadTriggers: ['tool-call']
        });

        // Workspace service - immediate but enhanced with smart caching
        this.register('workspaceService', {
            name: 'workspaceService',
            factory: async () => this.createEnhancedWorkspaceService(),
            dependencies: [],
            initialized: false,
            priority: 'immediate'
        });

        // Memory service - loads on tool call
        this.register('memoryService', {
            name: 'memoryService',
            factory: async () => {
                const vectorStore = await this.get<IVectorStore>('vectorStore');
                const embeddingService = await this.get<EmbeddingService>('embeddingService');
                return new MemoryService(this.plugin, vectorStore, embeddingService, this.plugin.settings);
            },
            dependencies: ['vectorStore', 'embeddingService'],
            initialized: false,
            priority: 'on-demand',
            loadTriggers: ['tool-call', 'workspace-load']
        });

        // File event manager - immediate but with smart workspace monitoring
        this.register('fileEventManager', {
            name: 'fileEventManager',
            factory: async () => this.createSmartFileEventManager(),
            dependencies: ['eventManager'],
            initialized: false,
            priority: 'immediate'
        });

        // Usage stats service - background
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
            priority: 'background'
        });

        // Cache manager - enhanced with workspace-aware caching
        this.register('cacheManager', {
            name: 'cacheManager',
            factory: async () => this.createWorkspaceAwareCacheManager(),
            dependencies: ['workspaceService'],
            initialized: false,
            priority: 'background'
        });
    }

    /**
     * Called when any tool is invoked - triggers vector store loading
     */
    async onToolCall(): Promise<void> {
        this.toolCallCount++;
        
        if (!this.vectorStoreTriggered) {
            this.vectorStoreTriggered = true;
            console.log('[LazyServiceManager] Tool call detected - triggering vector services...');
            
            // Trigger loading of vector-dependent services in background
            this.triggerServicesByEvent('tool-call');
        }
    }

    /**
     * Called when workspace is loaded - triggers smart caching
     */
    async onWorkspaceLoad(workspaceId: string, workspacePath?: string[]): Promise<void> {
        this.activeWorkspace = workspaceId;
        console.log(`[LazyServiceManager] Workspace loaded: ${workspaceId} - triggering smart caching...`);
        
        // Trigger workspace-aware services
        this.triggerServicesByEvent('workspace-load');
        
        // Start intelligent workspace caching
        this.scheduleWorkspaceCaching(workspaceId, workspacePath);
    }

    /**
     * Trigger services based on events
     */
    private triggerServicesByEvent(event: string): void {
        const servicesToLoad = Array.from(this.services.values())
            .filter(s => s.loadTriggers?.includes(event) && !s.initialized)
            .map(s => s.name);

        if (servicesToLoad.length > 0) {
            console.log(`[LazyServiceManager] Triggering services for event '${event}':`, servicesToLoad);
            
            // Load services in background
            setTimeout(async () => {
                try {
                    await Promise.all(servicesToLoad.map(name => this.get(name)));
                    console.log(`[LazyServiceManager] Services loaded for event '${event}'`);
                } catch (error) {
                    console.warn(`[LazyServiceManager] Error loading services for event '${event}':`, error);
                }
            }, 50); // Small delay to avoid blocking current operation
        }
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
        
        console.log(`[LazyServiceManager] Caching ${relatedFiles.size} files for workspace ${workspaceId}`);
        
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
                            console.warn(`[LazyServiceManager] Could not load embedding for ${filePath}:`, error);
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

        console.log(`[LazyServiceManager] Cached ${embeddings.size} embeddings for workspace ${workspaceId}`);
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
                console.log(`[LazyServiceManager] Pre-loading HNSW index with ${cacheEntry.embeddings.size} workspace embeddings`);
                
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
                        console.log(`[LazyServiceManager] HNSW index pre-loaded with workspace data`);
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
            console.log(`[LazyServiceManager] Initialized ${descriptor.name} (${duration}ms)`);
            
            return instance;
        } catch (error) {
            console.error(`[LazyServiceManager] Failed to initialize ${descriptor.name}:`, error);
            throw error;
        }
    }

    /**
     * Start the service manager and initialize immediate services
     */
    async start(): Promise<void> {
        if (this.isStarted) {
            return;
        }

        const startTime = Date.now();
        console.log('[LazyServiceManager] Starting service initialization...');

        // Initialize immediate services in parallel
        const immediateServices = Array.from(this.services.values())
            .filter(s => s.priority === 'immediate')
            .map(s => s.name);

        await Promise.all(immediateServices.map(name => this.get(name)));

        // Queue background services for later initialization
        this.backgroundInitQueue = Array.from(this.services.values())
            .filter(s => s.priority === 'background')
            .map(s => s.name);

        // Start background initialization
        this.startBackgroundInitialization();

        this.isStarted = true;
        const duration = Date.now() - startTime;
        console.log(`[LazyServiceManager] Started (${duration}ms) - vector services will load on first tool call`);
    }

    /**
     * Start background initialization of services
     */
    private startBackgroundInitialization(): void {
        if (this.backgroundInitQueue.length === 0) {
            return;
        }

        setTimeout(async () => {
            const batchSize = 2;
            
            while (this.backgroundInitQueue.length > 0) {
                const batch = this.backgroundInitQueue.splice(0, batchSize);
                
                try {
                    await Promise.all(batch.map(name => this.get(name)));
                } catch (error) {
                    console.warn('[LazyServiceManager] Background initialization error:', error);
                }
                
                if (this.backgroundInitQueue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            
            console.log('[LazyServiceManager] Background initialization complete');
        }, 500); // Longer delay for background services
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
            console.log('[LazyServiceManager] Vector store initialized');
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
            type: (this.plugin.settings?.settings?.memory?.embeddingStrategy || 'manual') as 'manual' | 'idle' | 'startup',
            idleTimeThreshold: this.plugin.settings?.settings?.memory?.idleTimeThreshold || 60000,
            batchSize: this.plugin.settings?.settings?.memory?.batchSize || 10,
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
                console.log(`[LazyServiceManager] Using pre-cached workspace data for ${workspaceId}`);
                return;
            }
            return originalWarmCache(workspaceId);
        };
        
        return cacheManager;
    }
}