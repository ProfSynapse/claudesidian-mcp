/**
 * Location: /src/core/services/ServiceDefinitions.ts
 *
 * Service Definitions - Centralized service registration configuration
 *
 * This module defines all services in a data-driven way, making it easy to add
 * new services without modifying the core PluginLifecycleManager.
 *
 * Simplified architecture for JSON-based storage
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

    // VaultOperations - centralized vault operations using Obsidian API
    {
        name: 'vaultOperations',
        create: async (context) => {
            const { VaultOperations } = await import('../VaultOperations');
            const { ObsidianPathManager } = await import('../ObsidianPathManager');
            const { StructuredLogger } = await import('../StructuredLogger');

            const pathManager = new ObsidianPathManager(context.app.vault);
            const logger = new StructuredLogger(context.plugin);
            return new VaultOperations(context.app.vault, pathManager, logger);
        }
    },

    // Note: ProcessedFilesStateManager and SimpleMemoryService removed in simplify-search-architecture
    // State management is now handled by simplified JSON-based storage

    // Workspace service (centralized storage service)
    {
        name: 'workspaceService',
        create: async (context) => {
            const { WorkspaceService } = await import('../../services/WorkspaceService');
            const { FileSystemService } = await import('../../services/storage/FileSystemService');
            const { IndexManager } = await import('../../services/storage/IndexManager');

            const fileSystem = new FileSystemService(context.plugin);
            const indexManager = new IndexManager(fileSystem);
            return new WorkspaceService(context.plugin, fileSystem, indexManager);
        }
    },

    // Default workspace manager (ensures default workspace exists)
    {
        name: 'defaultWorkspaceManager',
        dependencies: ['workspaceService'],
        create: async (context) => {
            const { DefaultWorkspaceManager } = await import('../../services/workspace/DefaultWorkspaceManager');
            const { WorkspaceService } = await import('../../services/WorkspaceService');
            const workspaceService = await context.serviceManager.getService('workspaceService') as InstanceType<typeof WorkspaceService>;

            const manager = new DefaultWorkspaceManager(context.app, workspaceService);
            await manager.initialize();
            return manager;
        }
    },

    // Memory service (agent-specific, delegates to WorkspaceService)
    {
        name: 'memoryService',
        dependencies: ['workspaceService'],
        create: async (context) => {
            const { MemoryService } = await import('../../agents/memoryManager/services/MemoryService');
            const WorkspaceService = (await import('../../services/WorkspaceService')).WorkspaceService;
            const workspaceService = await context.serviceManager.getService('workspaceService') as InstanceType<typeof WorkspaceService>;
            return new MemoryService(context.plugin, workspaceService);
        }
    },

    // Cache manager for performance
    {
        name: 'cacheManager',
        dependencies: ['workspaceService', 'memoryService'],
        create: async (context) => {
            const { CacheManager } = await import('../../database/services/cache/CacheManager');

            const workspaceService = await context.serviceManager.getService('workspaceService');
            const memoryService = await context.serviceManager.getService('memoryService');

            const cacheManager = new CacheManager(
                context.plugin.app,
                workspaceService as any,
                memoryService as any,
                {
                    enableEntityCache: true,
                    enableFileIndex: true,
                    enablePrefetch: true
                }
            );

            await cacheManager.initialize();
            return cacheManager;
        }
    },

    // Session service for session persistence
    {
        name: 'sessionService',
        dependencies: ['memoryService'],
        create: async (context) => {
            const { SessionService } = await import('../../services/session/SessionService');
            const memoryService = await context.serviceManager.getService('memoryService');

            const service = new SessionService(memoryService);
            return service;
        }
    },

    // Session context manager
    {
        name: 'sessionContextManager',
        dependencies: ['workspaceService', 'memoryService', 'sessionService'],
        create: async (context) => {
            const { SessionContextManager } = await import('../../services/SessionContextManager');

            const workspaceService = await context.serviceManager.getService('workspaceService');
            const memoryService = await context.serviceManager.getService('memoryService');
            const sessionService = await context.serviceManager.getService('sessionService');

            const manager = new SessionContextManager();
            manager.setSessionService(sessionService);
            return manager;
        }
    },

    // Tool call trace service for capturing tool executions
    {
        name: 'toolCallTraceService',
        dependencies: ['memoryService', 'sessionContextManager', 'workspaceService'],
        create: async (context) => {
            const { ToolCallTraceService } = await import('../../services/trace/ToolCallTraceService');
            const { MemoryService } = await import('../../agents/memoryManager/services/MemoryService');
            const { SessionContextManager } = await import('../../services/SessionContextManager');
            const { WorkspaceService } = await import('../../services/WorkspaceService');

            const memoryService = await context.serviceManager.getService('memoryService') as InstanceType<typeof MemoryService>;
            const sessionContextManager = await context.serviceManager.getService('sessionContextManager') as InstanceType<typeof SessionContextManager>;
            const workspaceService = await context.serviceManager.getService('workspaceService') as InstanceType<typeof WorkspaceService>;

            return new ToolCallTraceService(
                memoryService,
                sessionContextManager,
                workspaceService,
                context.plugin
            );
        }
    },

    // LLM services for chat functionality
    {
        name: 'llmService',
        dependencies: ['vaultOperations'],
        create: async (context) => {
            const { LLMService } = await import('../../services/llm/core/LLMService');
            const { VaultOperations } = await import('../../core/VaultOperations');

            const llmProviders = context.settings.settings.llmProviders;
            if (!llmProviders || typeof llmProviders !== 'object' || !('providers' in llmProviders)) {
                throw new Error('Invalid LLM provider settings');
            }

            const llmService = new LLMService(llmProviders, context.connector); // Pass mcpConnector for tool execution

            // Inject VaultOperations for file reading
            const vaultOperations = await context.serviceManager.getService('vaultOperations') as InstanceType<typeof VaultOperations>;
            if (vaultOperations) {
                llmService.setVaultOperations(vaultOperations);
            }

            return llmService;
        }
    },

    // Custom prompt storage service for AgentManager
    {
        name: 'customPromptStorageService',
        create: async (context) => {
            const { CustomPromptStorageService } = await import('../../agents/agentManager/services/CustomPromptStorageService');
            return new CustomPromptStorageService(context.settings);
        }
    },

    // Agent manager for custom AI agents
    {
        name: 'agentManager',
        dependencies: ['llmService'],
        create: async (context) => {
            const { AgentManager } = await import('../../services/AgentManager');

            const llmService = await context.serviceManager.getService('llmService');

            return new AgentManager(
                context.plugin.app,
                llmService,
                {} as any // Placeholder for EventManager
            );
        }
    },

    // Conversation service for chat storage
    {
        name: 'conversationService',
        create: async (context) => {
            const { ConversationService } = await import('../../services/ConversationService');
            const { FileSystemService } = await import('../../services/storage/FileSystemService');
            const { IndexManager } = await import('../../services/storage/IndexManager');

            const fileSystem = new FileSystemService(context.plugin);
            const indexManager = new IndexManager(fileSystem);
            return new ConversationService(context.plugin, fileSystem, indexManager);
        }
    },

    // Chat service with direct agent integration via MCPConnector
    {
        name: 'chatService',
        dependencies: ['conversationService', 'llmService'],
        create: async (context) => {
            const { ChatService } = await import('../../services/chat/ChatService');

            const conversationService = await context.serviceManager.getService('conversationService');
            const llmService = await context.serviceManager.getService('llmService');

            return new ChatService(
                {
                    conversationService,
                    llmService,
                    vaultName: context.app.vault.getName(),
                    mcpConnector: context.connector
                },
                {
                    maxToolIterations: 10,
                    toolTimeout: 30000,
                    enableToolChaining: true
                }
            );
        }
    }
];

/**
 * Additional services for UI and maintenance functionality
 */
export const ADDITIONAL_SERVICE_FACTORIES = [
    // Note: ChatDatabaseService removed in simplify-search-architecture
    // Chat data now stored in simplified JSON format
];

/**
 * Services that require special initialization
 */
export const SPECIALIZED_SERVICES = [
    'cacheManager',           // Requires dependency injection
    'sessionContextManager',  // Requires settings configuration
    'chatService'             // Requires MCP client initialization
];