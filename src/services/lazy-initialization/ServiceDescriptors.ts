import { App } from 'obsidian';
import ClaudesidianPlugin from '../../main';
import { IServiceDescriptor, LoadingStage } from './ServiceManagerInterfaces';
import { IVectorStore } from '../../database/interfaces/IVectorStore';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { HnswSearchService } from '../../database/services/hnsw/HnswSearchService';
import { FileEmbeddingAccessService } from '../../database/services/FileEmbeddingAccessService';
import { DirectCollectionService } from '../../database/services/DirectCollectionService';
import { WorkspaceService } from '../../database/services/WorkspaceService';
import { MemoryService } from '../../database/services/MemoryService';
import { EventManager } from '../EventManager';
import { FileEventManagerModular } from '../file-events/FileEventManagerModular';
import { UsageStatsService } from '../../database/services/UsageStatsService';
import { CacheManager } from '../../database/services/CacheManager';
import { VectorStoreFactory } from '../../database/factory/VectorStoreFactory';
import { 
  IInitializationStateManager,
  ICollectionLoadingCoordinator,
  IInitializationCoordinator,
  createInitializationServices
} from '../initialization';

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
     * Initialize coordination services
     */
    async initializeCoordinationServices(): Promise<void> {
        if (!this.initializationServices) {
            if (!this.serviceManager) {
                throw new Error('DIAGNOSTIC FAILURE: Service manager reference not set before initializing coordination services');
            }
            
            const vectorStore = await this.dependencyResolver('vectorStore');
            console.log('[ServiceDescriptors] Creating initialization services with LazyServiceManager:', this.serviceManager.constructor.name);
            
            this.initializationServices = createInitializationServices(
                this.plugin,
                vectorStore,
                this.serviceManager // Pass the actual LazyServiceManager instance
            );
        }
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
            this.createVectorStoreDescriptor(),
            this.createEmbeddingServiceDescriptor(),
            this.createHnswSearchServiceDescriptor(),
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
            dependencies: [],
            stage: LoadingStage.BACKGROUND_SLOW,
            create: async () => new EmbeddingService(this.plugin)
        };
    }

    private createHnswSearchServiceDescriptor(): IServiceDescriptor<HnswSearchService> {
        return {
            name: 'hnswSearchService',
            dependencies: ['vectorStore', 'embeddingService'],
            stage: LoadingStage.BACKGROUND_SLOW,
            create: async () => {
                const vectorStore = await this.dependencyResolver('vectorStore');
                const embeddingService = await this.dependencyResolver('embeddingService');
                
                // Ensure coordination services are initialized
                await this.initializeCoordinationServices();
                
                const basePath = this.plugin.settings?.settings?.memory?.dbStoragePath;
                const service = new HnswSearchService(this.app, vectorStore, embeddingService, basePath);
                
                // Inject coordination services into HNSW service
                if (this.initializationServices && 
                    'setInitializationCoordination' in service) {
                    service.setInitializationCoordination(
                        this.initializationServices.stateManager,
                        this.initializationServices.collectionCoordinator
                    );
                    console.log('[ServiceDescriptors] Injected coordination services into HNSW service');
                }
                
                // Only do basic initialization here - full initialization will be handled by InitializationCoordinator
                if (this.initializationServices) {
                    await this.initializationServices.stateManager.ensureInitialized(
                        'hnswSearchService_basic',
                        async () => {
                            await service.initialize();
                            console.log('[ServiceDescriptors] HNSW service basic initialization completed');
                        }
                    );
                } else {
                    // Fallback to original behavior if coordination not available
                    await service.initialize();
                }
                
                // Note: Full initialization (ensureFullyInitialized) will be called by InitializationCoordinator
                
                return service;
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
                
                // Use coordination system to handle startup queue processing
                if (this.initializationServices) {
                    await this.initializationServices.stateManager.ensureInitialized(
                        'fileEventManager_startup',
                        async () => {
                            await fileEventManager.processStartupQueue();
                            console.log('[ServiceDescriptors] Startup queue processed with coordination');
                        }
                    );
                }
                
                return fileEventManager;
            }
        };
    }

    private createUsageStatsServiceDescriptor(): IServiceDescriptor<UsageStatsService> {
        return {
            name: 'usageStatsService',
            dependencies: ['embeddingService', 'vectorStore', 'eventManager'],
            stage: LoadingStage.BACKGROUND_SLOW,
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