import { Vault, App } from 'obsidian';
import { EntityCache } from './EntityCache';
import { VaultFileIndex } from './VaultFileIndex';
import { WorkspaceService } from './WorkspaceService';
import { MemoryService } from './MemoryService';
import { PrefetchManager } from './PrefetchManager';

export interface CacheManagerOptions {
    enableEntityCache?: boolean;
    enableFileIndex?: boolean;
    enablePrefetch?: boolean;
    entityCacheTTL?: number;
    maxCacheSize?: number;
}

export class CacheManager {
    private vault: Vault;
    private entityCache: EntityCache | null = null;
    private vaultFileIndex: VaultFileIndex | null = null;
    private prefetchManager: PrefetchManager | null = null;
    private isInitialized = false;

    constructor(
        private app: App,
        private workspaceService: WorkspaceService,
        private memoryService: MemoryService,
        private options: CacheManagerOptions = {}
    ) {
        this.vault = app.vault;
        // Default options
        this.options.enableEntityCache = options.enableEntityCache ?? true;
        this.options.enableFileIndex = options.enableFileIndex ?? true;
        this.options.enablePrefetch = options.enablePrefetch ?? true;
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        console.log('Initializing CacheManager...');

        // Initialize EntityCache
        if (this.options.enableEntityCache) {
            this.entityCache = new EntityCache(
                this.vault,
                this.workspaceService,
                this.memoryService,
                {
                    ttl: this.options.entityCacheTTL,
                    maxSize: this.options.maxCacheSize
                }
            );
            console.log('EntityCache initialized');
        }

        // Initialize VaultFileIndex
        if (this.options.enableFileIndex) {
            this.vaultFileIndex = new VaultFileIndex(this.vault, this.app);
            await this.vaultFileIndex.initialize();
            console.log('VaultFileIndex initialized');

            // Set up file event listeners
            this.setupFileEventListeners();
        }

        // Initialize PrefetchManager
        if (this.options.enablePrefetch && this.entityCache) {
            this.prefetchManager = new PrefetchManager(
                this,
                this.workspaceService,
                this.memoryService
            );
            console.log('PrefetchManager initialized');
            
            // Set up prefetch listeners
            this.setupPrefetchListeners();
        }

        this.isInitialized = true;
        console.log('CacheManager initialization complete');
    }

    private setupFileEventListeners(): void {
        if (!this.vaultFileIndex) return;

        // Listen for file events from Obsidian
        this.vault.on('create', async (file) => {
            if ('extension' in file && (file.extension === 'md' || file.extension === 'canvas')) {
                await this.vaultFileIndex!.updateFile(file as any);
            }
        });

        this.vault.on('delete', (file) => {
            this.vaultFileIndex!.removeFile(file.path);
            // Also invalidate entity cache for files
            if (this.entityCache) {
                this.entityCache.invalidateFile(file.path);
            }
        });

        this.vault.on('rename', async (file, oldPath) => {
            if ('extension' in file && (file.extension === 'md' || file.extension === 'canvas')) {
                await this.vaultFileIndex!.renameFile(oldPath, file.path);
            }
        });

        this.vault.on('modify', async (file) => {
            if ('extension' in file && (file.extension === 'md' || file.extension === 'canvas')) {
                await this.vaultFileIndex!.updateFile(file as any);
            }
        });
    }

    private setupPrefetchListeners(): void {
        if (!this.entityCache || !this.prefetchManager) return;

        // Listen for entity cache events to trigger prefetching
        this.entityCache.on('workspace:preloaded', (workspaceId: string) => {
            this.prefetchManager!.onWorkspaceLoaded(workspaceId);
        });

        this.entityCache.on('session:preloaded', (sessionId: string) => {
            this.prefetchManager!.onSessionLoaded(sessionId);
        });

        this.entityCache.on('state:preloaded', (stateId: string) => {
            this.prefetchManager!.onStateLoaded(stateId);
        });
    }

    // Entity cache methods
    async preloadWorkspace(workspaceId: string): Promise<void> {
        if (!this.entityCache) {
            throw new Error('EntityCache not initialized');
        }
        await this.entityCache.preloadWorkspace(workspaceId);
    }

