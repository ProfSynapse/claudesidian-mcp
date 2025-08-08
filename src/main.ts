import { Plugin, Notice } from 'obsidian';
import { MCPConnector } from './connector';
import { Settings } from './settings';
import { ServiceManager } from './core/ServiceManager';
import { ServiceAccessMixin } from './core/ServiceAccessMixin';
import { PluginLifecycleManager, type PluginLifecycleConfig } from './core/PluginLifecycleManager';
import { logger } from './utils/logger';

// Type imports for service interfaces
import type { EmbeddingService } from './database/services/core/EmbeddingService';
import type { FileEmbeddingAccessService } from './database/services/indexing/FileEmbeddingAccessService';
import type { CollectionService } from "./database/services/core/CollectionService";
import type { IVectorStore } from './database/interfaces/IVectorStore';
import type { WorkspaceService } from './agents/memoryManager/services/WorkspaceService';
import type { MemoryService } from './agents/memoryManager/services/MemoryService';
import type { EventManager } from './services/EventManager';
import type { FileEventManagerModular } from './services/file-events/FileEventManagerModular';
import type { UsageStatsService } from './database/services/usage/UsageStatsService';
import type { CacheManager } from './database/services/cache/CacheManager';
import type { ProcessedFilesStateManager } from './database/services/indexing/state/ProcessedFilesStateManager';
import type { MemoryTraceService } from './agents/memoryManager/services/MemoryTraceService';
import type { ToolCallCaptureService } from './services/toolcall-capture/ToolCallCaptureService';

export default class ClaudesidianPlugin extends Plugin {
    public settings!: Settings;
    private connector!: MCPConnector;
    private serviceManager!: ServiceManager;
    private serviceAccessMixin!: ServiceAccessMixin;
    private lifecycleManager!: PluginLifecycleManager;
    
    // Service properties - delegated to ServiceAccessMixin for consistent access
    public get vectorStore(): IVectorStore | null { 
        return this.serviceAccessMixin?.vectorStore || null; 
    }
    public get embeddingService(): EmbeddingService | null { 
        return this.serviceAccessMixin?.embeddingService || null; 
    }
    public get fileEmbeddingAccessService(): FileEmbeddingAccessService | null { 
        return this.serviceAccessMixin?.fileEmbeddingAccessService || null; 
    }
    public get directCollectionService(): CollectionService | null { 
        return this.serviceAccessMixin?.directCollectionService || null; 
    }
    public get workspaceService(): WorkspaceService | null { 
        return this.serviceAccessMixin?.workspaceService || null; 
    }
    public get memoryService(): MemoryService | null { 
        return this.serviceAccessMixin?.memoryService || null; 
    }
    public get fileEventManager(): FileEventManagerModular | null { 
        return this.serviceAccessMixin?.fileEventManager || null; 
    }
    public get eventManager(): EventManager | null { 
        return this.serviceAccessMixin?.eventManager || null; 
    }
    public get usageStatsService(): UsageStatsService | null { 
        return this.serviceAccessMixin?.usageStatsService || null; 
    }
    public get cacheManager(): CacheManager | null { 
        return this.serviceAccessMixin?.cacheManager || null; 
    }
    public get stateManager(): ProcessedFilesStateManager | null { 
        return this.serviceAccessMixin?.stateManager || null; 
    }
    public get memoryTraceService(): MemoryTraceService | null { 
        return this.serviceAccessMixin?.memoryTraceService || null; 
    }
    public get toolCallCaptureService(): ToolCallCaptureService | null { 
        return this.serviceAccessMixin?.toolCallCaptureService || null; 
    }
    
    /**
     * Get a service asynchronously, waiting for it to be ready if needed
     */
    public async getService<T>(name: string, timeoutMs: number = 10000): Promise<T | null> {
        return this.serviceAccessMixin?.getService<T>(name, timeoutMs) || null;
    }
    
    // Service registry - returns initialized services from container
    public get services(): Record<string, any> {
        return this.serviceAccessMixin?.services || {};
    }
    
