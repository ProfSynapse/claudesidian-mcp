/**
 * Location: /src/core/services/ServiceDefinitions.ts
 * 
 * Service Definitions - Centralized service registration configuration
 * 
 * This module defines all services in a data-driven way, making it easy to add
 * new services without modifying the core PluginLifecycleManager.
 */

import type { Plugin } from 'obsidian';
import type { ServiceManager } from '../ServiceManager';
import type { Settings } from '../../settings';

export interface ServiceDefinition {
    name: string;
    dependencies?: string[];
    create: (context: ServiceCreationContext) => Promise<any>;
}

export interface ServiceCreationContext {
    plugin: Plugin;
    app: any;
    settings: Settings;
    serviceManager: ServiceManager;
    connector: any; // MCPConnector
    manifest: any;
}

/**
 * Core service definitions in dependency order
 */
export const CORE_SERVICE_DEFINITIONS: ServiceDefinition[] = [
    // Foundation services (no dependencies)
    {
        name: 'eventManager',
        create: async () => {
            const { EventManager } = await import('../../services/EventManager');
            return new EventManager();
        }
    },
    
    {
        name: 'stateManager',
        create: async (context) => {
            const { ProcessedFilesStateManager } = await import('../../database/services/indexing/state/ProcessedFilesStateManager');
            return new ProcessedFilesStateManager(context.plugin);
        }
    },
    
    {
        name: 'simpleMemoryService',
        create: async () => {
            const { SimpleMemoryService } = await import('../../services/memory/SimpleMemoryService');
            return new SimpleMemoryService();
        }
    },
    
    // Vector store - critical foundation service
    {
        name: 'vectorStore',
        create: async (context) => {
            const { ChromaVectorStoreModular } = await import('../../database/providers/chroma/ChromaVectorStoreModular');
            
            // Get embedding configuration from settings
            const memorySettings = context.settings.settings.memory;
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
            
            const vectorStore = new ChromaVectorStoreModular(context.plugin, {
                embedding: embeddingConfig,
                persistentPath: memorySettings.dbStoragePath,
                inMemory: false,
                cache: {
                    enabled: true,
                    maxItems: 1000,
                    ttl: 3600000
                }
            });
            
            // Initialize vector store in background to prevent MCP timeout
            // The vector store will auto-initialize when first accessed
            setTimeout(async () => {
                try {
                    await vectorStore.initialize();
                    console.log('[ServiceDefinitions] Vector store background initialization complete');
                } catch (error) {
                    console.error('[ServiceDefinitions] Vector store background initialization failed:', error);
                }
            }, 200);
            
            return vectorStore;
        }
    },
    
    // Business services with dependencies
    {
        name: 'embeddingService',
        dependencies: ['stateManager'],
        create: async (context) => {
            const { EmbeddingService } = await import('../../database/services/core/EmbeddingService');
            const stateManager = await context.serviceManager.getService<any>('stateManager');
            return new EmbeddingService(context.plugin, stateManager);
        }
    },
    
    {
        name: 'sessionService',
        dependencies: ['vectorStore', 'embeddingService'],
        create: async (context) => {
            const { SessionService } = await import('../../agents/memoryManager/services/SessionService');
            const { VectorStoreFactory } = await import('../../database/factory/VectorStoreFactory');
            const vectorStore = await context.serviceManager.getService<any>('vectorStore');
            const embeddingService = await context.serviceManager.getService<any>('embeddingService');
            
            const sessionCollection = VectorStoreFactory.createSessionCollection(vectorStore, embeddingService);
            return new SessionService(context.plugin, sessionCollection);
        }
    },
    
    {
        name: 'memoryTraceService',
        dependencies: ['vectorStore', 'embeddingService'],
        create: async (context) => {
            const { MemoryTraceService } = await import('../../agents/memoryManager/services/MemoryTraceService');
            const { VectorStoreFactory } = await import('../../database/factory/VectorStoreFactory');
            
            const vectorStore = await context.serviceManager.getService<any>('vectorStore');
            const embeddingService = await context.serviceManager.getService<any>('embeddingService');
            const memoryTraceCollection = VectorStoreFactory.createMemoryTraceCollection(vectorStore);
            
            return new MemoryTraceService(memoryTraceCollection, embeddingService);
        }
    },
    
    {
        name: 'toolCallCaptureService',
        dependencies: ['simpleMemoryService', 'sessionService', 'memoryTraceService', 'embeddingService'],
        create: async (context) => {
            const { ToolCallCaptureService } = await import('../../services/toolcall-capture/ToolCallCaptureService');
            const memoryService = await context.serviceManager.getService<any>('simpleMemoryService');
            const sessionService = await context.serviceManager.getService<any>('sessionService');
            
            const service = new ToolCallCaptureService(memoryService, sessionService);
            
            // Enable full functionality with embeddings if services are available
            try {
                const memoryTraceService = await context.serviceManager.getService<any>('memoryTraceService');
                const embeddingService = await context.serviceManager.getService<any>('embeddingService');
                
                if (memoryTraceService && embeddingService) {
                    await service.upgrade(memoryTraceService, embeddingService);
                }
            } catch (error) {
                console.warn('[ToolCallCapture] Failed to enable full functionality:', error);
            }
            
            return service;
        }
    },
    
    {
        name: 'memoryService',
        dependencies: ['vectorStore', 'embeddingService'],
        create: async (context) => {
            const { MemoryService } = await import('../../agents/memoryManager/services/MemoryService');
            const vectorStore = await context.serviceManager.getService<any>('vectorStore');
            const embeddingService = await context.serviceManager.getService<any>('embeddingService');
            return new MemoryService(context.plugin, vectorStore, embeddingService, context.settings.settings.memory || {});
        }
    },
    
    {
        name: 'workspaceService',
        dependencies: ['vectorStore', 'embeddingService'],
        create: async (context) => {
            const { WorkspaceService } = await import('../../agents/memoryManager/services/WorkspaceService');
            const vectorStore = await context.serviceManager.getService<any>('vectorStore');
            const embeddingService = await context.serviceManager.getService<any>('embeddingService');
            return new WorkspaceService(context.plugin, vectorStore, embeddingService);
        }
    },
    
    {
        name: 'fileEventManager',
        dependencies: ['memoryService', 'workspaceService', 'embeddingService', 'eventManager'],
        create: async (context) => {
            const { FileEventManagerModular } = await import('../../services/file-events/FileEventManagerModular');
            
            const memoryService = await context.serviceManager.getService<any>('memoryService');
            const workspaceService = await context.serviceManager.getService<any>('workspaceService');
            const embeddingService = await context.serviceManager.getService<any>('embeddingService');
            const eventManager = await context.serviceManager.getService<any>('eventManager');
            
            const embeddingStrategy = {
                type: context.settings.settings.memory?.embeddingStrategy || 'idle',
                idleTimeThreshold: context.settings.settings.memory?.idleTimeThreshold || 60000,
                batchSize: 10,
                processingDelay: 1000
            };
            
            const fileEventManager = new FileEventManagerModular(
                context.app,
                context.plugin,
                memoryService,
                workspaceService,
                embeddingService,
                eventManager,
                embeddingStrategy
            );
            
            await fileEventManager.initialize();
            return fileEventManager;
        }
    },
    
    {
        name: 'agentManager',
        dependencies: ['eventManager'],
        create: async (context) => {
            const { AgentManager } = await import('../../services/AgentManager');
            const eventManager = await context.serviceManager.getService<any>('eventManager');
            return new AgentManager(context.app, context.plugin, eventManager);
        }
    },
    
    {
        name: 'llmService',
        create: async (context) => {
            const { LLMService } = await import('../../services/llm/core/LLMService');
            const llmProviderSettings = context.settings.settings.llmProviders || {
                providers: {},
                defaultModel: {
                    provider: 'openai',
                    model: 'gpt-3.5-turbo'
                }
            };
            const mcpConnector = (context.plugin as any).getConnector();
            return new LLMService(llmProviderSettings, mcpConnector);
        }
    },
    
    {
        name: 'sessionContextManager',
        dependencies: ['eventManager'],
        create: async (context) => {
            const { SessionContextManager } = await import('../../services/SessionContextManager');
            return new SessionContextManager();
        }
    },
    
    {
        name: 'conversationRepository',
        dependencies: ['vectorStore', 'embeddingService'],
        create: async (context) => {
            const { ConversationRepository } = await import('../../database/services/chat/ConversationRepository');
            const { ConversationCollection } = await import('../../database/collections/ConversationCollection');
            const vectorStore = await context.serviceManager.getService<any>('vectorStore');
            const embeddingService = await context.serviceManager.getService<any>('embeddingService');
            const conversationCollection = new ConversationCollection(vectorStore);
            return new ConversationRepository(conversationCollection, embeddingService);
        }
    },
    
    {
        name: 'chatService',
        dependencies: ['conversationRepository', 'llmService', 'embeddingService'],
        create: async (context) => {
            const { ChatService } = await import('../../services/chat/ChatService');
            const conversationRepo = await context.serviceManager.getService<any>('conversationRepository');
            const llmService = await context.serviceManager.getService<any>('llmService');
            const embeddingService = await context.serviceManager.getService<any>('embeddingService');
            
            // Get MCP server URL from connector
            let mcpServerUrl: string | undefined;
            try {
                const mcpServer = context.connector?.getServer?.();
                mcpServerUrl = mcpServer?.getServerUrl?.() || 'http://localhost:3000/sse';
            } catch (error) {
                console.warn('[ServiceDefinitions] Failed to get MCP server URL:', error);
                mcpServerUrl = 'http://localhost:3000/sse';
            }
            
            return new ChatService({
                conversationRepo,
                llmService,
                embeddingService,
                vaultName: context.app.vault.getName(),
                mcpConnector: context.connector,
                mcpServerUrl
            });
        }
    }
];

/**
 * Additional services for UI and maintenance functionality
 */
export const ADDITIONAL_SERVICE_FACTORIES = [
    {
        name: 'fileEmbeddingAccessService',
        dependencies: ['vectorStore'],
        factory: async (deps: any) => {
            const { FileEmbeddingAccessService } = await import('../../database/services/indexing/FileEmbeddingAccessService');
            return new FileEmbeddingAccessService(deps.plugin, deps.vectorStore);
        }
    },
    
    {
        name: 'usageStatsService',
        dependencies: ['embeddingService', 'vectorStore'],
        factory: async (deps: any) => {
            const { UsageStatsService } = await import('../../database/services/usage/UsageStatsService');
            return new UsageStatsService(deps.embeddingService, deps.vectorStore, deps.memorySettings);
        }
    },
    
    {
        name: 'cacheManager',
        dependencies: ['workspaceService', 'memoryService'],
        factory: async (deps: any) => {
            const { CacheManager } = await import('../../database/services/cache/CacheManager');
            return new CacheManager(deps.app, deps.workspaceService, deps.memoryService);
        }
    }
];