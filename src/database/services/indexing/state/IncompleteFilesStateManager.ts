/**
 * IncompleteFilesStateManager - Tracks only files that need re-embedding
 * 
 * This replaces the old system that stored every completed file forever.
 * New approach: Only track files that actually need processing, remove when complete.
 * 
 * Used by: FileEventCoordinator for change detection and queue management
 * Dependencies: Plugin for data.json access
 */

import { Plugin } from 'obsidian';

export interface IncompleteFileState {
    filePath: string;
    oldHash: string;
    newHash: string;
    operation: 'create' | 'modify' | 'delete';
    queuedAt: number;
    needsReembedding: boolean;
    reason: 'content_changed' | 'new_file' | 'manual' | 'failed_previous';
}

export interface IncompleteFilesData {
    version: string;
    lastUpdated: number;
    files: { [filePath: string]: IncompleteFileState };
}

export class IncompleteFilesStateManager {
    private incompleteFiles: Map<string, IncompleteFileState> = new Map();
    private plugin: Plugin;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    /**
     * Initialize and load existing incomplete files state (without migration)
     */
    async initialize(): Promise<void> {
        try {
            const data = await this.plugin.loadData();
            
            // Load incomplete files
            if (data?.incompleteFiles?.files) {
                this.incompleteFiles.clear();
                
                for (const [filePath, state] of Object.entries(data.incompleteFiles.files)) {
                    if (this.isValidIncompleteState(state as IncompleteFileState)) {
                        this.incompleteFiles.set(filePath, state as IncompleteFileState);
                    }
                }
            }
            
        } catch (error) {
            console.error('[IncompleteFilesStateManager] Failed to initialize:', error);
            // Continue with empty state if loading fails
        }
    }

    /**
     * Perform deferred migration after Obsidian is fully loaded
     */
    async performDeferredMigration(): Promise<void> {
        try {
            const data = await this.plugin.loadData();
            
            // Check for migration from old format
            if (this.needsMigration(data)) {
                await this.performMigration(data);
            }
            
        } catch (error) {
            console.error('[IncompleteFilesStateManager] ❌ Deferred migration failed:', error);
        }
    }

    /**
     * Check if file needs re-embedding (exists in incomplete tracking)
     */
    needsReembedding(filePath: string): boolean {
        const normalizedPath = this.normalizePath(filePath);
        return this.incompleteFiles.has(normalizedPath);
    }

    /**
     * Get incomplete file state
     */
    getIncompleteState(filePath: string): IncompleteFileState | null {
        const normalizedPath = this.normalizePath(filePath);
        return this.incompleteFiles.get(normalizedPath) || null;
    }

    /**
     * Mark file as needing re-embedding
     */
    async markForReembedding(
        filePath: string, 
        oldHash: string, 
        newHash: string, 
        operation: 'create' | 'modify' | 'delete',
        reason: 'content_changed' | 'new_file' | 'manual' | 'failed_previous' = 'content_changed'
    ): Promise<void> {
        const normalizedPath = this.normalizePath(filePath);
        
        const state: IncompleteFileState = {
            filePath: normalizedPath,
            oldHash,
            newHash,
            operation,
            queuedAt: Date.now(),
            needsReembedding: true,
            reason
        };
        
        this.incompleteFiles.set(normalizedPath, state);
        await this.saveState();
    }

    /**
     * Mark file as completed and remove from incomplete tracking
     */
    async markAsCompleted(filePath: string): Promise<void> {
        const normalizedPath = this.normalizePath(filePath);
        
        if (this.incompleteFiles.has(normalizedPath)) {
            this.incompleteFiles.delete(normalizedPath);
            await this.saveState();
        }
    }

    /**
     * Get all incomplete files
     */
    getAllIncompleteFiles(): IncompleteFileState[] {
        return Array.from(this.incompleteFiles.values());
    }

    /**
     * Get count of incomplete files
     */
    getIncompleteCount(): number {
        return this.incompleteFiles.size;
    }

    /**
     * Clear all incomplete files (for cleanup/reset)
     */
    async clearAllIncomplete(): Promise<void> {
        this.incompleteFiles.clear();
        await this.saveState();
    }

