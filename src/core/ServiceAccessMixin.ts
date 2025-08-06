/**
 * Location: /src/core/ServiceAccessMixin.ts
 * 
 * Service Access Mixin - Provides service getter properties for ClaudesidianPlugin
 * 
 * This mixin extracts all service access logic from the main plugin class,
 * providing a clean interface for accessing services through the ServiceContainer.
 * Used by main.ts to access services in a type-safe way.
 */

import type { ServiceContainer } from './ServiceContainer';

// Type imports for service interfaces
import type { EmbeddingService } from '../database/services/EmbeddingService';
import type { FileEmbeddingAccessService } from '../database/services/FileEmbeddingAccessService';
import type { DirectCollectionService } from '../database/services/DirectCollectionService';
import type { IVectorStore } from '../database/interfaces/IVectorStore';
import type { WorkspaceService } from '../database/services/WorkspaceService';
import type { MemoryService } from '../database/services/MemoryService';
import type { EventManager } from '../services/EventManager';
import type { FileEventManagerModular } from '../services/file-events/FileEventManagerModular';
import type { UsageStatsService } from '../database/services/UsageStatsService';
import type { CacheManager } from '../database/services/CacheManager';
import type { ProcessedFilesStateManager } from '../database/services/state/ProcessedFilesStateManager';
import type { MemoryTraceService } from '../database/services/memory/MemoryTraceService';
import type { ToolCallCaptureService } from '../services/toolcall-capture/ToolCallCaptureService';

/**
 * Service Access Mixin - provides typed service getters
 */
export class ServiceAccessMixin {
    private serviceContainer: ServiceContainer;

    constructor(serviceContainer: ServiceContainer) {
        this.serviceContainer = serviceContainer;
    }

    // Core service getters - proxied through ServiceContainer for singleton management
    public get vectorStore(): IVectorStore | null {
        return this.serviceContainer?.getIfReady<IVectorStore>('vectorStore') || null;
    }

    public get embeddingService(): EmbeddingService | null {
        return this.serviceContainer?.getIfReady<EmbeddingService>('embeddingService') || null;
    }

    public get fileEmbeddingAccessService(): FileEmbeddingAccessService | null {
        return this.serviceContainer?.getIfReady<FileEmbeddingAccessService>('fileEmbeddingAccessService') || null;
    }

    public get directCollectionService(): DirectCollectionService | null {
        return this.serviceContainer?.getIfReady<DirectCollectionService>('directCollectionService') || null;
    }

    public get workspaceService(): WorkspaceService | null {
        return this.serviceContainer?.getIfReady<WorkspaceService>('workspaceService') || null;
    }

    public get memoryService(): MemoryService | null {
        return this.serviceContainer?.getIfReady<MemoryService>('memoryService') || null;
    }

    public get fileEventManager(): FileEventManagerModular | null {
        return this.serviceContainer?.getIfReady<FileEventManagerModular>('fileEventManager') || null;
    }

    public get eventManager(): EventManager | null {
        return this.serviceContainer?.getIfReady<EventManager>('eventManager') || null;
    }

    public get usageStatsService(): UsageStatsService | null {
        return this.serviceContainer?.getIfReady<UsageStatsService>('usageStatsService') || null;
    }

    public get cacheManager(): CacheManager | null {
        return this.serviceContainer?.getIfReady<CacheManager>('cacheManager') || null;
    }

    public get stateManager(): ProcessedFilesStateManager | null {
        return this.serviceContainer?.getIfReady<ProcessedFilesStateManager>('stateManager') || null;
    }

    public get memoryTraceService(): MemoryTraceService | null {
        return this.serviceContainer?.getIfReady<MemoryTraceService>('memoryTraceService') || null;
    }

    public get toolCallCaptureService(): ToolCallCaptureService | null {
        return this.serviceContainer?.getIfReady<ToolCallCaptureService>('toolCallCaptureService') || null;
    }

    /**
     * Get a service asynchronously, waiting for it to be ready if needed
     */
    public async getService<T>(name: string, timeoutMs: number = 10000): Promise<T | null> {
        if (!this.serviceContainer) {
            return null;
        }

        // If already ready, return immediately
        if (this.serviceContainer.isReady(name)) {
            return this.serviceContainer.getIfReady<T>(name);
        }

        // Otherwise try to get it (will initialize if needed)
        try {
            return await this.serviceContainer.get<T>(name);
        } catch (error) {
            console.warn(`[ServiceAccessMixin] Failed to get service '${name}':`, error);
            return null;
        }
    }

    /**
     * Service registry - returns initialized services from container
     */
    public get services(): Record<string, any> {
        if (!this.serviceContainer) return {};

        const services: Record<string, any> = {};
        for (const serviceName of this.serviceContainer.getReadyServices()) {
            services[serviceName] = this.serviceContainer.getIfReady(serviceName);
        }
        return services;
    }

    /**
     * Check if service container is available
     */
    public hasServiceContainer(): boolean {
        return !!this.serviceContainer;
    }

    /**
     * Get service container stats for debugging
     */
    public getServiceContainerStats(): { registered: number; instantiated: number } {
        return this.serviceContainer?.getStats() || { registered: 0, instantiated: 0 };
    }

    /**
     * Get list of registered services
     */
    public getRegisteredServices(): string[] {
        return this.serviceContainer?.getRegisteredServices() || [];
    }

    /**
     * Get list of ready services
     */
    public getReadyServices(): string[] {
        return this.serviceContainer?.getReadyServices() || [];
    }

    /**
     * Check if a specific service is ready
     */
    public isServiceReady(name: string): boolean {
        return this.serviceContainer?.isReady(name) || false;
    }
}