    async onload() {
        const startTime = performance.now();
        const initialMemory = this.getMemoryUsage();
        
        // Starting plugin initialization
        
        try {
            // PHASE 1: Foundation - Create service manager and settings
            const phase1Start = performance.now();
            this.settings = new Settings(this);
            this.serviceManager = new ServiceManager(this.app, this);
            const phase1End = performance.now();
            const phase1Memory = this.getMemoryUsage();
            
            // Phase 1 (Foundation) complete
            
            // PHASE 2: Create service access mixin for typed service access
            this.serviceAccessMixin = new ServiceAccessMixin(this.serviceManager);
            
            // PHASE 3: Initialize connector skeleton (no agents yet)
            this.connector = new MCPConnector(this.app, this);
            
            // PHASE 4: Create and initialize lifecycle manager
            const phase4Start = performance.now();
            const lifecycleConfig: PluginLifecycleConfig = {
                plugin: this,
                app: this.app,
                serviceManager: this.serviceManager,
                settings: this.settings,
                connector: this.connector,
                manifest: this.manifest
            };
            
            this.lifecycleManager = new PluginLifecycleManager(lifecycleConfig);
            await this.lifecycleManager.initialize();
            
            const phase4End = performance.now();
            const finalMemory = this.getMemoryUsage();
            
            // Phase 4 (Lifecycle) complete

            const totalTime = performance.now() - startTime;
            const totalMemoryDelta = finalMemory - initialMemory;

            // Initialization complete

            // Warn about high memory usage during initialization
            if (totalMemoryDelta > 100 * 1024 * 1024) { // > 100MB
                console.warn(`HIGH MEMORY USAGE: Plugin initialization used ${Math.round(totalMemoryDelta / 1024 / 1024)}MB`);
            }
            
        } catch (error) {
            const errorTime = performance.now();
            const errorMemory = this.getMemoryUsage();
            
            console.error('Critical initialization failure:', {
                error: error instanceof Error ? error.message : String(error),
                errorTimeMs: Math.round(errorTime - startTime),
                memoryDeltaMB: Math.round((errorMemory - initialMemory) / 1024 / 1024 * 100) / 100
            });
            // Fallback mode is handled by PluginLifecycleManager
        }
    }
    
    /**
     * Reload configuration for all services after settings change
     */
    reloadConfiguration(): void {
        this.lifecycleManager?.reloadConfiguration();
    }
    
    /**
     * Get the connector instance
     */
    getConnector(): MCPConnector {
        return this.connector;
    }

    /**
     * Get the settings instance
     */
    getSettings(): Settings {
        return this.settings;
    }
    
    /**
     * Get the memory manager agent
     */
    getMemoryManager(): any {
        return this.connector?.getMemoryManager();
    }
    
    /**
     * Get service manager instance
     */
    getServiceManager(): ServiceManager {
        return this.serviceManager;
    }
    
    /**
     * Get service container for backward compatibility
     */
    getServiceContainer(): ServiceManager {
        return this.serviceManager;
    }

    /**
     * Get current memory usage in bytes (browser API)
     */
    private getMemoryUsage(): number {
        if (typeof performance !== 'undefined' && 'memory' in performance) {
            return (performance as any).memory?.usedJSHeapSize || 0;
        }
        return 0;
    }

    /**
     * Get memory pressure level for diagnostics
     */
    private getMemoryPressureLevel(): string {
        if (typeof performance !== 'undefined' && 'memory' in performance) {
            const memory = (performance as any).memory;
            if (!memory) return 'unknown';
            
            const used = memory.usedJSHeapSize || 0;
            const limit = memory.jsHeapSizeLimit || 0;
            
            if (limit === 0) return 'unknown';
            
            const percentage = (used / limit) * 100;
            if (percentage > 90) return 'critical';
            if (percentage > 75) return 'high';
            if (percentage > 50) return 'moderate';
            return 'low';
        }
        return 'unknown';
    }
    
    async onunload() {
        try {
            // Delegate cleanup to lifecycle manager
            if (this.lifecycleManager) {
                await this.lifecycleManager.shutdown();
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}
