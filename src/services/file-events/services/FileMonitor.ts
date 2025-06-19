import { App, TAbstractFile, TFile } from 'obsidian';
import { IFileMonitor } from '../interfaces/IFileEventServices';
import { ContentCache } from '../../../database/utils/ContentCache';

export class FileMonitor implements IFileMonitor {
    private isSystemOp: boolean = false;
    private vaultIsReady: boolean = false;
    private vaultReadyTimestamp: number = 0;
    private startupFileEventCount: number = 0;
    private fileModificationTimes: Map<string, number> = new Map();
    private lastEmbeddingUpdateTimes: Map<string, number> = new Map();
    private contentCache: ContentCache;

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
        } else {
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
                // No cached content, cache current and consider it changed
                this.contentCache.set(file.path, currentContent);
                return true;
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