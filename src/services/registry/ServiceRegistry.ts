/**
 * ServiceRegistry - Singleton pattern for unified service instance management
 * 
 * This service registry implements the critical singleton enforcement system to eliminate
 * the vector store multiplicity crisis where 4 separate instances are created during startup.
 * 
 * Location: /src/services/registry/ServiceRegistry.ts
 * Usage: Coordinates with ServiceDescriptors and SimpleServiceManager to ensure single instance creation
 * Integration: Used by VectorStoreFactory and service managers to prevent duplicate service instantiation
 */

export interface ServiceOptions {
    timeout?: number;
    retryCount?: number;
    priority?: ServicePriority;
    dependencies?: string[];
    upgradeStrategy?: UpgradeStrategy;
}

export enum ServicePriority {
    CRITICAL = 'critical',
    HIGH = 'high',
    MEDIUM = 'medium',
    LOW = 'low'
}

export enum ServiceStatus {
    Creating = 'creating',
    Ready = 'ready',
    Failed = 'failed',
    Upgrading = 'upgrading'
}

export enum UpgradeStrategy {
    Replace = 'replace',
    Extend = 'extend',
    Merge = 'merge'
}

export interface ServiceInstance<T> {
    service: T;
    createdAt: number;
    dependencies: string[];
    status: ServiceStatus;
    metadata: ServiceMetadata;
    promise?: Promise<T>;
}

export interface ServiceMetadata {
    priority: ServicePriority;
    retryCount: number;
    lastError?: string;
    creationTime?: number;
    upgradeHistory?: string[];
}

/**
 * Global singleton service registry for preventing service instance duplication
 * Thread-safe singleton pattern with promise deduplication and error recovery
 */
export class ServiceRegistry {
    private static instance: ServiceRegistry | null = null;
    private services: Map<string, ServiceInstance<any>> = new Map();
    private creationPromises: Map<string, Promise<any>> = new Map();
    private lifecycleListeners: Map<string, Set<(instance: any) => void>> = new Map();
    
    /**
     * Private constructor to enforce singleton pattern
     */
    private constructor() {
    }
    
    /**
     * Get the singleton ServiceRegistry instance
     */
    public static getInstance(): ServiceRegistry {
        if (ServiceRegistry.instance === null) {
            ServiceRegistry.instance = new ServiceRegistry();
        }
        return ServiceRegistry.instance;
    }
    
    /**
     * Get or create a service instance with atomic promise deduplication
     * This is the core method that prevents multiple service instance creation
     */
    public async getOrCreateService<T>(
        serviceName: string, 
        factory: () => Promise<T>,
        options: ServiceOptions = {}
    ): Promise<T> {
        // Fast path: Check if service is already ready
        const existingInstance = this.services.get(serviceName);
        if (existingInstance && existingInstance.status === ServiceStatus.Ready) {
            return existingInstance.service as T;
        }
        
        // Check if service is currently being created (promise deduplication)
        if (this.creationPromises.has(serviceName)) {
            return await this.creationPromises.get(serviceName) as T;
        }
        
        // Start new service creation
        const creationPromise = this.createServiceWithTimeout(serviceName, factory, options);
        this.creationPromises.set(serviceName, creationPromise);
        
        try {
            const service = await creationPromise;
            
            // Store successful service instance
            this.services.set(serviceName, {
                service,
                createdAt: Date.now(),
                dependencies: options.dependencies || [],
                status: ServiceStatus.Ready,
                metadata: {
                    priority: options.priority || ServicePriority.MEDIUM,
                    retryCount: 0,
                    creationTime: Date.now()
                }
            });
            
            // Notify lifecycle listeners
            this.notifyLifecycleListeners(serviceName, service);
            
            return service;
            
        } catch (error) {
            // Store failed service for debugging
            this.services.set(serviceName, {
                service: null,
                createdAt: Date.now(),
                dependencies: options.dependencies || [],
                status: ServiceStatus.Failed,
                metadata: {
                    priority: options.priority || ServicePriority.MEDIUM,
                    retryCount: 0,
                    lastError: error instanceof Error ? error.message : String(error)
                }
            });
            
            console.error(`[ServiceRegistry] ❌ Failed to create ${serviceName}:`, error);
            throw error;
        } finally {
            // Clean up creation promise
            this.creationPromises.delete(serviceName);
        }
    }
    
    /**
     * Create service with timeout protection
     */
    private async createServiceWithTimeout<T>(
        serviceName: string,
        factory: () => Promise<T>,
        options: ServiceOptions
    ): Promise<T> {
        const timeout = options.timeout || 30000; // 30 second default timeout
        const retryCount = options.retryCount || 1;
        
        for (let attempt = 1; attempt <= retryCount; attempt++) {
            try {
                const startTime = Date.now();
                
                // Create timeout promise
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => {
                        reject(new Error(`Service ${serviceName} creation timed out after ${timeout}ms`));
                    }, timeout);
                });
                
                // Race between service creation and timeout
                const service = await Promise.race([
                    factory(),
                    timeoutPromise
                ]);
                
