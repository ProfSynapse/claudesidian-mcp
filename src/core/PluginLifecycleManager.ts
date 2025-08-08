/**
 * Location: /src/core/PluginLifecycleManager.ts
 * 
 * Plugin Lifecycle Manager - Handles plugin initialization, startup, and shutdown logic
 * 
 * This service extracts complex lifecycle management from the main plugin class,
 * coordinating service initialization, background tasks, and cleanup procedures.
 * Used by main.ts to manage the plugin's lifecycle phases in a structured way.
 */

import { Plugin, Notice } from 'obsidian';
import { ServiceContainer } from './ServiceContainer';
import { Settings } from '../settings';
import { SettingsTab } from '../components/SettingsTab';
import { MCPConnector } from '../connector';
import { UpdateManager } from '../utils/UpdateManager';
import type { IVectorStore } from '../database/interfaces/IVectorStore';

export interface PluginLifecycleConfig {
    plugin: Plugin;
    app: any;
    serviceContainer: ServiceContainer;
    settings: Settings;
    connector: MCPConnector;
    manifest: any;
}

/**
 * Plugin Lifecycle Manager - coordinates plugin initialization and shutdown
 */
export class PluginLifecycleManager {
    private config: PluginLifecycleConfig;
    private settingsTab?: SettingsTab;
    private isInitialized: boolean = false;
    private startTime: number = Date.now();

    constructor(config: PluginLifecycleConfig) {
        this.config = config;
    }

    /**
     * Initialize plugin - called from onload()
     */
    async initialize(): Promise<void> {
        const startTime = Date.now();
        
        try {
            // PHASE 1: Foundation - Service container and settings already created by main.ts
            
            // PHASE 2: Register core services (no initialization yet)
            this.registerCoreServices();
            
            // PHASE 3: Initialize essential services only
            await this.initializeEssentialServices();
            
            // Plugin is now "loaded" - defer full initialization to background
            const loadTime = Date.now() - startTime;
            
            // PHASE 4: Start background initialization after onload completes
            setTimeout(() => {
                this.startBackgroundInitialization().catch(error => {
                    console.error('[PluginLifecycleManager] Background initialization failed:', error);
                });
            }, 0);
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Critical initialization failure:', error);
            this.enableFallbackMode();
        }
    }

    /**
     * Background initialization - runs after onload() completes
     */
    private async startBackgroundInitialization(): Promise<void> {
        const bgStartTime = Date.now();
        
        try {
            // Load settings first
            await this.config.settings.loadSettings();
            
            // Log data.json for debugging StateManager
            try {
                const data = await this.config.plugin.loadData();
                // Plugin data.json loaded successfully
            } catch (error) {
                console.warn('Failed to debug data.json:', error);
            }
            
            // Initialize data directories
            await this.initializeDataDirectories();
            
            // Initialize core services in proper dependency order
            await this.initializeBusinessServices();
            
            // Pre-initialize UI-critical services to avoid long loading times
            await this.preInitializeUICriticalServices();
            
            // Validate search functionality
            await this.validateSearchFunctionality();
            
            // Initialize connector with agents
            try {
                await this.config.connector.initializeAgents();
                await this.config.connector.start();
            } catch (error) {
                console.warn('[PluginLifecycleManager] MCP initialization failed:', error);
            }
            
            // Create settings tab
            await this.initializeSettingsTab();
            
            // Register all maintenance commands
            this.registerMaintenanceCommands();
            
            // Check for updates
            this.checkForUpdatesOnStartup();
            
            // Update settings tab with loaded services
            this.updateSettingsTabServices();
            
            // Mark as fully initialized
            this.isInitialized = true;
            
            const bgLoadTime = Date.now() - bgStartTime;
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Background initialization failed:', error);
        }
    }

