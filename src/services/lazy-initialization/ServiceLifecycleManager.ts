import { IServiceLifecycle, IServiceDescriptor, ServiceStatus, LoadingStage } from './ServiceManagerInterfaces';

/**
 * Service Lifecycle Manager - Handles service initialization and cleanup
 * Follows Single Responsibility Principle
 */
export class ServiceLifecycleManager implements IServiceLifecycle {
    private serviceStatuses = new Map<string, ServiceStatus>();
    private initializationMutex = new Map<string, Promise<any>>();
    private initializingServices = new Set<string>(); // Track services currently being initialized

    /**
     * Initialize a service using its descriptor
     */
    async initialize<T>(descriptor: IServiceDescriptor<T>): Promise<T> {
        const serviceName = descriptor.name;
        
        // Check if already initialized
        const status = this.serviceStatuses.get(serviceName);
        if (status?.initialized && status.ready && status.instance) {
            return status.instance as T; // Return cached instance
        }

        // Check if initialization is already in progress
        if (this.initializationMutex.has(serviceName)) {
            return this.initializationMutex.get(serviceName) as Promise<T>;
        }

        // CRITICAL FIX: Mark service as being initialized to prevent circular dependency
        this.initializingServices.add(serviceName);

        // Start initialization
        const initPromise = this.performInitialization(descriptor);
        this.initializationMutex.set(serviceName, initPromise);

        try {
            const instance = await initPromise;
            
            // Update status - store the actual instance
            this.serviceStatuses.set(serviceName, {
                name: serviceName,
                stage: descriptor.stage,
                initialized: true,
                ready: true,
                error: undefined,
                instance: instance // Store the actual instance
            });

            // Clean up tracking
            this.initializationMutex.delete(serviceName);
            this.initializingServices.delete(serviceName);
            
            return instance;
        } catch (error) {
            // Update status with error
            this.serviceStatuses.set(serviceName, {
                name: serviceName,
                stage: descriptor.stage,
                initialized: false,
                ready: false,
                error: error as Error
            });

            // Clean up tracking
            this.initializationMutex.delete(serviceName);
            this.initializingServices.delete(serviceName);
            throw error;
        }
    }

    /**
     * Cleanup a service
     */
    async cleanup(serviceName: string): Promise<void> {
        const status = this.serviceStatuses.get(serviceName);
        if (!status?.initialized) {
            return;
        }

        try {
            // Call cleanup method if it exists
            const instance = status.instance;
            if (instance && typeof instance.cleanup === 'function') {
                await instance.cleanup();
            }
            
            // Update status
            this.serviceStatuses.set(serviceName, {
                ...status,
                initialized: false,
                ready: false
            });
        } catch (error) {
            console.error(`[ServiceLifecycle] Error cleaning up ${serviceName}:`, error);
            throw error;
        }
    }

    /**
     * Get service status
     */
    getStatus(serviceName: string): ServiceStatus {
        return this.serviceStatuses.get(serviceName) || {
            name: serviceName,
            stage: LoadingStage.IMMEDIATE,
            initialized: false,
            ready: false
        };
    }

    /**
     * Check if service is ready
     */
    isReady(serviceName: string): boolean {
        const status = this.serviceStatuses.get(serviceName);
        return status?.ready || false;
    }

    /**
     * Get service instance if ready
     */
    getServiceInstance<T>(serviceName: string): T | null {
        const status = this.serviceStatuses.get(serviceName);
        if (status?.ready && status.instance) {
            return status.instance as T;
        }
        return null;
    }

    /**
     * Get all service statuses
     */
    getAllStatuses(): Map<string, ServiceStatus> {
        return new Map(this.serviceStatuses);
    }

    /**
     * Check if service is currently being initialized
     * Boy Scout Rule: Clean method for circular dependency prevention
     */
    isInitializing(serviceName: string): boolean {
        return this.initializingServices.has(serviceName);
    }

    /**
     * Get initialization promise for service currently being initialized
     * Boy Scout Rule: Provides access to existing promise to prevent duplicate initialization
     */
    getInitializationPromise(serviceName: string): Promise<any> | null {
        return this.initializationMutex.get(serviceName) || null;
    }

    /**
     * Perform the actual initialization
     */
    private async performInitialization<T>(descriptor: IServiceDescriptor<T>): Promise<T> {
        // Set status to initializing
        this.serviceStatuses.set(descriptor.name, {
            name: descriptor.name,
            stage: descriptor.stage,
            initialized: false,
            ready: false
        });

        // Create the service instance
        const instance = await descriptor.create();
        
        // Initialize the service if it has an initialize method
        if (instance && typeof (instance as any).initialize === 'function') {
            await (instance as any).initialize();
        }
        
        return instance;
    }
}