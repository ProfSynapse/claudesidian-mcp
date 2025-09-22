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
                workspaceService as any,
                memoryService as any,
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

            return new SessionContextManager();
        }
    },

    // LLM services for chat functionality
    {
        name: 'llmService',
        create: async (context) => {
            const { LLMService } = await import('../../services/llm/core/LLMService');
            const llmProviders = context.settings.settings.llmProviders;
            if (!llmProviders || typeof llmProviders !== 'object' || !('providers' in llmProviders)) {
                throw new Error('Invalid LLM provider settings');
            }
            return new LLMService(llmProviders);
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