    /**
     * Register core services with ServiceContainer
     */
    private registerCoreServices(): void {
        const { serviceContainer, plugin, settings } = this.config;
        
        // Foundation services (no dependencies)
        serviceContainer.register('eventManager', async () => {
            const { EventManager } = await import('../services/EventManager');
            return new EventManager();
        });
        
        serviceContainer.register('stateManager', async () => {
            const { ProcessedFilesStateManager } = await import('../database/services/state/ProcessedFilesStateManager');
            return new ProcessedFilesStateManager(plugin);
        });
        
        // Memory services
        serviceContainer.register('simpleMemoryService', async () => {
            const { SimpleMemoryService } = await import('../services/memory/SimpleMemoryService');
            return new SimpleMemoryService();
        });
        
        serviceContainer.register('sessionService', async () => {
            const { SessionService } = await import('../services/session/SessionService');
            const memoryService = await serviceContainer.get<any>('simpleMemoryService');
            return new SessionService(memoryService);
        }, { dependencies: ['simpleMemoryService'] });
        
        serviceContainer.register('toolCallCaptureService', async (deps) => {
            const { ToolCallCaptureService } = await import('../services/toolcall-capture/ToolCallCaptureService');
            const memoryService = deps.simpleMemoryService;
            const sessionService = deps.sessionService;
            
            // Create service with simple storage initially
            const service = new ToolCallCaptureService(memoryService, sessionService);
            
            // Enable full functionality with embeddings if services are available
            try {
                const memoryTraceService = deps.memoryTraceService;
                const embeddingService = deps.embeddingService;
                
                if (memoryTraceService && embeddingService) {
                    await service.upgrade(memoryTraceService, embeddingService);
                }
            } catch (error) {
                console.warn('[ToolCallCapture] Failed to enable full functionality:', error);
            }
            
            return service;
        }, { dependencies: ['simpleMemoryService', 'sessionService', 'memoryTraceService', 'embeddingService'] });
        
        // Vector store - CRITICAL: Single instance with proper initialization
        serviceContainer.register('vectorStore', async () => {
            const { ChromaVectorStoreModular } = await import('../database/providers/chroma/ChromaVectorStoreModular');
            
            // Get embedding configuration from settings based on actual provider
            const memorySettings = settings.settings.memory;
            if (!memorySettings?.apiProvider || !memorySettings?.providerSettings) {
                throw new Error('Memory settings not configured - cannot determine embedding dimensions');
            }
            
            const activeProvider = memorySettings.apiProvider;
            const providerSettings = memorySettings.providerSettings[activeProvider];
            
            if (!providerSettings?.dimensions) {
                throw new Error(`Embedding dimensions not configured for provider '${activeProvider}'`);
            }
            
            const embeddingConfig = {
                dimension: providerSettings.dimensions,
                model: providerSettings.model
            };
            
            // Create vectorStore with proper embedding configuration
            const vectorStore = new ChromaVectorStoreModular(plugin, {
                embedding: embeddingConfig,
                persistentPath: memorySettings.dbStoragePath,
                inMemory: false,
                cache: {
                    enabled: true,
                    maxItems: 1000,
                    ttl: 3600000
                }
            });
            
            await vectorStore.initialize();
            return vectorStore;
        });
        
        // Business services with dependencies
        serviceContainer.register('embeddingService', async (deps) => {
            const { EmbeddingService } = await import('../database/services/EmbeddingService');
            return new EmbeddingService(plugin, deps.stateManager);
        }, { dependencies: ['stateManager'] });
        
        serviceContainer.register('memoryService', async (deps) => {
            const { MemoryService } = await import('../agents/memoryManager/services/MemoryService');
            return new MemoryService(plugin, deps.vectorStore, deps.embeddingService, settings.settings.memory || {});
        }, { dependencies: ['vectorStore', 'embeddingService'] });
        
        serviceContainer.register('workspaceService', async (deps) => {
            const { WorkspaceService } = await import('../agents/memoryManager/services/WorkspaceService');
            return new WorkspaceService(plugin, deps.vectorStore, deps.embeddingService);
        }, { dependencies: ['vectorStore', 'embeddingService'] });
        
        // Memory trace service - moved from registerAdditionalServices to ensure availability
        serviceContainer.register('memoryTraceService', async (deps) => {
            const { MemoryTraceService } = await import('../database/services/memory/MemoryTraceService');
            const { VectorStoreFactory } = await import('../database/factory/VectorStoreFactory');
            
            // Create memory trace collection through factory
            const memoryTraceCollection = VectorStoreFactory.createMemoryTraceCollection(deps.vectorStore);
            
            return new MemoryTraceService(memoryTraceCollection, deps.embeddingService);
        }, { dependencies: ['vectorStore', 'embeddingService'] });
    }

