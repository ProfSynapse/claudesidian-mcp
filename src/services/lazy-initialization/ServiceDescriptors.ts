import { App } from 'obsidian';
import ClaudesidianPlugin from '../../main';
import { IServiceDescriptor, LoadingStage } from './ServiceManagerInterfaces';
import { IVectorStore } from '../../database/interfaces/IVectorStore';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { FileEmbeddingAccessService } from '../../database/services/FileEmbeddingAccessService';
import { DirectCollectionService } from '../../database/services/DirectCollectionService';
import { WorkspaceService } from '../../database/services/WorkspaceService';
import { MemoryService } from '../../database/services/MemoryService';
import { EventManager } from '../EventManager';
import { FileEventManagerModular } from '../file-events/FileEventManagerModular';
import { UsageStatsService } from '../../database/services/UsageStatsService';
import { CacheManager } from '../../database/services/CacheManager';
import { VectorStoreFactory } from '../../database/factory/VectorStoreFactory';
import { ProcessedFilesStateManager } from '../../database/services/state/ProcessedFilesStateManager';
import { 
  IInitializationStateManager,
  ICollectionLoadingCoordinator,
  IInitializationCoordinator,
  createInitializationServices
} from '../initialization';
import { MetadataManager } from '../../database/providers/chroma/collection/metadata/MetadataManager';

/**
 * Service Descriptors - Configuration-driven service definitions
 * Follows Open/Closed Principle - easy to add new services without modifying existing code
 * Enhanced with initialization coordination to prevent duplicate initialization
 */
export class ServiceDescriptors {
    private app: App;
    private plugin: ClaudesidianPlugin;
    private dependencyResolver: (name: string) => Promise<any>;
    private serviceManager: any = null; // Reference to the actual LazyServiceManager
    private initializationServices: {
        stateManager: IInitializationStateManager;
        collectionCoordinator: ICollectionLoadingCoordinator;
        coordinator: IInitializationCoordinator;
    } | null = null;

    constructor(app: App, plugin: ClaudesidianPlugin) {
        this.app = app;
        this.plugin = plugin;
        this.dependencyResolver = () => Promise.reject(new Error('Dependency resolver not set'));
    }

    /**
     * Set dependency resolver and service manager reference (injected by service manager)
     */
    setDependencyResolver(resolver: (name: string) => Promise<any>): void {
        this.dependencyResolver = resolver;
    }

    /**
     * Set service manager reference (the actual LazyServiceManager instance)
     */
    setServiceManager(serviceManager: any): void {
        // CRITICAL: Validate that this is the correct service manager type
        if (!serviceManager) {
            throw new Error('DIAGNOSTIC FAILURE: Cannot set null/undefined service manager');
        }
        
        if (typeof serviceManager.get !== 'function') {
            throw new Error(`DIAGNOSTIC FAILURE: Service manager missing 'get' method. Type: ${serviceManager.constructor.name}, Methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(serviceManager))}`);
        }
        
        // Additional validation - make sure this isn't another ServiceDescriptors instance
        if (serviceManager.constructor.name === 'ServiceDescriptors') {
            throw new Error('DIAGNOSTIC FAILURE: Cannot set ServiceDescriptors as service manager - this creates circular reference');
        }
        
        this.serviceManager = serviceManager;
        console.log('[ServiceDescriptors] ✅ Valid service manager reference set:', serviceManager.constructor.name);
    }

    /**
     * Initialize coordination services - FIXED to prevent circular dependency
     * Boy Scout Rule: Cleaner, safer initialization logic
     */
    async initializeCoordinationServices(): Promise<void> {
        if (!this.initializationServices) {
            if (!this.serviceManager) {
                throw new Error('DIAGNOSTIC FAILURE: Service manager reference not set before initializing coordination services');
            }
            
            // CRITICAL FIX: Get vectorStore from lifecycle manager directly to avoid circular call
            const vectorStore = this.serviceManager.getIfReady('vectorStore');
            if (!vectorStore) {
                throw new Error('CRITICAL: VectorStore must be initialized before coordination services');
            }
            
            console.log('[ServiceDescriptors] Creating initialization services with LazyServiceManager:', this.serviceManager.constructor.name);
            
            this.initializationServices = createInitializationServices(
                this.plugin,
                vectorStore,
                this.serviceManager // Pass the actual LazyServiceManager instance
            );
        }
    }

