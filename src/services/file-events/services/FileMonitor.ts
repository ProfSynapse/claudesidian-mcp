import { App, TAbstractFile, TFile } from 'obsidian';
import { IFileMonitor } from '../interfaces/IFileEventServices';
import { ContentCache } from '../../../database/utils/ContentCache';

export class FileMonitor implements IFileMonitor {
    private isSystemOp = false;
    private vaultIsReady = false;
    private vaultReadyTimestamp = 0;
    private startupFileEventCount = 0;
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
            // Get the plugin instance to access vector store and embedding service
            const plugin = (this.app as any).plugins?.plugins?.['claudesidian-mcp'];
            if (!plugin?.vectorStore || !plugin?.embeddingService) {
                return false;
            }

            // Use the same logic as EmbeddingService to check if file needs embedding
            const needsEmbedding = await this.checkIfFileNeedsEmbeddingInternal(filePath, plugin.vectorStore, plugin.embeddingService);
            
            if (!needsEmbedding) {
                return true; // Has up-to-date embeddings
            }
            
            return false; // Needs embedding (either no embeddings or outdated)
        } catch (error) {
            console.warn(`[FileMonitor] Error checking embeddings for ${filePath}:`, error);
            return false; // If we can't check, assume not embedded
        }
    }

    // Shared logic for checking if a file needs embedding (matches EmbeddingService logic)
    private async checkIfFileNeedsEmbeddingInternal(filePath: string, vectorStore: any, _embeddingService: any): Promise<boolean> {
        try {
            // Read current file content and generate hash
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || 'children' in file) {
                return false; // Skip if file doesn't exist or is a folder
            }

            const content = await this.app.vault.read(file as any);
            const currentHash = this.hashContent(content);

            // Query for existing embeddings for this file
            const queryResult = await vectorStore.query('file_embeddings', {
                where: { filePath: { $eq: filePath } },
                nResults: 1, // Just need one to check metadata
                include: ['metadatas']
            });

            // If no embeddings exist, we need to create them
            if (!queryResult.ids || queryResult.ids.length === 0 || queryResult.ids[0].length === 0) {
                return true;
            }

            // Check if any chunk has different content hash
            const existingMetadata = queryResult.metadatas?.[0]?.[0];
            if (!existingMetadata || !existingMetadata.contentHash) {
                // No content hash in metadata - skip re-embedding to avoid conflicts
                return false;
            }

            // Compare content hash - if different, needs re-embedding
            return existingMetadata.contentHash !== currentHash;

        } catch (error) {
            console.warn(`[FileMonitor] Error checking if file needs embedding for ${filePath}:`, error);
            return true; // If we can't check, assume it needs embedding
        }
    }

    // Content hashing method (same as EmbeddingService)
    private hashContent(content: string): string {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
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