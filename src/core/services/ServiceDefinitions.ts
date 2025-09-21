/**
 * Location: /src/core/services/ServiceDefinitions.ts
 *
 * Service Definitions - Centralized service registration configuration
 *
 * This module defines all services in a data-driven way, making it easy to add
 * new services without modifying the core PluginLifecycleManager.
 *
 * Simplified architecture - removed embedding and vector store dependencies
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

    // Note: ProcessedFilesStateManager and SimpleMemoryService removed in simplify-search-architecture
    // State management is now handled by simplified JSON-based storage

    // Memory service with simplified dependencies
    {
        name: 'memoryService',
        create: async (context) => {
            const { MemoryService } = await import('../../agents/memoryManager/services/MemoryService');
            return new MemoryService(context.plugin);
        }
    },

    // Workspace service with simplified dependencies
    {
        name: 'workspaceService',
        create: async (context) => {
            const { WorkspaceService } = await import('../../agents/memoryManager/services/WorkspaceService');
            return new WorkspaceService(context.plugin);
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
                workspaceService,
                memoryService,
                {
                    enableEntityCache: true,
                    enableFileIndex: true,
                    enablePrefetch: true
                }
            );

            return cacheManager;
        }
    },

    // Session context manager
    {
        name: 'sessionContextManager',
        dependencies: ['workspaceService', 'memoryService'],
        create: async (context) => {
            const { SessionContextManager } = await import('../../services/SessionContextManager');

            const workspaceService = await context.serviceManager.getService('workspaceService');
            const memoryService = await context.serviceManager.getService('memoryService');

            return new SessionContextManager(
                context.plugin,
                workspaceService,
                memoryService,
                context.settings
            );
        }
    },

    // LLM services for chat functionality
    {
        name: 'llmService',
        create: async (context) => {
            const { LLMAdapterManager } = await import('../../services/llm/LLMAdapterManager');
            return new LLMAdapterManager(
                context.plugin.app,
                context.settings.settings.llmProviders || {},
                { enableWebSearch: false }
            );
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
                context.plugin,
                llmService,
                context.settings
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
    'sessionContextManager'   // Requires settings configuration
];