    /**
     * Inject coordination services into existing services
     * Boy Scout Rule: Clean method for post-creation coordination setup
     */
    async injectCoordinationIntoServices(): Promise<void> {
        console.log('[ServiceDescriptors] 🔥 Starting coordination injection into services');
        
        if (!this.initializationServices) {
            console.warn('[ServiceDescriptors] No coordination services available for injection');
            return;
        }
        
        console.log('[ServiceDescriptors] ✅ Coordination services available for injection');

        // NEW: Inject into vector store if available
        const vectorStore = this.serviceManager.getIfReady('vectorStore');
        console.log('[StateManager] Vector store available:', !!vectorStore);
        console.log('[StateManager] Vector store methods:', vectorStore ? Object.getOwnPropertyNames(Object.getPrototypeOf(vectorStore)) : 'none');
        
        if (vectorStore && 'setCollectionCoordinator' in vectorStore) {
            console.log('[StateManager] Injecting collection coordinator into vector store');
            vectorStore.setCollectionCoordinator(this.initializationServices.collectionCoordinator);
            
            // Load collections with coordination to register them
            if ('loadCollectionsWithCoordination' in vectorStore) {
                console.log('[StateManager] Loading collections with coordination');
                await vectorStore.loadCollectionsWithCoordination();
                console.log('[StateManager] ✅ Collections loaded and registered with vector store');
            } else {
                console.warn('[StateManager] ❌ Vector store missing loadCollectionsWithCoordination method');
            }
        } else {
            console.warn('[StateManager] ❌ Vector store missing setCollectionCoordinator method');
        }

        console.log('[ServiceDescriptors] ✅ Coordination injection completed (HNSW services removed)');
    }

    /**
     * Get initialization coordinator
     */
    getInitializationCoordinator(): IInitializationCoordinator | null {
        return this.initializationServices?.coordinator || null;
    }

    /**
     * Get all service descriptors
     */
    getAllDescriptors(): IServiceDescriptor[] {
        return [
            this.createEventManagerDescriptor(),
            this.createStateManagerDescriptor(),
            this.createVectorStoreDescriptor(),
            this.createEmbeddingServiceDescriptor(),
            this.createWorkspaceServiceDescriptor(),
            this.createMemoryServiceDescriptor(),
            this.createFileEventManagerDescriptor(),
            this.createUsageStatsServiceDescriptor(),
            this.createFileEmbeddingAccessServiceDescriptor(),
            this.createDirectCollectionServiceDescriptor(),
            this.createCacheManagerDescriptor()
        ];
    }

    // Service descriptor factory methods
    private createEventManagerDescriptor(): IServiceDescriptor<EventManager> {
        return {
            name: 'eventManager',
            dependencies: [],
            stage: LoadingStage.IMMEDIATE,
            create: async () => new EventManager()
        };
    }

