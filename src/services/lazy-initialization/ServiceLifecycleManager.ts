import { IServiceLifecycle, IServiceDescriptor, ServiceStatus, LoadingStage } from './ServiceManagerInterfaces';

/**
 * Service Lifecycle Manager - Handles service initialization and cleanup
 * Follows Single Responsibility Principle
 */
export class ServiceLifecycleManager implements IServiceLifecycle {
    private serviceStatuses = new Map<string, ServiceStatus>();
    private initializationMutex = new Map<string, Promise<any>>();

    /**
     * Initialize a service using its descriptor
     */
    async initialize<T>(descriptor: IServiceDescriptor<T>): Promise<T> {
        const serviceName = descriptor.name;
        
        // Check if already initialized
        const status = this.serviceStatuses.get(serviceName);
        if (status?.initialized && status.ready) {
            return status as any; // Return cached instance
        }

        // Check if initialization is already in progress
        if (this.initializationMutex.has(serviceName)) {
            console.log(`[ServiceLifecycle] Waiting for ongoing initialization of ${serviceName}`);
            return this.initializationMutex.get(serviceName) as Promise<T>;
        }

        // Start initialization
        const initPromise = this.performInitialization(descriptor);
        this.initializationMutex.set(serviceName, initPromise);

        try {
            const instance = await initPromise;
            
            // Update status
            this.serviceStatuses.set(serviceName, {
                name: serviceName,
                stage: descriptor.stage,
                initialized: true,
                ready: true,
                error: undefined
            });

            // Clean up mutex
            this.initializationMutex.delete(serviceName);
            
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

            // Clean up mutex
            this.initializationMutex.delete(serviceName);
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
            const instance = status as any;
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
     * Get all service statuses
     */
    getAllStatuses(): Map<string, ServiceStatus> {
        return new Map(this.serviceStatuses);
    }

    /**
     * Perform the actual initialization
     */
    private async performInitialization<T>(descriptor: IServiceDescriptor<T>): Promise<T> {
        console.log(`[ServiceLifecycle] Initializing service: ${descriptor.name}`);
        
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