    async preloadSession(sessionId: string): Promise<void> {
        if (!this.entityCache) {
            throw new Error('EntityCache not initialized');
        }
        await this.entityCache.preloadSession(sessionId);
    }

    async preloadState(stateId: string): Promise<void> {
        if (!this.entityCache) {
            throw new Error('EntityCache not initialized');
        }
        await this.entityCache.preloadState(stateId);
    }

    getCachedWorkspace(workspaceId: string) {
        return this.entityCache?.getWorkspace(workspaceId);
    }

    getCachedSession(sessionId: string) {
        return this.entityCache?.getSession(sessionId);
    }

    getCachedState(stateId: string) {
        return this.entityCache?.getState(stateId);
    }

    // File index methods
    getFileMetadata(filePath: string) {
        return this.vaultFileIndex?.getFile(filePath);
    }

    getKeyFiles() {
        return this.vaultFileIndex?.getKeyFiles() || [];
    }

    getRecentFiles(limit?: number, folderPath?: string) {
        return this.vaultFileIndex?.getRecentFiles(limit, folderPath) || [];
    }

    getFilesInFolder(folderPath: string, recursive = false) {
        return this.vaultFileIndex?.getFilesInFolder(folderPath, recursive) || [];
    }

    searchFiles(predicate: (file: any) => boolean) {
        return this.vaultFileIndex?.searchFiles(predicate) || [];
    }

    async getFilesWithMetadata(filePaths: string[]) {
        return this.vaultFileIndex?.getFilesWithMetadata(filePaths) || [];
    }

    // Cache warming
    async warmCache(workspaceId?: string): Promise<void> {
        console.log('Warming cache...');

        // If a specific workspace is provided, preload it
        if (workspaceId) {
            await this.preloadWorkspace(workspaceId);
        }

        // Preload key files metadata
        if (this.vaultFileIndex) {
            const keyFiles = this.getKeyFiles();
            const keyFilePaths = keyFiles.map((f: any) => f.path);
            await this.vaultFileIndex.warmup(keyFilePaths);
        }

        console.log('Cache warming complete');
    }

    // Cache management
    invalidateWorkspace(workspaceId: string): void {
        this.entityCache?.invalidateWorkspace(workspaceId);
    }

    invalidateSession(sessionId: string): void {
        this.entityCache?.invalidateSession(sessionId);
    }

    invalidateState(stateId: string): void {
        this.entityCache?.invalidateState(stateId);
    }

    clearCache(): void {
        this.entityCache?.clear();
        this.vaultFileIndex?.clear();
    }

    // Stats
    getStats() {
        return {
            entityCache: this.entityCache ? {
                workspaces: this.entityCache['workspaceCache'].size,
                sessions: this.entityCache['sessionCache'].size,
                states: this.entityCache['stateCache'].size,
                files: this.entityCache['fileMetadataCache'].size
            } : null,
            fileIndex: this.vaultFileIndex?.getStats() || null,
            prefetch: this.prefetchManager?.getStats() || null
        };
    }

    // Check if caches are ready
    isReady(): boolean {
        const entityCacheReady = !this.options.enableEntityCache || !!this.entityCache;
        const fileIndexReady = !this.options.enableFileIndex || this.vaultFileIndex?.isReady() || false;
        return this.isInitialized && entityCacheReady && fileIndexReady;
    }

    // Cleanup resources
    cleanup(): void {
        console.log('Cleaning up CacheManager...');
        
        // Cleanup VaultFileIndex and its metadata cache events
        if (this.vaultFileIndex) {
            this.vaultFileIndex.cleanup();
            this.vaultFileIndex = null;
        }

        // Clear entity cache
        if (this.entityCache) {
            this.entityCache.clear();
            this.entityCache = null;
        }

        // Reset prefetch manager
        if (this.prefetchManager) {
            this.prefetchManager = null;
        }

        this.isInitialized = false;
        console.log('CacheManager cleanup complete');
    }
}