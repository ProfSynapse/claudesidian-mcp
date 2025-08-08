import { App, TAbstractFile, TFile } from 'obsidian';
import { IFileMonitor } from '../interfaces/IFileEventServices';
import { ContentCache } from '../../../database/utils/ContentCache';
import { ContextualEmbeddingManager } from '../../../database/services/indexing/contextual/ContextualEmbeddingManager';

export class FileMonitor implements IFileMonitor {
    private isSystemOp = false;
    private vaultIsReady = false;
    private vaultReadyTimestamp = 0;
    private startupFileEventCount = 0;
    private fileModificationTimes: Map<string, number> = new Map();
    private lastEmbeddingUpdateTimes: Map<string, number> = new Map();
    private contentCache: ContentCache;
    private contextualEmbeddingManager?: ContextualEmbeddingManager;

    constructor(private app: App) {
        this.contentCache = new ContentCache();
        this.initializeVaultReadiness();
    }

    startMonitoring(): void {
        // Initialize vault readiness tracking
        this.markVaultAsReady();
    }

    stopMonitoring(): void {
        // Cleanup if needed
        this.vaultIsReady = false;
    }

    /**
     * Set the contextual embedding manager for file tracking integration
     * @param manager ContextualEmbeddingManager instance
     */
    setContextualEmbeddingManager(manager: ContextualEmbeddingManager): void {
        this.contextualEmbeddingManager = manager;
        console.log('[FileMonitor] Contextual embedding manager connected for file event tracking');
    }

    /**
     * Handle file open events - track in recent files
     * @param file File that was opened
     */
    onFileOpen(file: TFile): void {
        if (!this.shouldProcessFile(file)) {
            return;
        }

        // Update recent files tracking
        if (this.contextualEmbeddingManager) {
            this.contextualEmbeddingManager.updateRecentFiles(file.path, 'normal');
        }

        console.log(`[FileMonitor] File opened: ${file.path} (tracked in recent files)`);
    }

    /**
     * Handle file create events - track with high priority
     * @param file File that was created
     */
    onFileCreate(file: TFile): void {
        if (!this.shouldProcessFile(file)) {
            return;
        }

        // Update recent files tracking with high priority
        if (this.contextualEmbeddingManager) {
            this.contextualEmbeddingManager.updateRecentFiles(file.path, 'high');
        }

        console.log(`[FileMonitor] File created: ${file.path} (tracked with high priority)`);
    }

    /**
     * Handle file modify events - track with high priority
     * @param file File that was modified
     */
    onFileModify(file: TFile): void {
        if (!this.shouldProcessFile(file)) {
            return;
        }

        // Update recent files tracking with high priority
        if (this.contextualEmbeddingManager) {
            this.contextualEmbeddingManager.updateRecentFiles(file.path, 'high');
        }

        console.log(`[FileMonitor] File modified: ${file.path} (tracked with high priority)`);
    }

    /**
     * Handle file delete events - remove from tracking
     * @param file File that was deleted
     */
    onFileDelete(file: TFile): void {
        if (!this.shouldProcessFile(file)) {
            return;
        }

        // Remove from tracking and caches
        this.fileModificationTimes.delete(file.path);
        this.lastEmbeddingUpdateTimes.delete(file.path);
        this.contentCache.delete(file.path);

        console.log(`[FileMonitor] File deleted: ${file.path} (removed from tracking)`);
    }

    /**
     * Handle file rename events - update tracking
     * @param file File that was renamed
     * @param oldPath Previous file path
     */
    onFileRename(file: TFile, oldPath: string): void {
        if (!this.shouldProcessFile(file)) {
            return;
        }

        // Transfer tracking data from old path to new path
        const oldModTime = this.fileModificationTimes.get(oldPath);
        const oldEmbeddingTime = this.lastEmbeddingUpdateTimes.get(oldPath);
        const oldContent = this.contentCache.get(oldPath);

        if (oldModTime) {
            this.fileModificationTimes.set(file.path, oldModTime);
            this.fileModificationTimes.delete(oldPath);
        }

        if (oldEmbeddingTime) {
            this.lastEmbeddingUpdateTimes.set(file.path, oldEmbeddingTime);
            this.lastEmbeddingUpdateTimes.delete(oldPath);
        }

        if (oldContent !== undefined) {
            this.contentCache.set(file.path, oldContent);
            this.contentCache.delete(oldPath);
        }

        // Update recent files tracking
        if (this.contextualEmbeddingManager) {
            this.contextualEmbeddingManager.updateRecentFiles(file.path, 'normal');
        }

        console.log(`[FileMonitor] File renamed: ${oldPath} → ${file.path} (tracking updated)`);
    }

    shouldProcessFile(file: TAbstractFile): boolean {
        // Only process markdown files and certain other types
        if (!(file instanceof TFile)) {
            return false;
        }

        // Check file extension
        const validExtensions = ['.md', '.txt', '.canvas'];
        const hasValidExtension = validExtensions.some(ext => 
            file.path.toLowerCase().endsWith(ext)
        );

        if (!hasValidExtension) {
            return false;
        }

        // Skip template files and system folders
        const skipPaths = [
            '.obsidian/',
            'templates/',
            'Templates/',
            '.trash/',
            '.git/'
        ];

        const shouldSkip = skipPaths.some(skipPath => 
            file.path.toLowerCase().includes(skipPath.toLowerCase())
        );

        if (shouldSkip) {
            return false;
        }

        return true;
    }

    isSystemOperation(): boolean {
        return this.isSystemOp;
    }