    /**
     * Save current state to data.json with verification
     */
    private async saveState(): Promise<void> {
        try {
            const data = await this.plugin.loadData() || {};
            
            // Update incomplete files data
            data.incompleteFiles = {
                version: '2.0.0',
                lastUpdated: Date.now(),
                files: Object.fromEntries(this.incompleteFiles)
            };
            
            await this.plugin.saveData(data);
            
            // Verify the save actually worked
            const verifyData = await this.plugin.loadData();
            if (!verifyData?.incompleteFiles?.version) {
                console.error('[IncompleteFilesStateManager] ❌ Save verification failed - data not persisted!');
            }
            
        } catch (error) {
            console.error('[IncompleteFilesStateManager] Failed to save state:', error);
        }
    }

    /**
     * Check if migration from old format is needed
     */
    private needsMigration(data: any): boolean {
        // Already migrated? Skip migration
        if (data?.migrationVersion === '2.0.0') {
            return false;
        }
        
        // Check if old processedFiles format exists with significant data
        if (data?.processedFiles?.files) {
            const completedCount = Object.values(data.processedFiles.files)
                .filter((state: any) => state.status === 'completed').length;
            
            // If there are more than 10 completed files, trigger migration
            if (completedCount > 10) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Perform migration from old processedFiles format
     */
    private async performMigration(data: any): Promise<void> {
        try {
            let migratedCount = 0;
            let clearedFilesCount = 0;
            let clearedQueueCount = 0;
            
            // Count and clear old processedFiles
            if (data.processedFiles?.files) {
                const oldFiles = data.processedFiles.files;
                
                // Keep only failed files, clear all completed
                for (const [filePath, state] of Object.entries(oldFiles)) {
                    const fileState = state as any;
                    
                    if (fileState.status === 'completed') {
                        // Remove completed files - they don't need tracking
                        clearedFilesCount++;
                    } else if (fileState.status === 'failed') {
                        // Convert failed files to incomplete tracking
                        await this.markForReembedding(
                            filePath,
                            fileState.contentHash || '',
                            '', // Will be recalculated
                            'modify',
                            'failed_previous'
                        );
                        migratedCount++;
                    }
                }
                
                // Clear the old processedFiles to free up space
                delete data.processedFiles;
            }
            
            // Count and clear old fileEventQueue (if it exists from separate file)
            if (data.fileEventQueue?.events) {
                clearedQueueCount = data.fileEventQueue.events.length;
            }
            
            // Clear old data structures and initialize new ones
            delete data.fileEventQueue; // Clear any old queue data
            
            // Mark migration as completed to prevent re-running
            data.migrationVersion = '2.0.0';
            data.lastMigrationDate = Date.now();
            
            // Initialize new clean structures
            data.incompleteFiles = {
                version: '2.0.0',
                lastUpdated: Date.now(),
                files: {}
            };
            
            data.fileEventQueue = {
                version: '2.0.0',
                lastUpdated: Date.now(),
                events: []
            };
            
            // Save the cleaned and migrated data
            await this.plugin.saveData(data);
            
            // Wait a moment to let the save complete
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Verify migration actually persisted
            const verifyData = await this.plugin.loadData();
            if (!verifyData?.migrationVersion) {
                console.error('[IncompleteFilesStateManager] ❌ Migration verification FAILED - migrationVersion not found!');
                throw new Error('Migration data not persisted');
            }
            
            // Double check by forcing a second save attempt
            await this.plugin.saveData(data);
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            console.error('[IncompleteFilesStateManager] ❌ Migration failed:', error);
            throw error;
        }
    }

    /**
     * Validate incomplete file state structure
     */
    private isValidIncompleteState(state: any): boolean {
        return state && 
               typeof state === 'object' &&
               typeof state.filePath === 'string' &&
               typeof state.oldHash === 'string' &&
               typeof state.newHash === 'string' &&
               ['create', 'modify', 'delete'].includes(state.operation) &&
               typeof state.queuedAt === 'number' &&
               typeof state.needsReembedding === 'boolean' &&
               ['content_changed', 'new_file', 'manual', 'failed_previous'].includes(state.reason);
    }

    /**
     * Normalize file path for consistent storage
     */
    private normalizePath(filePath: string): string {
        return filePath.replace(/\\/g, '/');
    }
}