    /**
     * Initialize essential services that must be ready immediately
     */
    private async initializeEssentialServices(): Promise<void> {
        try {
            // Initialize only the most critical services synchronously
            await this.config.serviceContainer.get('eventManager');
            await this.config.serviceContainer.get('stateManager');
            await this.config.serviceContainer.get('simpleMemoryService');
        } catch (error) {
            console.error('[PluginLifecycleManager] Essential service initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize business services with proper dependency resolution
     */
    private async initializeBusinessServices(): Promise<void> {
        try {
            // Initialize in dependency order to prevent multiple VectorStore instances
            const vectorStore = await this.config.serviceContainer.get('vectorStore');
            
            // Initialize dependent services sequentially to avoid circular dependency issues
            await this.config.serviceContainer.get('embeddingService');
            await this.config.serviceContainer.get('memoryService');
            await this.config.serviceContainer.get('workspaceService');
            await this.config.serviceContainer.get('memoryTraceService');
        } catch (error) {
            console.error('[PluginLifecycleManager] Business service initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize data directories asynchronously in background
     */
    private async initializeDataDirectories(): Promise<void> {
        try {
            // Use vault-relative paths for Obsidian adapter
            const pluginDir = `.obsidian/plugins/${this.config.manifest.id}`;
            const dataDir = `${pluginDir}/data`;
            const chromaDbDir = `${dataDir}/chroma-db`;
            const collectionsDir = `${chromaDbDir}/collections`;
            
            // Create directories using Obsidian's vault adapter
            const { normalizePath } = require('obsidian');
            await this.config.app.vault.adapter.mkdir(normalizePath(dataDir));
            await this.config.app.vault.adapter.mkdir(normalizePath(chromaDbDir));
            await this.config.app.vault.adapter.mkdir(normalizePath(collectionsDir));
            
            // Update settings with correct path
            if (!this.config.settings.settings.memory) {
                this.config.settings.settings.memory = this.getDefaultMemorySettings(chromaDbDir);
            } else {
                this.config.settings.settings.memory.dbStoragePath = chromaDbDir;
            }
            
            // Save settings in background
            this.config.settings.saveSettings().catch(error => {
                console.warn('[PluginLifecycleManager] Failed to save settings after directory init:', error);
            });
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Failed to initialize data directories:', error);
            // Don't throw - plugin should function without directories for now
        }
    }

    /**
     * Get default memory settings
     */
    private getDefaultMemorySettings(chromaDbDir: string) {
        return {
            dbStoragePath: chromaDbDir,
            enabled: true,
            embeddingsEnabled: true,
            apiProvider: 'openai',
            providerSettings: {
                openai: {
                    apiKey: '',
                    model: 'text-embedding-3-small',
                    dimensions: 1536
                }
            },
            maxTokensPerMonth: 1000000,
            apiRateLimitPerMinute: 500,
            chunkStrategy: 'paragraph' as 'paragraph',
            chunkSize: 512,
            chunkOverlap: 50,
            includeFrontmatter: true,
            excludePaths: ['.obsidian/**/*'],
            minContentLength: 50,
            embeddingStrategy: 'idle' as 'idle',
            idleTimeThreshold: 60000,
            autoCleanOrphaned: true,
            maxDbSize: 500,
            pruningStrategy: 'least-used' as 'least-used',
            vectorStoreType: 'file-based' as 'file-based'
        };
    }

    /**
     * Initialize settings tab asynchronously in background
     */
    private async initializeSettingsTab(): Promise<void> {
        try {
            // Get agent references - may not be available yet
            const vaultLibrarian = this.config.connector?.getVaultLibrarian();
            const memoryManager = this.config.connector?.getMemoryManager();
            
            // Get services from container
            const services: Record<string, any> = {};
            for (const serviceName of this.config.serviceContainer.getReadyServices()) {
                services[serviceName] = this.config.serviceContainer.getIfReady(serviceName);
            }
            
            // Create settings tab with current state
            this.settingsTab = new SettingsTab(
                this.config.app,
                this.config.plugin,
                this.config.settings,
                services, // Pass current services (may be empty initially)
                vaultLibrarian || undefined,
                memoryManager || undefined,
                this.config.serviceContainer as any // Pass service container for compatibility
            );
            this.config.plugin.addSettingTab(this.settingsTab);
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Settings tab initialization failed:', error);
            // Plugin should still function without settings tab
        }
    }

    /**
     * Pre-initialize UI-critical services to avoid Memory Management loading delays
     */
    private async preInitializeUICriticalServices(): Promise<void> {
        if (!this.config.serviceContainer) return;
        
        const startTime = Date.now();
        
        try {
            // Initialize services that Memory Management accordion depends on
            const uiCriticalServices = [
                'fileEmbeddingAccessService',
                'usageStatsService',
                'cacheManager'
            ];
            
            // Register additional services if not already registered
            this.registerAdditionalServices();
            
            // Initialize in parallel where possible
            await Promise.allSettled(
                uiCriticalServices.map(async (serviceName) => {
                    try {
                        const serviceStart = Date.now();
                        await this.config.serviceContainer.get(serviceName);
                        const serviceTime = Date.now() - serviceStart;
                    } catch (error) {
                        console.warn(`[PluginLifecycleManager] Failed to pre-initialize ${serviceName}:`, error);
                    }
                })
            );
            
            const totalTime = Date.now() - startTime;
            
            // Inject vector store into SimpleMemoryService for persistence
            try {
                const vectorStore = this.config.serviceContainer.getIfReady('vectorStore');
                const simpleMemoryService = this.config.serviceContainer.getIfReady<any>('simpleMemoryService');
                
                if (vectorStore && simpleMemoryService && typeof simpleMemoryService.setVectorStore === 'function') {
                    simpleMemoryService.setVectorStore(vectorStore);
                } else {
                    console.warn('[PluginLifecycleManager] ❌ Vector store or SimpleMemoryService not available for injection');
                }
            } catch (error) {
                console.error('[PluginLifecycleManager] Failed to inject vector store:', error);
            }
            
        } catch (error) {
            console.error('[PluginLifecycleManager] UI-critical services pre-initialization failed:', error);
        }
    }

    /**
     * Register additional services needed by UI components
     */
    private registerAdditionalServices(): void {
        const { serviceContainer, plugin, settings } = this.config;
        
        // Register services that weren't included in core registration
        if (!serviceContainer.has('fileEmbeddingAccessService')) {
            serviceContainer.register('fileEmbeddingAccessService', async (deps) => {
                const { FileEmbeddingAccessService } = await import('../database/services/FileEmbeddingAccessService');
                return new FileEmbeddingAccessService(plugin, deps.vectorStore);
            }, { dependencies: ['vectorStore'] });
        }
        
        if (!serviceContainer.has('usageStatsService')) {
            serviceContainer.register('usageStatsService', async (deps) => {
                const { UsageStatsService } = await import('../database/services/UsageStatsService');
                return new UsageStatsService(deps.embeddingService, deps.vectorStore, settings.settings.memory || {});
            }, { dependencies: ['embeddingService', 'vectorStore'] });
        }
        
        if (!serviceContainer.has('cacheManager')) {
            serviceContainer.register('cacheManager', async (deps) => {
                const { CacheManager } = await import('../database/services/CacheManager');
                return new CacheManager(this.config.app, deps.workspaceService, deps.memoryService);
            }, { dependencies: ['workspaceService', 'memoryService'] });
        }
    }

    /**
     * Register maintenance commands
     */
    private registerMaintenanceCommands(): void {
        const { plugin, serviceContainer } = this.config;
        
        plugin.addCommand({
            id: 'repair-collections',
            name: 'Repair vector collections',
            callback: async () => {
                try {
                    const notice = new Notice('Repairing vector collections...', 0);
                    
                    const vectorStore = await this.getService<IVectorStore>('vectorStore', 15000);
                    if (!vectorStore) {
                        notice.setMessage('Vector store not available or failed to initialize');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    if (typeof (vectorStore as any).repairCollections !== 'function') {
                        notice.setMessage('Repair function not available');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const result = await (vectorStore as any).repairCollections();
                    
                    if (result.success) {
                        notice.setMessage(`Repair successful: ${result.repairedCollections.length} collections restored`);
                    } else {
                        notice.setMessage(`Repair completed with issues: ${result.errors.length} errors`);
                        console.error('Collection repair errors:', result.errors);
                    }
                    
                    setTimeout(() => notice.hide(), 5000);
                } catch (error) {
                    new Notice(`Repair failed: ${(error as Error).message}`);
                    console.error('Collection repair error:', error);
                }
            }
        });
        
        plugin.addCommand({
            id: 'cleanup-obsolete-collections',
            name: 'Clean up obsolete collections',
            callback: async () => {
                try {
                    const notice = new Notice('Cleaning up obsolete collections...', 0);
                    
                    const vectorStore = await this.getService<IVectorStore>('vectorStore', 15000);
                    if (!vectorStore) {
                        notice.setMessage('Vector store not available or failed to initialize');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    // Access the collection manager through the vector store
                    const collectionManager = (vectorStore as any).collectionManager;
                    if (!collectionManager || typeof collectionManager.cleanupObsoleteCollections !== 'function') {
                        notice.setMessage('Collection cleanup not available');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const result = await collectionManager.cleanupObsoleteCollections();
                    
                    if (result.cleaned.length > 0) {
                        notice.setMessage(`Cleaned up ${result.cleaned.length} collections: ${result.cleaned.join(', ')}`);
                    } else {
                        notice.setMessage('No obsolete collections found to clean up');
                    }
                    
                    if (result.errors.length > 0) {
                        console.warn('Collection cleanup errors:', result.errors);
                    }
                    
                    setTimeout(() => notice.hide(), 8000);
                } catch (error) {
                    new Notice(`Cleanup failed: ${(error as Error).message}`);
                    console.error('Collection cleanup error:', error);
                }
            }
        });
        
        plugin.addCommand({
            id: 'check-vector-storage',
            name: 'Check vector storage status',
            callback: async () => {
                try {
                    const notice = new Notice('Checking vector storage...', 0);
                    
                    const vectorStore = await this.getService<IVectorStore>('vectorStore', 15000);
                    if (!vectorStore) {
                        notice.setMessage('Vector store not available or failed to initialize');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const diagnostics = await vectorStore.getDiagnostics();
                    
                    const message = [
                        `Storage mode: ${diagnostics.storageMode}`,
                        `Path: ${diagnostics.persistentPath}`,
                        `Collections: ${diagnostics.totalCollections}`,
                        `Directory exists: ${diagnostics.dataDirectoryExists ? 'Yes' : 'No'}`,
                        `Permissions OK: ${diagnostics.filePermissionsOk ? 'Yes' : 'No'}`
                    ].join('\n');
                    
                    notice.setMessage(message);
                    
                    setTimeout(() => notice.hide(), 10000);
                } catch (error) {
                    new Notice(`Diagnostics failed: ${(error as Error).message}`);
                    console.error('Diagnostics error:', error);
                }
            }
        });
        
        plugin.addCommand({
            id: 'check-service-readiness',
            name: 'Check service readiness status',
            callback: async () => {
                try {
                    const notice = new Notice('Checking service readiness...', 0);
                    
                    if (!serviceContainer) {
                        notice.setMessage('Service container not available');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const stats = serviceContainer.getStats();
                    const metadata = serviceContainer.getAllServiceMetadata();
                    
                    const readyServices = Object.values(metadata).filter(m => m.initialized).length;
                    const totalServices = Object.keys(metadata).length;
                    
                    const message = [
                        `Services: ${readyServices}/${totalServices} ready`,
                        `Registered: ${stats.registered}`,
                        `Instantiated: ${stats.instantiated}`,
                        `Singletons: ${stats.singletons}`,
                        `Plugin initialized: ${this.isInitialized ? 'Yes' : 'No'}`
                    ].join('\n');
                    
                    notice.setMessage(message);
                    
                    setTimeout(() => notice.hide(), 8000);
                } catch (error) {
                    new Notice(`Readiness check failed: ${(error as Error).message}`);
                    console.error('Service readiness check error:', error);
                }
            }
        });
    }

    /**
     * Check for updates on startup in background
     */
    private async checkForUpdatesOnStartup(): Promise<void> {
        // Run in background to avoid blocking startup
        setTimeout(async () => {
            try {
                const { settings } = this.config;
                const lastCheck = settings.settings.lastUpdateCheckDate;
                if (lastCheck) {
                    const lastCheckTime = new Date(lastCheck);
                    const now = new Date();
                    const daysDiff = (now.getTime() - lastCheckTime.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysDiff < 1) {
                        return;
                    }
                }

                const updateManager = new UpdateManager(this.config.plugin);
                const hasUpdate = await updateManager.checkForUpdate();
                
                settings.settings.lastUpdateCheckDate = new Date().toISOString();
                
                if (hasUpdate) {
                    const release = await (updateManager as any).fetchLatestRelease();
                    const availableVersion = release.tag_name.replace('v', '');
                    
                    settings.settings.availableUpdateVersion = availableVersion;
                    
                    new Notice(`Plugin update available: v${availableVersion}. Check settings to update.`, 8000);
                } else {
                    settings.settings.availableUpdateVersion = undefined;
                }
                
                await settings.saveSettings();
                
            } catch (error) {
                console.error('Failed to check for updates:', error);
            }
        }, 2000); // 2 second delay
    }

    /**
     * Validate search functionality - ensure core services are available
     */
    private async validateSearchFunctionality(): Promise<void> {
        try {
            // Test 1: Validate vectorStore service is available (ChromaDB)
            const vectorStore = await this.getService<IVectorStore>('vectorStore', 5000);
            if (vectorStore) {
                // Test basic collection operations
                try {
                    const collections = await vectorStore.listCollections();
                } catch (collectionError) {
                    console.warn('[VALIDATION] Collection access error (may be normal during startup):', collectionError);
                }
            } else {
                console.warn('[VALIDATION] ⚠️ VectorStore service not available');
            }
            
            // Test 2: Validate core services are available
            const serviceContainer = this.config.serviceContainer;
            if (serviceContainer) {
                const metadata = serviceContainer.getAllServiceMetadata();
                const serviceNames = Object.keys(metadata);
                
                const coreServices = ['vectorStore', 'embeddingService', 'workspaceService', 'memoryService'];
                const availableCore = coreServices.filter(service => serviceNames.includes(service));
            }
            
        } catch (error) {
            console.warn('[VALIDATION] Service validation error:', error);
        }
    }

    /**
     * Update settings tab with available services (non-blocking)
     */
    private updateSettingsTabServices(): void {
        if (this.settingsTab) {
            const services: Record<string, any> = {};
            for (const serviceName of this.config.serviceContainer.getReadyServices()) {
                services[serviceName] = this.config.serviceContainer.getIfReady(serviceName);
            }
            this.settingsTab.updateServices(services);
        }
    }

    /**
     * Enable fallback mode with minimal functionality
     */
    private enableFallbackMode(): void {
        try {
            this.config.plugin.addCommand({
                id: 'troubleshoot-services',
                name: 'Troubleshoot service initialization',
                callback: () => {
                    const stats = this.config.serviceContainer?.getStats() || { registered: 0, instantiated: 0 };
                    const message = `Service initialization failed. Registered: ${stats.registered}, Ready: ${stats.instantiated}`;
                    new Notice(message, 10000);
                    console.log('[PluginLifecycleManager] Service troubleshooting:', {
                        isInitialized: this.isInitialized,
                        containerStats: stats,
                        registeredServices: this.config.serviceContainer?.getRegisteredServices() || []
                    });
                }
            });
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Fallback mode setup failed:', error);
        }
    }

    /**
     * Get service helper method
     */
    private async getService<T>(name: string, timeoutMs: number = 10000): Promise<T | null> {
        if (!this.config.serviceContainer) {
            return null;
        }
        
        // If already ready, return immediately
        if (this.config.serviceContainer.isReady(name)) {
            return this.config.serviceContainer.getIfReady<T>(name);
        }
        
        // Otherwise try to get it (will initialize if needed)
        try {
            return await this.config.serviceContainer.get<T>(name);
        } catch (error) {
            console.warn(`[PluginLifecycleManager] Failed to get service '${name}':`, error);
            return null;
        }
    }

    /**
     * Reload configuration for all services after settings change
     */
    reloadConfiguration(): void {
        if (this.config.serviceContainer?.isReady('fileEventManager')) {
            const fileEventManager = this.config.serviceContainer.getIfReady('fileEventManager');
            if (fileEventManager && typeof (fileEventManager as any).reloadConfiguration === 'function') {
                try {
                    (fileEventManager as any).reloadConfiguration();
                } catch (error) {
                    console.warn('Error reloading file event manager configuration:', error);
                }
            }
        }
    }

    /**
     * Get initialization status
     */
    getInitializationStatus(): { isInitialized: boolean; startTime: number } {
        return {
            isInitialized: this.isInitialized,
            startTime: this.startTime
        };
    }

    /**
     * Shutdown and cleanup
     */
    async shutdown(): Promise<void> {
        try {
            // Save processed files state before cleanup
            const stateManager = this.config.serviceContainer?.getIfReady('stateManager');
            if (stateManager && typeof (stateManager as any).saveState === 'function') {
                await (stateManager as any).saveState();
            }
            
            // Cleanup settings tab accordions
            if (this.settingsTab && typeof (this.settingsTab as any).cleanup === 'function') {
                (this.settingsTab as any).cleanup();
            }
            
            // Cleanup service container (handles all service cleanup)
            if (this.config.serviceContainer) {
                this.config.serviceContainer.clear();
            }
            
            // Stop the MCP connector
            if (this.config.connector) {
                await this.config.connector.stop();
            }
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Error during cleanup:', error);
        }
    }
}