    private createStateManagerDescriptor(): IServiceDescriptor<ProcessedFilesStateManager> {
        return {
            name: 'stateManager',
            dependencies: [],
            stage: LoadingStage.IMMEDIATE,
            create: async () => {
                console.log('[StateManager] Creating StateManager with plugin data.json');
                
                // Validate plugin instance before creating StateManager
                if (!this.plugin) {
                    console.error('[StateManager] ❌ CRITICAL: No plugin instance available');
                    console.error('[StateManager] ❌ DIAGNOSTIC: ServiceDescriptors state:', {
                        hasPlugin: !!this.plugin,
                        hasApp: !!this.app,
                        appType: this.app?.constructor?.name,
                        serviceDescriptorType: this.constructor.name
                    });
                    throw new Error('StateManager requires Plugin instance but none available');
                }
                
                if (!this.plugin.loadData || !this.plugin.saveData) {
                    console.error('[StateManager] ❌ CRITICAL: Plugin missing data methods');
                    console.error('[StateManager] ❌ DIAGNOSTIC: Plugin capabilities:', {
                        hasLoadData: !!(this.plugin.loadData),
                        hasSaveData: !!(this.plugin.saveData),
                        pluginType: this.plugin.constructor.name,
                        pluginMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(this.plugin))
                    });
                    throw new Error('Plugin instance missing required loadData/saveData methods');
                }
                
                const stateManager = new ProcessedFilesStateManager(this.plugin);
                await stateManager.loadState();
                return stateManager;
            }
        };
    }

    private createVectorStoreDescriptor(): IServiceDescriptor<IVectorStore> {
        return {
            name: 'vectorStore',
            dependencies: [],
            stage: LoadingStage.BACKGROUND_SLOW,
            create: async () => {
                const startTime = Date.now();
                
                const vectorStore = await this.createVectorStore();
                
                // Note: Collection coordinator injection will be handled by LazyServiceManager
                // after both vectorStore and coordination services are initialized
                
                const totalTime = Date.now() - startTime;
                console.log(`[STARTUP] VectorStore created in ${totalTime}ms`);
                
                return vectorStore;
            }
        };
    }

    private createEmbeddingServiceDescriptor(): IServiceDescriptor<EmbeddingService> {
        return {
            name: 'embeddingService',
            dependencies: ['stateManager'],
            stage: LoadingStage.BACKGROUND_SLOW,
            create: async () => {
                const stateManager = await this.dependencyResolver('stateManager');
                
                // Validate StateManager before creating EmbeddingService
                if (!stateManager) {
                    console.error('[StateManager] ❌ CRITICAL: StateManager not available for EmbeddingService');
                    console.error('[StateManager] ❌ DIAGNOSTIC: EmbeddingService creation failed:', {
                        hasPlugin: !!this.plugin,
                        hasStateManager: !!stateManager,
                        stateManagerType: stateManager?.constructor?.name
                    });
                    throw new Error('EmbeddingService requires StateManager but none available');
                }
                
                return new EmbeddingService(this.plugin, stateManager);
            }
        };
    }




    private createWorkspaceServiceDescriptor(): IServiceDescriptor<WorkspaceService> {
        return {
            name: 'workspaceService',
            dependencies: ['vectorStore', 'embeddingService'],
            stage: LoadingStage.BACKGROUND_SLOW,
            create: async () => {
                const vectorStore = await this.dependencyResolver('vectorStore');
                const embeddingService = await this.dependencyResolver('embeddingService');
                return new WorkspaceService(this.plugin, vectorStore, embeddingService);
            }
        };
    }

    private createMemoryServiceDescriptor(): IServiceDescriptor<MemoryService> {
        return {
            name: 'memoryService',
            dependencies: ['vectorStore', 'embeddingService'],
            stage: LoadingStage.BACKGROUND_SLOW,
            create: async () => {
                const vectorStore = await this.dependencyResolver('vectorStore');
                const embeddingService = await this.dependencyResolver('embeddingService');
                return new MemoryService(this.plugin, vectorStore, embeddingService, this.plugin.settings);
            }
        };
    }

    private createFileEventManagerDescriptor(): IServiceDescriptor<FileEventManagerModular> {
        return {
            name: 'fileEventManager',
            dependencies: ['eventManager'],
            stage: LoadingStage.BACKGROUND_SLOW,
            create: async () => {
                const eventManager = await this.dependencyResolver('eventManager');
                
                // Validate eventManager has required methods
                if (!eventManager || typeof eventManager.on !== 'function') {
                    console.error('[EVENTMANAGER_DEBUG] EventManager validation failed:', {
                        eventManager,
                        hasOn: typeof eventManager?.on,
                        constructorName: eventManager?.constructor?.name
                    });
                    throw new Error('EventManager dependency is invalid - missing required methods');
                }
                
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
                
                // CRITICAL FIX: Defer coordination-based startup queue processing
                // Process startup queue directly without coordination during creation
                // Coordination will be applied in post-creation phase
                await fileEventManager.processStartupQueue();
                console.log('[ServiceDescriptors] Startup queue processed (coordination deferred)');
                
                return fileEventManager;
            }
        };
    }

    private createUsageStatsServiceDescriptor(): IServiceDescriptor<UsageStatsService> {
        return {
            name: 'usageStatsService',
            dependencies: ['embeddingService', 'vectorStore', 'eventManager'],
            stage: LoadingStage.IMMEDIATE,
            create: async () => {
                const embeddingService = await this.dependencyResolver('embeddingService');
                const vectorStore = await this.dependencyResolver('vectorStore');
                const eventManager = await this.dependencyResolver('eventManager');
                
                return new UsageStatsService(
                    embeddingService,
                    vectorStore,
                    this.plugin.settings.settings.memory,
                    eventManager
                );
            }
        };
    }

    private createFileEmbeddingAccessServiceDescriptor(): IServiceDescriptor<FileEmbeddingAccessService> {
        return {
            name: 'fileEmbeddingAccessService',
            dependencies: ['vectorStore'],
            stage: LoadingStage.BACKGROUND_SLOW,
            create: async () => {
                const startTime = Date.now();
                
                const vectorStoreStart = Date.now();
                const vectorStore = await this.dependencyResolver('vectorStore');
                const vectorStoreTime = Date.now() - vectorStoreStart;
                
                const serviceStart = Date.now();
                const service = new FileEmbeddingAccessService(this.plugin, vectorStore);
                const serviceTime = Date.now() - serviceStart;
                
                const totalTime = Date.now() - startTime;
                console.log(`[STARTUP] FileEmbeddingAccessService initialized in ${totalTime}ms (vectorStore: ${vectorStoreTime}ms, service: ${serviceTime}ms)`);
                
                return service;
            }
        };
    }

    private createDirectCollectionServiceDescriptor(): IServiceDescriptor<DirectCollectionService> {
        return {
            name: 'directCollectionService',
            dependencies: ['vectorStore'],
            stage: LoadingStage.ON_DEMAND,
            create: async () => {
                const vectorStore = await this.dependencyResolver('vectorStore');
                return new DirectCollectionService(this.plugin, vectorStore);
            }
        };
    }

    private createCacheManagerDescriptor(): IServiceDescriptor<CacheManager> {
        return {
            name: 'cacheManager',
            dependencies: ['workspaceService', 'memoryService'],
            stage: LoadingStage.ON_DEMAND,
            create: async () => {
                const workspaceService = await this.dependencyResolver('workspaceService');
                const memoryService = await this.dependencyResolver('memoryService');
                return new CacheManager(this.app, workspaceService, memoryService);
            }
        };
    }

    // Factory methods
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
            // Initialize vector store without collection loading
            // Collection loading will be handled by CollectionLoadingCoordinator
            await vectorStore.initialize();
            console.log('[ServiceDescriptors] Vector store initialized (collections will be loaded by coordinator)');
        } finally {
            vectorStore.endSystemOperation();
        }

        return vectorStore;
    }
}