import { IServiceRegistry, IServiceDescriptor, LoadingStage } from './ServiceManagerInterfaces';

/**
 * Service Registry Manager - Handles service registration and lookup
 * Follows Single Responsibility Principle
 */
export class ServiceRegistryManager implements IServiceRegistry {
    private services = new Map<string, IServiceDescriptor>();
    private stageQueues = new Map<LoadingStage, string[]>();

    /**
     * Register a service descriptor
     */
    register<T>(descriptor: IServiceDescriptor<T>): void {
        this.services.set(descriptor.name, descriptor);
        
        // Add to stage queue
        if (!this.stageQueues.has(descriptor.stage)) {
            this.stageQueues.set(descriptor.stage, []);
        }
        this.stageQueues.get(descriptor.stage)!.push(descriptor.name);
    }

    /**
     * Unregister a service
     */
    unregister(name: string): void {
        const descriptor = this.services.get(name);
        if (descriptor) {
            this.services.delete(name);
            
            // Remove from stage queue
            const stageQueue = this.stageQueues.get(descriptor.stage);
            if (stageQueue) {
                const index = stageQueue.indexOf(name);
                if (index > -1) {
                    stageQueue.splice(index, 1);
                }
            }
        }
    }

    /**
     * Get service descriptor
     */
    getDescriptor(name: string): IServiceDescriptor | null {
        return this.services.get(name) || null;
    }

    /**
     * Get all service descriptors
     */
    getAllDescriptors(): Map<string, IServiceDescriptor> {
        return new Map(this.services);
    }

    /**
     * Get services by stage
     */
    getServicesByStage(stage: LoadingStage): string[] {
        return this.stageQueues.get(stage) || [];
    }

    /**
     * Get all stages with services
     */
    getAllStages(): LoadingStage[] {
        return Array.from(this.stageQueues.keys()).sort();
    }

    /**
     * Check if service exists
     */
    hasService(name: string): boolean {
        return this.services.has(name);
    }

    /**
     * Get service count by stage
     */
    getStageServiceCount(stage: LoadingStage): number {
        return this.stageQueues.get(stage)?.length || 0;
    }

    /**
     * Get total service count
     */
    getTotalServiceCount(): number {
        return this.services.size;
    }
}