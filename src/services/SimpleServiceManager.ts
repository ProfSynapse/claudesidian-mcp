import { App } from 'obsidian';
import ClaudesidianPlugin from '../main';
import { EventManager } from './EventManager';
import { ProcessedFilesStateManager } from '../database/services/state/ProcessedFilesStateManager';
import { SimpleMemoryService } from './memory/SimpleMemoryService';
import { SessionService } from './session/SessionService';
import { ToolCallCaptureService } from './toolcall-capture/ToolCallCaptureService';
import { ServiceRegistry } from './registry/ServiceRegistry';

/**
 * Simple 3-tier service management system that replaces the complex LazyServiceManager.
 * 
 * Tier 1 (Immediate): Services needed for core functionality - available synchronously <100ms
 * Tier 2 (Fast): Services that improve UX - available via promises ~300ms
 * Tier 3 (Background): Heavy services - lazy loaded on demand
 */
export class SimpleServiceManager {
    private services = new Map<string, any>();
    private immediateServices = new Set([
        'eventManager', 'stateManager', 'toolCallCaptureService', 
        'sessionService', 'simpleMemoryService'
    ]);
    private fastServiceNames = new Set([
        'fileEventManager'
    ]);
    
    private fastServicesReady = false;
    private fastServicesPromise: Promise<void>;
    private backgroundServices = new Map<string, Promise<any>>();
    private serviceRegistry: ServiceRegistry;
    
    constructor(
        private app: App, 
        private plugin: ClaudesidianPlugin
    ) {
        // Initialize ServiceRegistry integration
        this.serviceRegistry = ServiceRegistry.getInstance();
        // Tier 1: Immediate Services - Block until ready (<100ms)
        this.initializeImmediateServices();
        
        // Tier 2: Fast Services - Start loading in parallel
        this.fastServicesPromise = this.initializeFastServices();
    }
    