                return service;
                
            } catch (error) {
                if (attempt < retryCount) {
                    const delay = 1000 * attempt; // Exponential backoff
                    console.warn(`[ServiceRegistry] ${serviceName} creation attempt ${attempt} failed, retrying in ${delay}ms:`, error);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error;
                }
            }
        }
        
        throw new Error(`Service ${serviceName} creation failed after ${retryCount} attempts`);
    }
    
    /**
     * Check if a service exists in the registry
     */
    public hasService(serviceName: string): boolean {
        return this.services.has(serviceName);
    }
    
    /**
     * Get a service if it exists and is ready
     */
    public getService<T>(serviceName: string): T | null {
        const instance = this.services.get(serviceName);
        if (instance && instance.status === ServiceStatus.Ready) {
            return instance.service as T;
        }
        return null;
    }
    
    /**
     * Get service instance status
     */
    public getServiceStatus(serviceName: string): ServiceStatus | null {
        const instance = this.services.get(serviceName);
        return instance ? instance.status : null;
    }
    
    /**
     * Upgrade a service instance with enhanced functionality
     */
    public async upgradeService<T>(
        serviceName: string, 
        enhancedService: T,
        strategy: UpgradeStrategy = UpgradeStrategy.Replace
    ): Promise<void> {
        const existingInstance = this.services.get(serviceName);
        if (!existingInstance) {
            throw new Error(`Cannot upgrade non-existent service: ${serviceName}`);
        }
        
        
        // Mark as upgrading
        existingInstance.status = ServiceStatus.Upgrading;
        
        try {
            let finalService: T;
            
            switch (strategy) {
                case UpgradeStrategy.Replace:
                    finalService = enhancedService;
                    break;
                    
                case UpgradeStrategy.Extend:
                    // Merge properties if possible
                    if (typeof existingInstance.service === 'object' && typeof enhancedService === 'object') {
                        finalService = { ...existingInstance.service, ...enhancedService } as T;
                    } else {
                        finalService = enhancedService;
                    }
                    break;
                    
                case UpgradeStrategy.Merge:
                    // Custom merge logic (service-specific)
                    if (existingInstance.service && typeof existingInstance.service.upgrade === 'function') {
                        await existingInstance.service.upgrade(enhancedService);
                        finalService = existingInstance.service as T;
                    } else {
                        finalService = enhancedService;
                    }
                    break;
                    
                default:
                    finalService = enhancedService;
            }
            
            // Update instance
            existingInstance.service = finalService;
            existingInstance.status = ServiceStatus.Ready;
            existingInstance.metadata.upgradeHistory = existingInstance.metadata.upgradeHistory || [];
            existingInstance.metadata.upgradeHistory.push(`${strategy}:${Date.now()}`);
            
            // Notify listeners
            this.notifyLifecycleListeners(serviceName, finalService);
            
            
        } catch (error) {
            existingInstance.status = ServiceStatus.Failed;
            existingInstance.metadata.lastError = error instanceof Error ? error.message : String(error);
            throw error;
        }
    }
    
    /**
     * Clear a service instance (for testing or recovery)
     */
    public clearService(serviceName: string): void {
        this.services.delete(serviceName);
        this.creationPromises.delete(serviceName);
        this.lifecycleListeners.delete(serviceName);
    }
    
    /**
     * Get dependency graph for diagnostics
     */
    public getInstanceGraph(): Record<string, any> {
        const graph: Record<string, any> = {};
        
        for (const [serviceName, instance] of this.services) {
            graph[serviceName] = {
                status: instance.status,
                dependencies: instance.dependencies,
                createdAt: instance.createdAt,
                priority: instance.metadata.priority,
                hasService: !!instance.service,
                lastError: instance.metadata.lastError
            };
        }
        
        return graph;
    }
    
    /**
     * Add lifecycle listener for service events
     */
    public addLifecycleListener(serviceName: string, listener: (instance: any) => void): void {
        if (!this.lifecycleListeners.has(serviceName)) {
            this.lifecycleListeners.set(serviceName, new Set());
        }
        this.lifecycleListeners.get(serviceName)!.add(listener);
    }
    
    /**
     * Remove lifecycle listener
     */
    public removeLifecycleListener(serviceName: string, listener: (instance: any) => void): void {
        const listeners = this.lifecycleListeners.get(serviceName);
        if (listeners) {
            listeners.delete(listener);
            if (listeners.size === 0) {
                this.lifecycleListeners.delete(serviceName);
            }
        }
    }
    
    /**
     * Notify lifecycle listeners of service events
     */
    private notifyLifecycleListeners(serviceName: string, instance: any): void {
        const listeners = this.lifecycleListeners.get(serviceName);
        if (listeners) {
            for (const listener of listeners) {
                try {
                    listener(instance);
                } catch (error) {
                    console.warn(`[ServiceRegistry] Lifecycle listener error for ${serviceName}:`, error);
                }
            }
        }
    }
    
    /**
     * Clean up all services (for testing or shutdown)
     */
    public cleanup(): void {
        this.services.clear();
        this.creationPromises.clear();
        this.lifecycleListeners.clear();
    }
    
    /**
     * Get registry statistics for monitoring
     */
    public getStatistics(): {
        totalServices: number;
        readyServices: number;
        failedServices: number;
        creatingServices: number;
        averageCreationTime: number;
    } {
        let readyCount = 0;
        let failedCount = 0;
        let creatingCount = 0;
        let totalCreationTime = 0;
        let servicesWithTime = 0;
        
        for (const instance of this.services.values()) {
            switch (instance.status) {
                case ServiceStatus.Ready:
                    readyCount++;
                    break;
                case ServiceStatus.Failed:
                    failedCount++;
                    break;
                case ServiceStatus.Creating:
                    creatingCount++;
                    break;
            }
            
            if (instance.metadata.creationTime) {
                totalCreationTime += instance.metadata.creationTime;
                servicesWithTime++;
            }
        }
        
        return {
            totalServices: this.services.size,
            readyServices: readyCount,
            failedServices: failedCount,
            creatingServices: creatingCount + this.creationPromises.size,
            averageCreationTime: servicesWithTime > 0 ? totalCreationTime / servicesWithTime : 0
        };
    }
}