/**
 * Location: /src/core/services/ServiceRegistrar.ts
 * 
 * Service Registrar - Handles service registration and additional service factories
 * 
 * This service extracts the complex service registration logic from PluginLifecycleManager,
 * making it data-driven and easily extensible for new services.
 */

import type { ServiceManager } from '../ServiceManager';
import { CORE_SERVICE_DEFINITIONS, ADDITIONAL_SERVICE_FACTORIES } from './ServiceDefinitions';
import type { ServiceCreationContext } from './ServiceDefinitions';

export class ServiceRegistrar {
    private context: ServiceCreationContext;

    constructor(context: ServiceCreationContext) {
        this.context = context;
    }

    /**
     * Register all core services with the ServiceManager
     */
    async registerCoreServices(): Promise<void> {
        for (const serviceDef of CORE_SERVICE_DEFINITIONS) {
            await this.context.serviceManager.registerService({
                name: serviceDef.name,
                dependencies: serviceDef.dependencies,
                create: () => serviceDef.create(this.context)
            });
        }
    }

    /**
     * Register additional services needed by UI components using factory pattern
     */
    registerAdditionalServices(): void {
        const { serviceManager, plugin, settings, app } = this.context;
        
        for (const serviceFactory of ADDITIONAL_SERVICE_FACTORIES) {
            serviceManager.registerFactory(
                serviceFactory.name,
                async (deps) => {
                    // Create enhanced dependency context
                    const enhancedDeps = {
                        ...deps,
                        plugin,
                        app,
                        memorySettings: settings.settings.memory || {}
                    };
                    return serviceFactory.factory(enhancedDeps);
                },
                { dependencies: serviceFactory.dependencies }
            );
        }
    }

    /**
     * Get default memory settings - extracted from original PluginLifecycleManager
     */
    static getDefaultMemorySettings(chromaDbDir: string) {
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
            vectorStoreType: 'file-based' as 'file-based'
        };
    }

    /**
     * Initialize data directories asynchronously
     */
    async initializeDataDirectories(): Promise<void> {
        try {
            const { app, plugin, settings, manifest } = this.context;
            
            // Use vault-relative paths for Obsidian adapter
            const pluginDir = `.obsidian/plugins/${manifest.id}`;
            const dataDir = `${pluginDir}/data`;
            const chromaDbDir = `${dataDir}/chroma-db`;
            const collectionsDir = `${chromaDbDir}/collections`;
            
            // Create directories using Obsidian's vault adapter
            const { normalizePath } = require('obsidian');
            await app.vault.adapter.mkdir(normalizePath(dataDir));
            await app.vault.adapter.mkdir(normalizePath(chromaDbDir));
            await app.vault.adapter.mkdir(normalizePath(collectionsDir));
            
            // Update settings with correct path
            if (!settings.settings.memory) {
                settings.settings.memory = ServiceRegistrar.getDefaultMemorySettings(chromaDbDir);
            } else {
                settings.settings.memory.dbStoragePath = chromaDbDir;
            }
            
            // Save settings in background
            settings.saveSettings().catch(error => {
                console.warn('[ServiceRegistrar] Failed to save settings after directory init:', error);
            });
            
        } catch (error) {
            console.error('[ServiceRegistrar] Failed to initialize data directories:', error);
            // Don't throw - plugin should function without directories for now
        }
    }

    /**
     * Initialize essential services that must be ready immediately
     */
    async initializeEssentialServices(): Promise<void> {
        try {
            // Initialize only the most critical services synchronously
            await this.context.serviceManager.getService('eventManager');
            await this.context.serviceManager.getService('stateManager');
            await this.context.serviceManager.getService('simpleMemoryService');
        } catch (error) {
            console.error('[ServiceRegistrar] Essential service initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize business services with proper dependency resolution
     */
    async initializeBusinessServices(): Promise<void> {
        try {
            // Initialize in dependency order to prevent multiple VectorStore instances
            const vectorStore = await this.context.serviceManager.getService('vectorStore');
            
            // Initialize dependent services sequentially to avoid circular dependency issues
            await this.context.serviceManager.getService('embeddingService');
            await this.context.serviceManager.getService('memoryService');
            await this.context.serviceManager.getService('workspaceService');
            await this.context.serviceManager.getService('memoryTraceService');
            await this.context.serviceManager.getService('fileEventManager');
            
            // Initialize supporting services for chat
            await this.context.serviceManager.getService('agentManager');
            await this.context.serviceManager.getService('llmService');
            await this.context.serviceManager.getService('sessionContextManager');
            
            // Initialize chat services
            await this.context.serviceManager.getService('conversationRepository');
            await this.context.serviceManager.getService('chatService');
        } catch (error) {
            console.error('[ServiceRegistrar] Business service initialization failed:', error);
            throw error;
        }
    }

    /**
     * Pre-initialize UI-critical services to avoid Memory Management loading delays
     */
    async preInitializeUICriticalServices(): Promise<void> {
        if (!this.context.serviceManager) return;
        
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
                        await this.context.serviceManager.getService(serviceName);
                        const serviceTime = Date.now() - serviceStart;
                    } catch (error) {
                        console.warn(`[ServiceRegistrar] Failed to pre-initialize ${serviceName}:`, error);
                    }
                })
            );
            
            const totalTime = Date.now() - startTime;
            
            // Inject vector store into SimpleMemoryService for persistence
            try {
                const vectorStore = await this.context.serviceManager.getService('vectorStore');
                const simpleMemoryService = await this.context.serviceManager.getService<any>('simpleMemoryService');
                
                if (vectorStore && simpleMemoryService && typeof simpleMemoryService.setVectorStore === 'function') {
                    simpleMemoryService.setVectorStore(vectorStore);
                } else {
                    console.warn('[ServiceRegistrar] ❌ Vector store or SimpleMemoryService not available for injection');
                }
            } catch (error) {
                console.error('[ServiceRegistrar] Failed to inject vector store:', error);
            }
            
        } catch (error) {
            console.error('[ServiceRegistrar] UI-critical services pre-initialization failed:', error);
        }
    }

    /**
     * Get service helper method with timeout
     */
    async getService<T>(name: string, timeoutMs: number = 10000): Promise<T | null> {
        if (!this.context.serviceManager) {
            return null;
        }
        
        try {
            return await this.context.serviceManager.getService<T>(name);
        } catch (error) {
            console.warn(`[ServiceRegistrar] Failed to get service '${name}':`, error);
            return null;
        }
    }

    /**
     * Wait for a service to be ready with retry logic
     */
    async waitForService<T>(serviceName: string, timeoutMs: number = 30000): Promise<T | null> {
        const startTime = Date.now();
        const retryInterval = 1000; // Check every 1 second
        
        while (Date.now() - startTime < timeoutMs) {
            try {
                const service = await this.getService<T>(serviceName, 2000);
                if (service) {
                    return service;
                }
            } catch (error) {
                // Service not ready yet, continue waiting
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
        
        console.warn(`[ServiceRegistrar] Service '${serviceName}' not ready after ${timeoutMs}ms`);
        return null;
    }
}