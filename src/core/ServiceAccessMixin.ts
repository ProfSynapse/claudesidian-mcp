/**
 * Location: /src/core/ServiceAccessMixin.ts
 * 
 * Service Access Mixin - Provides service getter properties for ClaudesidianPlugin
 * 
 * This mixin extracts all service access logic from the main plugin class,
 * providing a clean interface for accessing services through the ServiceContainer.
 * Used by main.ts to access services in a type-safe way.
 */

import type { ServiceManager } from './ServiceManager';

// Type imports for service interfaces (embedding services removed)
import type { WorkspaceService } from '../agents/memoryManager/services/WorkspaceService';
import type { MemoryService } from "../agents/memoryManager/services/MemoryService";
import type { EventManager } from '../services/EventManager';

/**
 * Service Access Mixin - provides typed service getters
 */
export class ServiceAccessMixin {
    private serviceManager: ServiceManager;

    constructor(serviceManager: ServiceManager) {
        this.serviceManager = serviceManager;
    }

    // Core service getters - proxied through ServiceContainer for singleton management




    public get workspaceService(): WorkspaceService | null {
        return this.serviceManager?.getServiceIfReady<WorkspaceService>('workspaceService') || null;
    }

    public get memoryService(): MemoryService | null {
        return this.serviceManager?.getServiceIfReady<MemoryService>('memoryService') || null;
    }


    public get eventManager(): EventManager | null {
        return this.serviceManager?.getServiceIfReady<EventManager>('eventManager') || null;
    }






    /**
     * Get a service asynchronously, waiting for it to be ready if needed
     */
    public async getService<T>(name: string, timeoutMs: number = 10000): Promise<T | null> {
        if (!this.serviceManager) {
            return null;
        }

        // If already ready, return immediately
        if (this.serviceManager.isServiceReady(name)) {
            return this.serviceManager.getServiceIfReady<T>(name);
        }

        // Otherwise try to get it (will initialize if needed)
        try {
            return await this.serviceManager.getService<T>(name);
        } catch (error) {
            console.warn(`[ServiceAccessMixin] Failed to get service '${name}':`, error);
            return null;
        }
    }

    /**
     * Service registry - returns initialized services from container
     */
    public get services(): Record<string, any> {
        if (!this.serviceManager) return {};

        const services: Record<string, any> = {};
        for (const serviceName of this.serviceManager.getReadyServices()) {
            services[serviceName] = this.serviceManager.getServiceIfReady(serviceName);
        }
        return services;
    }

    /**
     * Check if service container is available
     */
    public hasServiceContainer(): boolean {
        return !!this.serviceManager;
    }

    /**
     * Get service container stats for debugging
     */
    public getServiceContainerStats(): { registered: number; instantiated: number } {
        const stats = this.serviceManager?.getStats() || { registered: 0, ready: 0, failed: 0 };
        return { registered: stats.registered, instantiated: stats.ready };
    }

    /**
     * Get list of registered services
     */
    public getRegisteredServices(): string[] {
        return this.serviceManager?.getRegisteredServices() || [];
    }

    /**
     * Get list of ready services
     */
    public getReadyServices(): string[] {
        return this.serviceManager?.getReadyServices() || [];
    }

    /**
     * Check if a specific service is ready
     */
    public isServiceReady(name: string): boolean {
        return this.serviceManager?.isServiceReady(name) || false;
    }
}