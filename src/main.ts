import { Plugin, Notice } from 'obsidian';
import { UpdateManager } from './utils/UpdateManager';
import { MCPConnector } from './connector';
import { Settings } from './settings';
import { SettingsTab } from './components/SettingsTab';
import { LazyServiceManager } from './services/LazyServiceManager';
import { logger } from './utils/logger';

// Type imports for service interfaces
import type { EmbeddingService } from './database/services/EmbeddingService';
import type { HnswSearchService } from './database/services/hnsw/HnswSearchService';
import type { FileEmbeddingAccessService } from './database/services/FileEmbeddingAccessService';
import type { DirectCollectionService } from './database/services/DirectCollectionService';
import type { IVectorStore } from './database/interfaces/IVectorStore';
import type { WorkspaceService } from './database/services/WorkspaceService';
import type { MemoryService } from './database/services/MemoryService';
import type { EventManager } from './services/EventManager';
import type { FileEventManagerModular } from './services/file-events/FileEventManagerModular';
import type { UsageStatsService } from './database/services/UsageStatsService';
import type { CacheManager } from './database/services/CacheManager';

export default class ClaudesidianPlugin extends Plugin {
    public settings!: Settings;
    private connector!: MCPConnector;
    private settingsTab!: SettingsTab;
    private serviceManager!: LazyServiceManager;
    private startTime: number = Date.now();
    
    // Legacy service properties - now proxied through lazy service manager with graceful fallbacks
    public get vectorStore(): IVectorStore | null { 
        return this.serviceManager?.getIfReady<IVectorStore>('vectorStore') || null; 
    }
    public get embeddingService(): EmbeddingService | null { 
        return this.serviceManager?.getIfReady<EmbeddingService>('embeddingService') || null; 
    }
    public get hnswSearchService(): HnswSearchService | null { 
        return this.serviceManager?.getIfReady<HnswSearchService>('hnswSearchService') || null; 
    }
    public get fileEmbeddingAccessService(): FileEmbeddingAccessService | null { 
        return this.serviceManager?.getIfReady<FileEmbeddingAccessService>('fileEmbeddingAccessService') || null; 
    }
    public get directCollectionService(): DirectCollectionService | null { 
        return this.serviceManager?.getIfReady<DirectCollectionService>('directCollectionService') || null; 
    }
    public get workspaceService(): WorkspaceService | null { 
        return this.serviceManager?.getIfReady<WorkspaceService>('workspaceService') || null; 
    }
    public get memoryService(): MemoryService | null { 
        return this.serviceManager?.getIfReady<MemoryService>('memoryService') || null; 
    }
    public get fileEventManager(): FileEventManagerModular | null { 
        return this.serviceManager?.getIfReady<FileEventManagerModular>('fileEventManager') || null; 
    }
    public get eventManager(): EventManager | null { 
        return this.serviceManager?.getIfReady<EventManager>('eventManager') || null; 
    }
    public get usageStatsService(): UsageStatsService | null { 
        return this.serviceManager?.getIfReady<UsageStatsService>('usageStatsService') || null; 
    }
    public get cacheManager(): CacheManager | null { 
        return this.serviceManager?.getIfReady<CacheManager>('cacheManager') || null; 
    }
    
    /**
     * Get a service asynchronously, waiting for it to be ready if needed
     */
    public async getService<T>(name: string, timeoutMs: number = 10000): Promise<T | null> {
        if (!this.serviceManager) {
            return null;
        }
        
        // If already ready, return immediately
        if (this.serviceManager.isReady(name)) {
            return this.serviceManager.getIfReady<T>(name);
        }
        
        // Otherwise try to get it (will initialize if needed)
        try {
            return await this.serviceManager.get<T>(name);
        } catch (error) {
            console.warn(`[ClaudesidianPlugin] Failed to get service '${name}':`, error);
            return null;
        }
    }
    
    // Service registry - now returns initialized services from lazy manager
    public get services(): Record<string, any> {
        return this.serviceManager?.getAllInitialized() || {};
    }
    
