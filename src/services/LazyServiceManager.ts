import { App } from 'obsidian';
import ClaudesidianPlugin from '../main';
import { IServiceManager, IServiceDescriptor, LoadingStage } from './lazy-initialization/ServiceManagerInterfaces';
import { ServiceRegistryManager } from './lazy-initialization/ServiceRegistryManager';
import { ServiceLifecycleManager } from './lazy-initialization/ServiceLifecycleManager';
import { WorkspaceCacheManager } from './lazy-initialization/WorkspaceCacheManager';
import { ServiceDescriptors } from './lazy-initialization/ServiceDescriptors';

/**
 * Lazy Service Manager - SOLID compliant
 * 
 * Follows SOLID principles:
 * - SRP: Each component has a single responsibility
 * - OCP: Open for extension through service descriptors
 * - LSP: Services are substitutable through interfaces
 * - ISP: Interfaces are segregated by purpose
 * - DIP: Dependencies are injected, not hardcoded
 */
export class LazyServiceManager implements IServiceManager {
    private registry: ServiceRegistryManager;
    private lifecycle: ServiceLifecycleManager;
    private workspaceCache: WorkspaceCacheManager;
    private serviceDescriptors: ServiceDescriptors;
    private isStarted = false;
    private toolCallCount = 0;

    constructor(
        private app: App,
        private plugin: ClaudesidianPlugin
    ) {
        // Initialize components following Dependency Injection principle
        this.registry = new ServiceRegistryManager();
        this.lifecycle = new ServiceLifecycleManager();
        this.workspaceCache = new WorkspaceCacheManager(app);
        this.serviceDescriptors = new ServiceDescriptors(app, plugin);
        
        // Set up dependency injection
        this.serviceDescriptors.setDependencyResolver((name: string) => {
            console.log(`[DEPENDENCY_DEBUG] Resolving dependency: ${name}`);
            return this.get(name).then(result => {
                console.log(`[DEPENDENCY_DEBUG] Resolved ${name}:`, result);
                console.log(`[DEPENDENCY_DEBUG] ${name} type:`, typeof result);
                console.log(`[DEPENDENCY_DEBUG] ${name} constructor:`, result?.constructor?.name);
                return result;
            });
        });
        
        // Register all services
        this.registerServices();
    }

    /**
     * Get a service instance, initializing if needed
     */
    async get<T>(name: string): Promise<T> {
        const descriptor = this.registry.getDescriptor(name);
        if (!descriptor) {
            throw new Error(`Service '${name}' not found`);
        }

        // Check if already ready
        if (this.lifecycle.isReady(name)) {
            return this.lifecycle.getStatus(name) as any;
        }

        // Initialize dependencies first
        if (descriptor.dependencies.length > 0) {
            await Promise.all(
                descriptor.dependencies.map(dep => this.get(dep))
            );
        }

        // Initialize the service
        return await this.lifecycle.initialize(descriptor);
    }

    /**
     * Check if service is ready
     */
    isReady(name: string): boolean {
        return this.lifecycle.isReady(name);
    }

    /**
     * Start the service manager
     */
    async start(): Promise<void> {
        if (this.isStarted) {
            return;
        }

        const startTime = Date.now();
        
        // Mark as started - don't initialize anything yet
        this.isStarted = true;
        const duration = Date.now() - startTime;
        
        console.log(`[LazyServiceManager] Started in ${duration}ms (no services initialized)`);

        // Start background initialization
        this.startCascadingInitialization();
        
        // Also initialize IMMEDIATE stage services right away
        setTimeout(async () => {
            try {
                console.log('[STAGE_DEBUG] Initializing IMMEDIATE stage services...');
                await this.initializeStage(LoadingStage.IMMEDIATE);
                console.log('[STAGE_DEBUG] IMMEDIATE stage services ready');
            } catch (error) {
                console.error('[STAGE_DEBUG] IMMEDIATE stage initialization failed:', error);
            }
        }, 100);
    }

    /**
     * Stop the service manager
     */
    async stop(): Promise<void> {
        if (!this.isStarted) {
            return;
        }

        // Cleanup all services
        const statuses = this.lifecycle.getAllStatuses();
        for (const [serviceName, status] of statuses) {
            if (status.initialized) {
                try {
                    await this.lifecycle.cleanup(serviceName);
                } catch (error) {
                    console.warn(`[LazyServiceManagerRefactored] Error cleaning up ${serviceName}:`, error);
                }
            }
        }

        // Clear workspace cache
        this.workspaceCache.clearWorkspaceCache();
        
        this.isStarted = false;
        console.log('[LazyServiceManager] Stopped');
    }

