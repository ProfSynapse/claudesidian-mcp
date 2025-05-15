import { App, Events, TFile } from 'obsidian';
import { MemorySettings, MemoryUsageStats } from '../../../types';
import { VectorStore } from '../db/memory-db';
import { BaseEmbeddingProvider } from '../providers/embeddings-provider';
import { FilePathOperations } from './FilePathOperations';
import { IndexingOperations } from './IndexingOperations';
import { DatabaseOperations } from './DatabaseOperations';

/**
 * Utility class for file event operations related to memory management
 * Centralizes logic for handling file modifications, deletions, and renames
 */
export class FileEventOperations {
    /**
     * Register file event listeners for automatic indexing
     * 
     * @param app Obsidian app instance
     * @param settings Memory settings
     * @param db Vector store instance
     * @param provider Embedding provider
     * @param usageStats Usage statistics to update
     * @param indexingInProgress Flag to track ongoing indexing operations
     */
    static registerFileEvents(
        app: App,
        settings: MemorySettings,
        db: VectorStore | null,
        provider: BaseEmbeddingProvider | null,
        usageStats: MemoryUsageStats,
        indexingInProgress: boolean
    ): void {
        // Listen for file modifications
        app.vault.on('modify', (file: TFile) => {
            if (file instanceof TFile && file.extension === 'md') {
                FileEventOperations.onFileModified(
                    app, file, settings, db, provider, usageStats, indexingInProgress
                );
            }
        });
        
        // Listen for file deletions
        app.vault.on('delete', (file: TFile) => {
            if (file instanceof TFile && file.extension === 'md') {
                FileEventOperations.onFileDeleted(
                    db, file.path
                );
            }
        });
        
        // Listen for file renames
        app.vault.on('rename', (file: TFile, oldPath: string) => {
            if (file instanceof TFile && file.extension === 'md') {
                FileEventOperations.onFileRenamed(
                    app, file, oldPath, settings, db, provider, usageStats, indexingInProgress
                );
            }
        });
    }
    
    /**
     * Handle file modifications for automatic indexing
     * 
     * @param app Obsidian app instance
     * @param file Modified file
     * @param settings Memory settings
     * @param db Vector store instance
     * @param provider Embedding provider
     * @param usageStats Usage statistics to update
     * @param indexingInProgress Flag to track ongoing indexing operations
     */
    static async onFileModified(
        app: App,
        file: TFile,
        settings: MemorySettings,
        db: VectorStore | null,
        provider: BaseEmbeddingProvider | null,
        usageStats: MemoryUsageStats,
        indexingInProgress: boolean
    ): Promise<void> {
        // Skip if not enabled or indexing is already in progress
        if (!settings.enabled || indexingInProgress) {
            return;
        }
        
        // Skip if file is excluded
        if (FilePathOperations.isFileExcluded(file.path, settings.excludePaths)) {
            return;
        }
        
        // Index the file
        await IndexingOperations.indexFile(
            app, db, provider, file.path, settings, usageStats, false
        );
    }
    
    /**
     * Handle file deletions
     * 
     * @param db Vector store instance
     * @param filePath Path of the deleted file
     */
    static async onFileDeleted(
        db: VectorStore | null,
        filePath: string
    ): Promise<void> {
        // Delete embeddings for the file
        await DatabaseOperations.deleteEmbeddingsForFile(db, filePath);
    }
    
    /**
     * Handle file renames
     * 
     * @param app Obsidian app instance
     * @param file Renamed file
     * @param oldPath Old file path
     * @param settings Memory settings
     * @param db Vector store instance
     * @param provider Embedding provider
     * @param usageStats Usage statistics to update
     * @param indexingInProgress Flag to track ongoing indexing operations
     */
    static async onFileRenamed(
        app: App,
        file: TFile,
        oldPath: string,
        settings: MemorySettings,
        db: VectorStore | null,
        provider: BaseEmbeddingProvider | null,
        usageStats: MemoryUsageStats,
        indexingInProgress: boolean
    ): Promise<void> {
        // Skip if not enabled or indexing is already in progress
        if (!settings.enabled || indexingInProgress) {
            return;
        }
        
        // Delete old embeddings
        await DatabaseOperations.deleteEmbeddingsForFile(db, oldPath);
        
        // Skip if file is now excluded
        if (FilePathOperations.isFileExcluded(file.path, settings.excludePaths)) {
            return;
        }
        
        // Index the renamed file
        await IndexingOperations.indexFile(
            app, db, provider, file.path, settings, usageStats, false
        );
    }
}