    async onload() {
        const startTime = Date.now();
        
        // Initialize settings first
        this.settings = new Settings(this);
        await this.settings.loadSettings();
        
        // Initialize data directories asynchronously
        this.initializeDataDirectories().catch(error => {
            console.warn('[ClaudesidianPlugin] Failed to initialize data directories:', error);
        });
        
        // Initialize lazy service manager
        this.serviceManager = new LazyServiceManager(this.app, this);
        
        // Start immediate services only
        await this.serviceManager.start();
        
        // Initialize connector only (agents will be loaded in background)
        this.connector = new MCPConnector(this.app, this);
        await this.connector.start();
        
        // Add settings tab
        await this.initializeSettingsTab();
        
        // Register maintenance commands
        this.registerMaintenanceCommands();
        
        // Check for updates in background
        this.checkForUpdatesOnStartup();
        
    }
    
    /**
     * Initialize data directories asynchronously
     */
    private async initializeDataDirectories(): Promise<void> {
        const fs = require('fs').promises;
        const path = require('path');
        
        try {
            let basePath;
            if (this.app.vault.adapter instanceof require('obsidian').FileSystemAdapter) {
                basePath = (this.app.vault.adapter as any).getBasePath();
            } else {
                throw new Error('FileSystemAdapter not available');
            }
            
            const pluginDir = path.join(basePath, '.obsidian', 'plugins', this.manifest.id);
            const dataDir = path.join(pluginDir, 'data');
            const chromaDbDir = path.join(dataDir, 'chroma-db');
            const collectionsDir = path.join(chromaDbDir, 'collections');
            const hnswIndexesDir = path.join(chromaDbDir, 'hnsw-indexes');
            
            // Create directories asynchronously
            await fs.mkdir(dataDir, { recursive: true });
            await fs.mkdir(chromaDbDir, { recursive: true });
            await fs.mkdir(collectionsDir, { recursive: true });
            await fs.mkdir(hnswIndexesDir, { recursive: true });
            
            // Update settings with correct path
            // ChromaDB client adds /collections automatically, so use base directory for ChromaDB
            // HNSW service will use collectionsDir directly for consistency
            if (!this.settings.settings.memory) {
                this.settings.settings.memory = this.getDefaultMemorySettings(chromaDbDir);
            } else {
                this.settings.settings.memory.dbStoragePath = chromaDbDir;
            }
            
            await this.settings.saveSettings();
        } catch (error) {
            console.error('[ClaudesidianPlugin] Failed to initialize data directories:', error);
            throw error;
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
            defaultResultLimit: 10,
            includeNeighbors: true,
            graphBoostFactor: 0.3,
            backlinksEnabled: true,
            useFilters: true,
            defaultThreshold: 0.7,
            semanticThreshold: 0.5,
            vectorStoreType: 'file-based' as 'file-based'
        };
    }
    
    /**
     * Initialize settings tab immediately without waiting for background services
     * Services will be loaded asynchronously and UI will update when ready
     */
    private async initializeSettingsTab(): Promise<void> {
        logger.systemLog('[STARTUP] Creating Settings UI immediately, services will load in background...', 'ClaudesidianPlugin');
        
        // Get agent references for settings tab - these will be available since agents are initialized
        const vaultLibrarian = this.connector.getVaultLibrarian();
        const memoryManager = this.connector.getMemoryManager();
        
        // Create settings tab with service manager for async loading
        this.settingsTab = new SettingsTab(
            this.app,
            this,
            this.settings,
            this.services, // Pass current services (may be empty initially)
            vaultLibrarian || undefined,
            memoryManager || undefined
        );
        this.addSettingTab(this.settingsTab);
        
        // Load services in background and update UI when ready
        this.loadServicesInBackground();
    }
    
    /**
     * Monitor services as they become available in background and update Settings UI
     */
    private async loadServicesInBackground(): Promise<void> {
        // Set up a polling mechanism to check for service availability
        // This doesn't force loading, just checks what's already available
        const checkServicesInterval = setInterval(() => {
            const availableServices = this.services;
            
            // Check if we have new services that weren't available before
            const serviceNames = Object.keys(availableServices);
            if (serviceNames.length > 0) {
                logger.systemLog(`[BACKGROUND] Services available: ${serviceNames.join(', ')}`, 'ClaudesidianPlugin');
                
                // Update settings tab with any newly available services
                if (this.settingsTab) {
                    this.settingsTab.updateServices(availableServices);
                }
            }
            
            // Stop checking once we have all expected services or after 30 seconds
            if (availableServices.hnswSearchService || 
                Date.now() - this.startTime > 30000) {
                clearInterval(checkServicesInterval);
                if (availableServices.hnswSearchService) {
                    logger.systemLog('[BACKGROUND] All services loaded, Settings UI fully ready', 'ClaudesidianPlugin');
                }
            }
        }, 500); // Check every 500ms
    }
    