    /**
     * Handle tool call events
     */
    async onToolCall(): Promise<void> {
        this.toolCallCount++;
        // Tool call tracking only - vector store loads automatically in background
    }

    /**
     * Handle workspace load events
     */
    async onWorkspaceLoad(workspaceId: string, workspacePath?: string[]): Promise<void> {
        await this.workspaceCache.onWorkspaceLoad(workspaceId, workspacePath);
    }

    /**
     * Get service if ready (non-blocking)
     */
    getIfReady<T>(name: string): T | null {
        if (!this.lifecycle.isReady(name)) {
            return null;
        }
        
        const status = this.lifecycle.getStatus(name);
        return status.instance as T || null;
    }

    /**
     * Get all initialized services
     */
    getAllInitialized(): Record<string, any> {
        const services: Record<string, any> = {};
        const statuses = this.lifecycle.getAllStatuses();
        
        for (const [name, status] of statuses) {
            if (status.initialized && status.ready && status.instance) {
                services[name] = status.instance;
            }
        }
        
        return services;
    }

    /**
     * Get service readiness status
     */
    getReadinessStatus(): Record<string, { stage: number; ready: boolean; initialized: boolean }> {
        const status: Record<string, { stage: number; ready: boolean; initialized: boolean }> = {};
        const statuses = this.lifecycle.getAllStatuses();
        
        for (const [name, serviceStatus] of statuses) {
            status[name] = {
                stage: serviceStatus.stage,
                ready: serviceStatus.ready,
                initialized: serviceStatus.initialized
            };
        }
        
        return status;
    }

    /**
     * Check if stage is ready
     */
    isStageReady(stage: LoadingStage): boolean {
        const serviceNames = this.registry.getServicesByStage(stage);
        return serviceNames.every(name => this.lifecycle.isReady(name));
    }

    /**
     * Wait for service to be ready
     */
    async waitForService<T>(name: string, timeoutMs: number = 10000): Promise<T | null> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            if (this.lifecycle.isReady(name)) {
                return this.getIfReady<T>(name);
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.warn(`[LazyServiceManager] Timeout waiting for service '${name}' (${timeoutMs}ms)`);
        return null;
    }

    /**
     * Cleanup method
     */
    async cleanup(): Promise<void> {
        await this.stop();
    }

    /**
     * Register all services using service descriptors
     */
    private registerServices(): void {
        const descriptors = this.serviceDescriptors.getAllDescriptors();
        
        for (const descriptor of descriptors) {
            this.registry.register(descriptor);
        }
        
        console.log(`[LazyServiceManager] Registered ${descriptors.length} services`);
    }

    /**
     * Start cascading background initialization
     */
    private startCascadingInitialization(): void {
        setTimeout(async () => {
            try {
                console.log('[LazyServiceManager] Starting background services...');
                
                // Initialize BACKGROUND_SLOW services (includes HNSW and vector operations)
                setTimeout(async () => {
                    try {
                        console.log('[LazyServiceManager] Starting slow background services...');
                        await this.initializeStage(LoadingStage.BACKGROUND_SLOW);
                        console.log('[LazyServiceManager] All background services loaded');
                    } catch (error) {
                        console.warn('[LazyServiceManager] Background slow initialization failed:', error);
                    }
                }, 5000); // 5s delay to ensure plugin startup is complete
                
            } catch (error) {
                console.warn('[LazyServiceManager] Background initialization failed:', error);
            }
        }, 2000); // 2 second delay to ensure plugin is fully loaded
    }

    /**
     * Initialize all services in a specific stage
     */
    private async initializeStage(stage: LoadingStage): Promise<void> {
        const serviceNames = this.registry.getServicesByStage(stage);
        if (serviceNames.length === 0) {
            return;
        }

        const startTime = Date.now();
        
        // Initialize services in parallel within the stage
        const promises = serviceNames.map(async (name) => {
            try {
                await this.get(name);
            } catch (error) {
                console.error(`[LazyServiceManager] ✗ Failed to initialize ${name}:`, error);
                throw error;
            }
        });
        
        await Promise.all(promises);
        
        const duration = Date.now() - startTime;
        console.log(`[LazyServiceManager] Stage ${LoadingStage[stage]} completed in ${duration}ms`);
    }
}