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

/**
 * Service Descriptors - Configuration-driven service definitions
 * Follows Open/Closed Principle - easy to add new services without modifying existing code
 */
export class ServiceDescriptors {
    private app: App;
    private plugin: ClaudesidianPlugin;
    private dependencyResolver: (name: string) => Promise<any>;

    constructor(app: App, plugin: ClaudesidianPlugin) {
        this.app = app;
        this.plugin = plugin;
        this.dependencyResolver = () => Promise.reject(new Error('Dependency resolver not set'));
    }

    /**
     * Set dependency resolver (injected by service manager)
     */
    setDependencyResolver(resolver: (name: string) => Promise<any>): void {
        this.dependencyResolver = resolver;
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
            create: async () => this.createVectorStore()
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
                
                const basePath = this.plugin.settings?.settings?.memory?.dbStoragePath;
                const service = new HnswSearchService(this.app, vectorStore, embeddingService, basePath);
                
                await service.initialize();
                
                // Start full initialization in background
                setTimeout(async () => {
                    try {
                        await service.ensureFullyInitialized();
                        console.log('[ServiceDescriptors] HNSW full initialization completed');
                    } catch (error) {
                        console.warn('[ServiceDescriptors] Background HNSW initialization failed:', error);
                    }
                }, 5000);
                
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
                
                const embeddingStrategy = {
                    type: (this.plugin.settings?.settings?.memory?.embeddingStrategy || 'idle') as 'idle' | 'startup',
                    idleTimeThreshold: this.plugin.settings?.settings?.memory?.idleTimeThreshold || 60000,
                    batchSize: 10,
                    processingDelay: 1000
                };

                return new FileEventManagerModular(
                    this.app,
                    this.plugin,
                    null as any,
                    null as any,
                    null as any,
                    eventManager,
                    embeddingStrategy
                );
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
            stage: LoadingStage.ON_DEMAND,
            create: async () => {
                const vectorStore = await this.dependencyResolver('vectorStore');
                return new FileEmbeddingAccessService(this.plugin, vectorStore);
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
            await vectorStore.initialize();
        } finally {
            vectorStore.endSystemOperation();
        }

        return vectorStore;
    }
}