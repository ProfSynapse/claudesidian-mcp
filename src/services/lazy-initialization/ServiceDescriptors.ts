import { App } from 'obsidian';
import ClaudesidianPlugin from '../../main';
import { IServiceDescriptor, LoadingStage } from './ServiceManagerInterfaces';
import { IVectorStore } from '../../database/interfaces/IVectorStore';
import { EmbeddingService } from '../../database/services/core/EmbeddingService';
import { FileEmbeddingAccessService } from '../../database/services/indexing/FileEmbeddingAccessService';
import { CollectionService } from "../../database/services/core/CollectionService";
import { WorkspaceService } from '../../agents/memoryManager/services/WorkspaceService';
import { MemoryService } from '../../agents/memoryManager/services/MemoryService';
import { MemoryTraceService } from '../../agents/memoryManager/services/MemoryTraceService';
import { SessionService } from '../../agents/memoryManager/services/SessionService';
import { ToolCallCaptureService } from '../toolcall-capture/ToolCallCaptureService';
import { EventManager } from '../EventManager';
import { FileEventManagerModular } from '../file-events/FileEventManagerModular';
import { UsageStatsService } from '../../database/services/usage/UsageStatsService';
import { CacheManager } from '../../database/services/cache/CacheManager';
import { VectorStoreFactory } from '../../database/factory/VectorStoreFactory';
import { ProcessedFilesStateManager } from '../../database/services/indexing/state/ProcessedFilesStateManager';
import { 
  IInitializationStateManager,
  ICollectionLoadingCoordinator,
  IInitializationCoordinator,
  createInitializationServices
} from '../initialization';
// MetadataManager removed with broken collection ecosystem
import { ServiceRegistry, ServicePriority } from '../registry/ServiceRegistry';

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
        
        if (!this.initializationServices) {
            console.warn('[ServiceDescriptors] No coordination services available for injection');
            return;
        }
        

        // NEW: Inject into vector store if available
        const vectorStore = this.serviceManager.getIfReady('vectorStore');
        
        if (vectorStore && 'setCollectionCoordinator' in vectorStore) {
            vectorStore.setCollectionCoordinator(this.initializationServices.collectionCoordinator);
            
            // Note: Collection loading is now handled by ContextualEmbeddingManager on-demand
            // No need to load all collections during initialization
        } else {
            console.warn('Vector store missing setCollectionCoordinator method');
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
            this.createStateManagerDescriptor(),
            this.createVectorStoreDescriptor(),
            this.createEmbeddingServiceDescriptor(),
            this.createWorkspaceServiceDescriptor(),
            this.createMemoryServiceDescriptor(),
            this.createMemoryTraceServiceDescriptor(),
            this.createSessionServiceDescriptor(),
            this.createToolCallCaptureServiceDescriptor(),
            this.createFileEventManagerDescriptor(),
            this.createUsageStatsServiceDescriptor(),
            this.createFileEmbeddingAccessServiceDescriptor(),
            this.createCollectionServiceDescriptor(),
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
                
                // Validate plugin instance before creating StateManager
                if (!this.plugin) {
                    console.error('CRITICAL: No plugin instance available');
                    throw new Error('StateManager requires Plugin instance but none available');
                }
                
                if (!this.plugin.loadData || !this.plugin.saveData) {
                    console.error('CRITICAL: Plugin missing data methods');
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
                
                // CRITICAL FIX: Use ServiceRegistry to enforce singleton pattern
                const serviceRegistry = ServiceRegistry.getInstance();
                
                const vectorStore = await serviceRegistry.getOrCreateService(
                    'vectorStore',
                    async () => {
                        return await this.createVectorStoreSingleton();
                    },
                    {
                        timeout: 30000,
                        retryCount: 1,
                        priority: ServicePriority.CRITICAL,
                        dependencies: []
                    }
                );
                
                // Note: Collection coordinator injection will be handled by LazyServiceManager
                // after both vectorStore and coordination services are initialized
                
                
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
                    console.error('CRITICAL: StateManager not available for EmbeddingService');
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

    private createMemoryTraceServiceDescriptor(): IServiceDescriptor<MemoryTraceService> {
        return {
            name: 'memoryTraceService',
            dependencies: ['vectorStore', 'embeddingService'],
            stage: LoadingStage.BACKGROUND_SLOW,
            create: async () => {
                const vectorStore = await this.dependencyResolver('vectorStore');
                const embeddingService = await this.dependencyResolver('embeddingService');
                
                // Get memory trace collection from vector store
                const memoryTraces = await vectorStore.getMemoryTraceCollection();
                
                return new MemoryTraceService(memoryTraces, embeddingService);
            }
        };
    }

    private createSessionServiceDescriptor(): IServiceDescriptor<SessionService> {
        return {
            name: 'sessionService',
            dependencies: ['vectorStore'],
            stage: LoadingStage.BACKGROUND_SLOW,
            create: async () => {
                const vectorStore = await this.dependencyResolver('vectorStore');
                
                // Get session collection from vector store
                const sessions = await vectorStore.getSessionCollection();
                
                return new SessionService(this.plugin, sessions);
            }
        };
    }

    private createToolCallCaptureServiceDescriptor(): IServiceDescriptor<ToolCallCaptureService> {
        return {
            name: 'toolCallCaptureService',
            dependencies: ['memoryTraceService', 'sessionService', 'embeddingService'],
            stage: LoadingStage.BACKGROUND_SLOW,
            create: async () => {
                const memoryTraceService = await this.dependencyResolver('memoryTraceService');
                const sessionService = await this.dependencyResolver('sessionService');
                const embeddingService = await this.dependencyResolver('embeddingService');
                
                // Use SimpleMemoryService for immediate functionality
                const simpleMemoryService = await this.dependencyResolver('simpleMemoryService');
                return new ToolCallCaptureService(simpleMemoryService, sessionService);
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
                    this.plugin.settings.settings.memory || {},
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
                
                
                return service;
            }
        };
    }

    private createCollectionServiceDescriptor(): IServiceDescriptor<CollectionService> {
        return {
            name: 'directCollectionService',
            dependencies: ['vectorStore'],
            stage: LoadingStage.ON_DEMAND,
            create: async () => {
                const vectorStore = await this.dependencyResolver('vectorStore');
                return new CollectionService(this.plugin, vectorStore);
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
    private async createVectorStoreSingleton(): Promise<IVectorStore> {
        const path = require('path');
        
        let basePath;
        if (this.app.vault.adapter instanceof require('obsidian').FileSystemAdapter) {
            basePath = (this.app.vault.adapter as any).getBasePath();
        } else {
            throw new Error('FileSystemAdapter not available');
        }
        
        // Use vault-relative paths for Obsidian adapter
        const pluginDir = `.obsidian/plugins/${this.plugin.manifest.id}`;
        const dataDir = `${pluginDir}/data/chroma-db`;
        
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
        } finally {
            vectorStore.endSystemOperation();
        }

        return vectorStore;
    }
}