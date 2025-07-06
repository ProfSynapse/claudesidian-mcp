import { Plugin, Notice } from 'obsidian';
import { UpdateManager } from './utils/UpdateManager';
import { MCPConnector } from './connector';
import { Settings } from './settings';
import { SettingsTab } from './components/SettingsTab';
import { ConfigModal } from './components/ConfigModal';
import { LazyServiceManager } from './services/LazyServiceManager';

// Type imports for service interfaces
import type { EmbeddingService } from './database/services/EmbeddingService';
import type { HnswSearchService } from './database/providers/chroma/services/HnswSearchService';
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
    
    // Legacy service properties - now proxied through lazy service manager
    public get vectorStore(): IVectorStore { return this.serviceManager?.get('vectorStore') as any; }
    public get embeddingService(): EmbeddingService { return this.serviceManager?.get('embeddingService') as any; }
    public get hnswSearchService(): HnswSearchService { return this.serviceManager?.get('hnswSearchService') as any; }
    public get fileEmbeddingAccessService(): FileEmbeddingAccessService { return this.serviceManager?.get('fileEmbeddingAccessService') as any; }
    public get directCollectionService(): DirectCollectionService { return this.serviceManager?.get('directCollectionService') as any; }
    public get workspaceService(): WorkspaceService { return this.serviceManager?.get('workspaceService') as any; }
    public get memoryService(): MemoryService { return this.serviceManager?.get('memoryService') as any; }
    public get fileEventManager(): FileEventManagerModular { return this.serviceManager?.get('fileEventManager') as any; }
    public get eventManager(): EventManager { return this.serviceManager?.get('eventManager') as any; }
    public get usageStatsService(): UsageStatsService { return this.serviceManager?.get('usageStatsService') as any; }
    public get cacheManager(): CacheManager { return this.serviceManager?.get('cacheManager') as any; }
    
    // Service registry - now returns initialized services from lazy manager
    public get services(): Record<string, any> {
        return this.serviceManager?.getAllInitialized() || {};
    }
    
    async onload() {
        const startTime = Date.now();
        console.log('[ClaudesidianPlugin] Starting optimized plugin initialization...');
        
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
        
        // Initialize connector and agents
        this.connector = new MCPConnector(this.app, this);
        await this.connector.initializeAgents();
        await this.connector.start();
        
        // Add settings tab
        await this.initializeSettingsTab();
        
        // Register maintenance commands
        this.registerMaintenanceCommands();
        
        // Check for updates in background
        this.checkForUpdatesOnStartup();
        
        const duration = Date.now() - startTime;
        console.log(`[ClaudesidianPlugin] ✓ Plugin initialized (${duration}ms) - services will load on demand`);
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
            
            // Create directories asynchronously
            await fs.mkdir(dataDir, { recursive: true });
            await fs.mkdir(chromaDbDir, { recursive: true });
            await fs.mkdir(collectionsDir, { recursive: true });
            
            // Update settings with correct path
            if (!this.settings.settings.memory) {
                this.settings.settings.memory = this.getDefaultMemorySettings(chromaDbDir);
            } else {
                this.settings.settings.memory.dbStoragePath = chromaDbDir;
            }
            
            await this.settings.saveSettings();
            console.log('[ClaudesidianPlugin] Data directories initialized');
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
            embeddingStrategy: 'manual' as 'manual',
            idleTimeThreshold: 60000,
            batchSize: 10,
            concurrentRequests: 3,
            processingDelay: 1000,
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
     * Initialize settings tab
     */
    private async initializeSettingsTab(): Promise<void> {
        // Get agent references for settings tab - these will be available since agents are initialized
        const vaultLibrarian = this.connector.getVaultLibrarian();
        const memoryManager = this.connector.getMemoryManager();
        
        this.settingsTab = new SettingsTab(
            this.app,
            this,
            this.settings,
            this.services,
            vaultLibrarian || undefined,
            memoryManager || undefined
        );
        this.addSettingTab(this.settingsTab);
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
                    
                    const vectorStore = await this.serviceManager.get<IVectorStore>('vectorStore');
                    if (!vectorStore) {
                        notice.setMessage('Vector store not available');
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
                    
                    const vectorStore = await this.serviceManager.get<IVectorStore>('vectorStore');
                    if (!vectorStore) {
                        notice.setMessage('Vector store not available');
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
                    console.log('Vector storage diagnostics:', diagnostics);
                    
                    setTimeout(() => notice.hide(), 10000);
                } catch (error) {
                    new Notice(`Diagnostics failed: ${(error as Error).message}`);
                    console.error('Diagnostics error:', error);
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

                console.log('Checking for updates...');
                const updateManager = new UpdateManager(this);
                const hasUpdate = await updateManager.checkForUpdate();
                
                this.settings.settings.lastUpdateCheckDate = new Date().toISOString();
                
                if (hasUpdate) {
                    const release = await (updateManager as any).fetchLatestRelease();
                    const availableVersion = release.tag_name.replace('v', '');
                    
                    this.settings.settings.availableUpdateVersion = availableVersion;
                    console.log(`Update available: ${availableVersion}`);
                    
                    new Notice(`Plugin update available: v${availableVersion}. Check settings to update.`, 8000);
                } else {
                    this.settings.settings.availableUpdateVersion = undefined;
                    console.log('Plugin is up to date');
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
        console.log('[ClaudesidianPlugin] Reloading configuration...');
        
        if (this.serviceManager?.isInitialized('fileEventManager')) {
            this.serviceManager.get('fileEventManager').then(fileEventManager => {
                if (fileEventManager && typeof (fileEventManager as any).reloadConfiguration === 'function') {
                    (fileEventManager as any).reloadConfiguration();
                }
            }).catch(error => {
                console.warn('Error reloading file event manager configuration:', error);
            });
        }
        
        console.log('[ClaudesidianPlugin] Configuration reload complete');
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
        console.log('[ClaudesidianPlugin] Starting cleanup...');
        
        try {
            // Cleanup service manager (handles all service cleanup)
            if (this.serviceManager) {
                await this.serviceManager.cleanup();
            }
            
            // Stop the MCP connector
            if (this.connector) {
                await this.connector.stop();
            }
            
            console.log('[ClaudesidianPlugin] Cleanup complete');
        } catch (error) {
            console.error('[ClaudesidianPlugin] Error during cleanup:', error);
        }
    }
}