    setSystemOperation(isSystem: boolean): void {
        this.isSystemOp = isSystem;
        if (isSystem) {
            // System operation - disable event processing
        } else {
            // User operation - enable event processing
        }
    }

    // Vault readiness tracking
    private initializeVaultReadiness(): void {
        // Simple approach - mark as ready immediately
        // In a real implementation, you might want to wait for specific events
        setTimeout(() => {
            this.markVaultAsReady();
        }, 1000); // Wait 1 second for vault to initialize
    }

    private markVaultAsReady(): void {
        this.vaultIsReady = true;
        this.vaultReadyTimestamp = Date.now();
    }

    // File modification tracking
    hasFileChanged(file: TAbstractFile): boolean {
        if (!(file instanceof TFile)) return false;

        const currentModTime = file.stat?.mtime || Date.now();
        const lastModTime = this.fileModificationTimes.get(file.path);
        
        // Update the modification time
        this.fileModificationTimes.set(file.path, currentModTime);
        
        // If we don't have a previous mod time, consider it changed
        if (lastModTime === undefined) {
            return true;
        }
        
        // Check if modification time changed significantly (more than 1 second)
        return Math.abs(currentModTime - lastModTime) > 1000;
    }

    shouldSkipEmbeddingUpdate(filePath: string): boolean {
        const now = Date.now();
        const lastUpdate = this.lastEmbeddingUpdateTimes.get(filePath);
        
        // Skip if updated within last 30 seconds to prevent rapid re-processing
        if (lastUpdate && (now - lastUpdate) < 30000) {
            return true;
        }
        
        this.lastEmbeddingUpdateTimes.set(filePath, now);
        return false;
    }

    // Content change detection
    async hasContentChanged(file: TFile): Promise<boolean> {
        try {
            const currentContent = await this.app.vault.read(file);
            const cachedContent = this.contentCache.get(file.path);
            
            if (cachedContent === undefined) {
                // No cached content - check if this file already has embeddings
                // to avoid re-embedding on startup
                const alreadyEmbedded = await this.checkIfFileAlreadyEmbedded(file.path);
                
                // Cache current content
                this.contentCache.set(file.path, currentContent);
                
                // Only consider it "changed" if it's not already embedded
                return !alreadyEmbedded;
            }
            
            const contentChanged = currentContent !== cachedContent;
            if (contentChanged) {
                // Update cache with new content
                this.contentCache.set(file.path, currentContent);
            }
            
            return contentChanged;
        } catch (error) {
            console.warn(`[FileMonitor] Error checking content change for ${file.path}:`, error);
            return true; // Assume changed if we can't read
        }
    }

    // Check if a file already has UP-TO-DATE embeddings in the vector store
    private async checkIfFileAlreadyEmbedded(filePath: string): Promise<boolean> {
        try {
            // Get the plugin instance and check if services are available
            const plugin = (this.app as any).plugins?.plugins?.['claudesidian-mcp'];
            if (!plugin?.getServiceContainer) {
                return false;
            }

            const serviceContainer = plugin.getServiceContainer();
            
            // Check if vector services are ready before trying to use them
            if (!serviceContainer.isReady('vectorStore') || !serviceContainer.isReady('embeddingService')) {
                // Services not ready yet - assume file needs embedding to be safe
                return false;
            }
            
            // Get vector store and embedding service (they should be ready now)
            const vectorStore = serviceContainer.getIfReady('vectorStore');
            const embeddingService = serviceContainer.getIfReady('embeddingService');
            
            if (!vectorStore || !embeddingService) {
                return false;
            }

            // Use the same logic as EmbeddingService to check if file needs embedding
            const needsEmbedding = await this.checkIfFileNeedsEmbeddingInternal(filePath, vectorStore, embeddingService);
            
            if (!needsEmbedding) {
                return true; // Has up-to-date embeddings
            }
            
            return false; // Needs embedding (either no embeddings or outdated)
        } catch (error) {
            console.warn(`[FileMonitor] Error checking embeddings for ${filePath}:`, error);
            return false; // If we can't check, assume not embedded
        }
    }

    // Shared logic for checking if a file needs embedding (delegates to ContentHashService)
    private async checkIfFileNeedsEmbeddingInternal(filePath: string, vectorStore: any, embeddingService: any): Promise<boolean> {
        try {
            // Use the ContentHashService from the embedding service for consistency
            if (embeddingService?.contentHashService && typeof embeddingService.contentHashService.checkIfFileNeedsEmbedding === 'function') {
                return await embeddingService.contentHashService.checkIfFileNeedsEmbedding(filePath, vectorStore);
            }
            
            // Fallback: if ContentHashService not available, assume file needs embedding to be safe
            return true;

        } catch (error) {
            console.warn(`[FileMonitor] Error checking if file needs embedding for ${filePath}:`, error);
            return true; // If we can't check, assume it needs embedding
        }
    }


    // Utility methods
    isVaultReady(): boolean {
        return this.vaultIsReady;
    }

    getVaultReadyTimestamp(): number {
        return this.vaultReadyTimestamp;
    }

    getStartupEventCount(): number {
        return this.startupFileEventCount;
    }

    incrementStartupEventCount(): void {
        this.startupFileEventCount++;
    }

    clearCaches(): void {
        this.fileModificationTimes.clear();
        this.lastEmbeddingUpdateTimes.clear();
        this.contentCache.clear();
    }

    getCacheStats(): {
        modificationTimes: number;
        embeddingUpdateTimes: number;
        contentCache: number;
    } {
        return {
            modificationTimes: this.fileModificationTimes.size,
            embeddingUpdateTimes: this.lastEmbeddingUpdateTimes.size,
            contentCache: this.contentCache.getStats().entries
        };
    }
}