    /**
     * Register maintenance commands
     */
    private registerMaintenanceCommands(): void {
        this.addCommand({
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
        
        this.addCommand({
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
        
        this.addCommand({
            id: 'check-service-readiness',
            name: 'Check service readiness status',
            callback: async () => {
                try {
                    const notice = new Notice('Checking service readiness...', 0);
                    
                    if (!this.serviceManager) {
                        notice.setMessage('Service manager not available');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const readinessStatus = this.serviceManager.getReadinessStatus();
                    const stageStatus = {
                        immediate: this.serviceManager.isStageReady(1),
                        backgroundFast: this.serviceManager.isStageReady(2),
                        backgroundSlow: this.serviceManager.isStageReady(3),
                        onDemand: this.serviceManager.isStageReady(4)
                    };
                    
                    const readyServices = Object.values(readinessStatus).filter(s => s.ready).length;
                    const totalServices = Object.keys(readinessStatus).length;
                    
                    const message = [
                        `Services: ${readyServices}/${totalServices} ready`,
                        `Stage 1 (Immediate): ${stageStatus.immediate ? 'Ready' : 'Loading'}`,
                        `Stage 2 (Background Fast): ${stageStatus.backgroundFast ? 'Ready' : 'Loading'}`,
                        `Stage 3 (Background Slow): ${stageStatus.backgroundSlow ? 'Ready' : 'Loading'}`,
                        `Stage 4 (On-Demand): ${stageStatus.onDemand ? 'Ready' : 'Pending'}`
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
                const lastCheck = this.settings.settings.lastUpdateCheckDate;
                if (lastCheck) {
                    const lastCheckTime = new Date(lastCheck);
                    const now = new Date();
                    const daysDiff = (now.getTime() - lastCheckTime.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysDiff < 1) {
                        return;
                    }
                }

                const updateManager = new UpdateManager(this);
                const hasUpdate = await updateManager.checkForUpdate();
                
                this.settings.settings.lastUpdateCheckDate = new Date().toISOString();
                
                if (hasUpdate) {
                    const release = await (updateManager as any).fetchLatestRelease();
                    const availableVersion = release.tag_name.replace('v', '');
                    
                    this.settings.settings.availableUpdateVersion = availableVersion;
                    
                    new Notice(`Plugin update available: v${availableVersion}. Check settings to update.`, 8000);
                } else {
                    this.settings.settings.availableUpdateVersion = undefined;
                }
                
                await this.settings.saveSettings();
                
            } catch (error) {
                console.error('Failed to check for updates:', error);
            }
        }, 2000); // 2 second delay
    }
    
    /**
     * Reload configuration for all services after settings change
     */
    reloadConfiguration(): void {
        
        if (this.serviceManager?.isReady('fileEventManager')) {
            const fileEventManager = this.serviceManager.getIfReady('fileEventManager');
            if (fileEventManager && typeof (fileEventManager as any).reloadConfiguration === 'function') {
                try {
                    (fileEventManager as any).reloadConfiguration();
                } catch (error) {
                    console.warn('Error reloading file event manager configuration:', error);
                }
            }
        } else {
        }
        
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
    getServiceManager(): LazyServiceManager {
        return this.serviceManager;
    }
    
    async onunload() {
        
        try {
            // Cleanup service manager (handles all service cleanup)
            if (this.serviceManager) {
                await this.serviceManager.cleanup();
            }
            
            // Stop the MCP connector
            if (this.connector) {
                await this.connector.stop();
            }
            
        } catch (error) {
            console.error('[ClaudesidianPlugin] Error during cleanup:', error);
        }
    }
}