    /**
     * Initialize Tier 1 services synchronously
     * These must be available immediately for core functionality
     */
    private initializeImmediateServices(): void {
        try {
            // EventManager - No dependencies
            const eventManager = new EventManager();
            this.services.set('eventManager', eventManager);
            
            // ProcessedFilesStateManager - Plugin data access
            const stateManager = new ProcessedFilesStateManager(this.plugin);
            this.services.set('stateManager', stateManager);
            
            // SimpleMemoryService - No dependencies
            const simpleMemoryService = new SimpleMemoryService();
            this.services.set('simpleMemoryService', simpleMemoryService);
            
            // SessionService - SimpleMemoryService dependency
            const sessionService = new SessionService(simpleMemoryService);
            this.services.set('sessionService', sessionService);
            
            // ToolCallCaptureService - Memory + Session dependencies
            const toolCallCaptureService = new ToolCallCaptureService(
                simpleMemoryService, 
                sessionService
            );
            this.services.set('toolCallCaptureService', toolCallCaptureService);
            
            console.log('[SimpleServiceManager] Tier 1 services initialized successfully');
        } catch (error) {
            console.error('[SimpleServiceManager] Failed to initialize immediate services:', error);
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Critical service initialization failed: ${message}`);
        }
    }
    
    /**
     * Initialize Tier 2 services in parallel
     * These improve UX but aren't critical for basic functionality
     */
    private async initializeFastServices(): Promise<void> {
        try {
            // For now, just mark as ready - defer complex service creation
            this.fastServicesReady = true;
            this.services.get('eventManager')?.emit('fast-services-ready');
            console.log('[SimpleServiceManager] Tier 2 services marked ready (deferred creation)');
        } catch (error) {
            console.error('[SimpleServiceManager] Fast services initialization error:', error);
            // Don't throw - these are non-critical services
        }
    }
    
    /**
     * Get service immediately if available, otherwise return null
     */
    getIfReady<T>(serviceName: string): T | null {
        if (this.services.has(serviceName)) {
            return this.services.get(serviceName) as T;
        }
        return null;
    }
    
    /**
     * Get service with proper tier-based loading
     */
    async get<T>(serviceName: string): Promise<T> {
        // Tier 1: Immediate services - return synchronously
        if (this.immediateServices.has(serviceName)) {
            const service = this.services.get(serviceName);
            if (!service) {
                throw new Error(`Immediate service ${serviceName} should be available but is not`);
            }
            return service as T;
        }
        
        // Tier 2: Fast services - return if ready, otherwise wait
        if (this.fastServiceNames.has(serviceName)) {
            if (this.fastServicesReady && this.services.has(serviceName)) {
                return this.services.get(serviceName) as T;
            }
            await this.fastServicesPromise;
            const service = this.services.get(serviceName);
            if (!service) {
                throw new Error(`Fast service ${serviceName} failed to initialize`);
            }
            return service as T;
        }
        
        // Tier 3: Background services - lazy initialize
        return await this.lazyInitialize<T>(serviceName);
    }
    
    /**
     * Check if a service is ready (loaded and available)
     */
    isReady(serviceName: string): boolean {
        if (this.immediateServices.has(serviceName)) {
            return this.services.has(serviceName);
        }
        if (this.fastServiceNames.has(serviceName)) {
            return this.fastServicesReady && this.services.has(serviceName);
        }
        // Background services are ready when they've been lazily loaded
        return this.services.has(serviceName);
    }
    
    /**
     * Get all currently initialized services
     */
    getAllInitialized(): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [name, service] of this.services.entries()) {
            result[name] = service;
        }
        return result;
    }
    
    /**
     * Lazy initialize background services on first access
     */
    private async lazyInitialize<T>(serviceName: string): Promise<T> {
        // Check if already loading
        if (this.backgroundServices.has(serviceName)) {
            return await this.backgroundServices.get(serviceName) as T;
        }
        
        // Check if already loaded
        if (this.services.has(serviceName)) {
            return this.services.get(serviceName) as T;
        }
        
        // Start loading
        const loadPromise = this.createBackgroundService(serviceName);
        this.backgroundServices.set(serviceName, loadPromise);
        
        try {
            const service = await loadPromise;
            this.services.set(serviceName, service);
            this.backgroundServices.delete(serviceName);
            return service as T;
        } catch (error) {
            this.backgroundServices.delete(serviceName);
            throw error;
        }
    }
    
    /**
     * Create background services based on service name
     * This is where Tier 3 services are defined and created
     * ENHANCED: Now uses ServiceRegistry to prevent duplicate creation
     */
    private async createBackgroundService(serviceName: string): Promise<any> {
        console.log(`[SimpleServiceManager] Lazy loading background service: ${serviceName}`);
        
        // CRITICAL FIX: Use ServiceRegistry first to check for existing instances
        const existingService = this.serviceRegistry.getService(serviceName);
        if (existingService) {
            console.log(`[SimpleServiceManager] ✅ Found existing ${serviceName} in ServiceRegistry`);
            return existingService;
        }
        
        // Service not in registry, delegate to LazyServiceManager with registry coordination
        try {
            const LazyServiceManager = (await import('./LazyServiceManager')).LazyServiceManager;
            const lazyManager = new LazyServiceManager(this.app, this.plugin);
            
            const service = await lazyManager.get(serviceName);
            console.log(`[SimpleServiceManager] ✅ Successfully loaded ${serviceName} via LazyServiceManager`);
            return service;
            
        } catch (error) {
            console.error(`[SimpleServiceManager] Failed to load ${serviceName}:`, error);
            return null;
        }
    }
    
    /**
     * Upgrade a service to enhanced functionality when dependencies are ready
     */
    async upgradeService(serviceName: string, enhancedService: any): Promise<void> {
        const currentService = this.services.get(serviceName);
        if (currentService && typeof currentService.upgrade === 'function') {
            await currentService.upgrade(enhancedService);
        }
        this.services.set(serviceName, enhancedService);
        console.log(`[SimpleServiceManager] Upgraded ${serviceName} to enhanced functionality`);
    }

    /**
     * Inject vector store into SimpleMemoryService for persistence
     * ENHANCED: Now validates collections are ready before injection
     */
    async injectVectorStore(vectorStore: any): Promise<void> {
        try {
            // CRITICAL: Validate that required collections exist before injection
            await this.validateVectorStoreCollections(vectorStore);
            
            const simpleMemoryService = this.services.get('simpleMemoryService');
            if (simpleMemoryService && typeof simpleMemoryService.setVectorStore === 'function') {
                simpleMemoryService.setVectorStore(vectorStore);
                console.log('[SimpleServiceManager] ✅ Vector store injected into SimpleMemoryService with validated collections');
            } else {
                console.warn('[SimpleServiceManager] SimpleMemoryService not found or missing setVectorStore method');
            }
        } catch (error) {
            console.error('[SimpleServiceManager] ❌ Vector store injection failed:', error);
            throw error;
        }
    }

    /**
     * Validate that vector store has all required collections ready
     * This prevents the "Collection not found" errors in memory trace operations
     */
    private async validateVectorStoreCollections(vectorStore: any): Promise<void> {
        if (!vectorStore) {
            throw new Error('Vector store is null or undefined');
        }
        
        // Check if vector store is initialized
        if (!vectorStore.initialized) {
            throw new Error('Vector store is not initialized');
        }
        
        try {
            // Get collection lifecycle manager if available
            const lifecycleManager = typeof vectorStore.getCollectionLifecycleManager === 'function' 
                ? vectorStore.getCollectionLifecycleManager() 
                : null;
            
            if (lifecycleManager) {
                // Perform comprehensive health check
                console.log('[SimpleServiceManager] Validating collection health...');
                const healthCheck = await lifecycleManager.performHealthCheck();
                
                if (!healthCheck.healthy) {
                    console.warn('[SimpleServiceManager] ⚠️  Collection health issues detected:', healthCheck.issues);
                    
                    // Attempt automatic recovery for critical collections
                    await this.recoverCriticalCollections(lifecycleManager, healthCheck);
                }
                
                // Verify memory_traces collection specifically (critical for SimpleMemoryService)
                const memoryTracesValidation = await lifecycleManager.validateCollection('memory_traces');
                if (!memoryTracesValidation.valid) {
                    console.warn('[SimpleServiceManager] ⚠️  Memory traces collection invalid, attempting recovery...');
                    const recoveryResult = await lifecycleManager.recoverCollection('memory_traces', 'soft');
                    
                    if (!recoveryResult.success) {
                        throw new Error(`Failed to recover memory_traces collection: ${recoveryResult.errors.join(', ')}`);
                    }
                    
                    console.log('[SimpleServiceManager] ✅ Memory traces collection recovered successfully');
                }
                
            } else {
                // Fallback validation without lifecycle manager
                const hasMemoryTraces = await vectorStore.hasCollection('memory_traces');
                if (!hasMemoryTraces) {
                    console.log('[SimpleServiceManager] Creating missing memory_traces collection...');
                    await vectorStore.createCollection('memory_traces', {
                        'hnsw:space': 'cosine',
                        description: 'Memory traces for tool calls and user interactions',
                        createdBy: 'SimpleServiceManager',
                        createdAt: new Date().toISOString()
                    });
                }
            }
            
            console.log('[SimpleServiceManager] ✅ Vector store collections validated successfully');
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[SimpleServiceManager] ❌ Collection validation failed:', error);
            throw new Error(`Vector store collection validation failed: ${errorMessage}`);
        }
    }

    /**
     * Attempt recovery for critical collections
     */
    private async recoverCriticalCollections(lifecycleManager: any, healthCheck: any): Promise<void> {
        const criticalCollections = ['memory_traces', 'file_embeddings'];
        
        for (const collectionName of criticalCollections) {
            const collectionHealth = healthCheck.collections[collectionName];
            if (collectionHealth && (!collectionHealth.exists || !collectionHealth.accessible)) {
                console.log(`[SimpleServiceManager] Recovering critical collection: ${collectionName}`);
                
                try {
                    const recoveryResult = await lifecycleManager.recoverCollection(collectionName, 'soft');
                    if (recoveryResult.success) {
                        console.log(`[SimpleServiceManager] ✅ Recovered ${collectionName} successfully`);
                    } else {
                        console.warn(`[SimpleServiceManager] ⚠️  Recovery failed for ${collectionName}:`, recoveryResult.errors);
                    }
                } catch (recoveryError) {
                    console.error(`[SimpleServiceManager] ❌ Recovery error for ${collectionName}:`, recoveryError);
                }
            }
        }
    }
    
    /**
     * Compatibility methods for LazyServiceManager interface
     */
    getReadinessStatus(): Record<string, any> {
        const status: Record<string, any> = {};
        for (const serviceName of this.immediateServices) {
            status[serviceName] = { ready: true, tier: 'immediate' };
        }
        for (const serviceName of this.fastServiceNames) {
            status[serviceName] = { ready: this.fastServicesReady, tier: 'fast' };
        }
        for (const [serviceName] of this.services) {
            if (!status[serviceName]) {
                status[serviceName] = { ready: true, tier: 'background' };
            }
        }
        return status;
    }
    
    isStageReady(stage: string): boolean {
        switch (stage) {
            case 'immediate':
            case 'tier1':
                return true;
            case 'fast':
            case 'tier2':
                return this.fastServicesReady;
            case 'background':
            case 'tier3':
                return true; // Background services are ready when accessed
            default:
                return false;
        }
    }
    
    async cleanup(): Promise<void> {
        // Simple cleanup - clear services
        this.services.clear();
        this.backgroundServices.clear();
        console.log('[SimpleServiceManager] Cleanup completed');
    }
}