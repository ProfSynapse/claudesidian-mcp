import { Plugin } from 'obsidian';

export interface IndexingState {
    status: 'idle' | 'indexing' | 'paused' | 'completed' | 'error';
    totalFiles: number;
    processedFiles: number;
    pendingFiles: string[];
    completedFiles: string[];
    failedFiles: string[];
    startTime?: string;
    lastUpdateTime?: string;
    errorMessage?: string;
    operationType?: 'initial' | 'reindex' | 'incremental';
    currentBatch?: string[];
    batchProgress?: number;
}

export class IndexingStateManager {
    private plugin: Plugin;
    private stateKey = 'claudesidian-indexing-state';
    
    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }
    
    /**
     * Load the current indexing state from storage
     */
    async loadState(): Promise<IndexingState | null> {
        try {
            console.log('DEBUG: Loading indexing state from localStorage key:', this.stateKey);
            const stateStr = localStorage.getItem(this.stateKey);
            console.log('DEBUG: Raw localStorage value:', stateStr);
            
            if (!stateStr) {
                console.log('DEBUG: No indexing state found in localStorage');
                return null;
            }
            
            const state = JSON.parse(stateStr) as IndexingState;
            console.log('DEBUG: Parsed indexing state:', state);
            
            // Enhanced validation
            if (!this.isValidState(state)) {
                console.warn('DEBUG: Invalid state detected, clearing localStorage');
                await this.clearState();
                return null;
            }
            
            return state;
        } catch (error) {
            console.error('Failed to load indexing state:', error);
            console.error('DEBUG: Clearing corrupted localStorage entry');
            await this.clearState();
            return null;
        }
    }
    
    /**
     * Save the indexing state to storage
     */
    async saveState(state: IndexingState): Promise<void> {
        try {
            state.lastUpdateTime = new Date().toISOString();
            localStorage.setItem(this.stateKey, JSON.stringify(state));
        } catch (error) {
            console.error('Failed to save indexing state:', error);
        }
    }
    
    /**
     * Initialize a new indexing operation
     */
    async initializeIndexing(filePaths: string[], operationType: 'initial' | 'reindex' | 'incremental' = 'initial'): Promise<IndexingState> {
        const state: IndexingState = {
            status: 'indexing',
            totalFiles: filePaths.length,
            processedFiles: 0,
            pendingFiles: [...filePaths],
            completedFiles: [],
            failedFiles: [],
            startTime: new Date().toISOString(),
            lastUpdateTime: new Date().toISOString(),
            operationType,
            currentBatch: [],
            batchProgress: 0
        };
        
        await this.saveState(state);
        return state;
    }
    
    /**
     * Update the state after processing files
     */
    async updateProgress(completedFiles: string[], failedFiles: string[] = []): Promise<void> {
        const state = await this.loadState();
        if (!state || state.status !== 'indexing') return;
        
        // Remove completed and failed files from pending
        const processedFiles = [...completedFiles, ...failedFiles];
        state.pendingFiles = state.pendingFiles.filter(f => !processedFiles.includes(f));
        
        // Add to completed/failed lists
        state.completedFiles.push(...completedFiles);
        state.failedFiles.push(...failedFiles);
        
        // Update counts
        state.processedFiles = state.completedFiles.length + state.failedFiles.length;
        
        // Update status if done
        if (state.pendingFiles.length === 0) {
            state.status = state.failedFiles.length > 0 ? 'error' : 'completed';
        }
        
        await this.saveState(state);
    }
    
    /**
     * Mark indexing as paused
     */
    async pauseIndexing(): Promise<void> {
        const state = await this.loadState();
        if (!state || state.status !== 'indexing') return;
        
        state.status = 'paused';
        await this.saveState(state);
    }
    
    /**
     * Clear the indexing state
     */
    async clearState(): Promise<void> {
        localStorage.removeItem(this.stateKey);
    }
    
    /**
     * Check if there's a resumable indexing operation
     */
    async hasResumableIndexing(): Promise<boolean> {
        console.log('DEBUG: hasResumableIndexing called');
        const state = await this.loadState();
        console.log('DEBUG: State loaded:', state);
        
        if (!state) {
            console.log('DEBUG: No state found, returning false');
            return false;
        }
        
        const hasValidStatus = state.status === 'paused' || state.status === 'indexing';
        const hasPendingFiles = state.pendingFiles && state.pendingFiles.length > 0;
        
        console.log('DEBUG: hasValidStatus:', hasValidStatus, '(status:', state.status, ')');
        console.log('DEBUG: hasPendingFiles:', hasPendingFiles, '(pending count:', state.pendingFiles?.length, ')');
        
        const isResumable = state !== null && hasValidStatus && hasPendingFiles;
        console.log('DEBUG: isResumable:', isResumable);
        
        return isResumable;
    }
    
    /**
     * Get files to resume indexing
     */
    async getResumableFiles(): Promise<string[]> {
        const state = await this.loadState();
        if (!state) return [];
        
        return state.pendingFiles;
    }
    
    /**
     * Enhanced state validation
     */
    private isValidState(state: any): boolean {
        return state &&
               typeof state === 'object' &&
               typeof state.status === 'string' &&
               ['idle', 'indexing', 'paused', 'completed', 'error'].includes(state.status) &&
               typeof state.totalFiles === 'number' &&
               typeof state.processedFiles === 'number' &&
               Array.isArray(state.pendingFiles) &&
               Array.isArray(state.completedFiles) &&
               Array.isArray(state.failedFiles);
    }
    
    /**
     * Save progress update for more frequent state tracking
     */
    async saveProgressUpdate(completedFiles: string[], failedFiles: string[] = []): Promise<void> {
        const state = await this.loadState();
        if (!state || state.status !== 'indexing') return;
        
        await this.updateProgress(completedFiles, failedFiles);
    }
    
    /**
     * Update current batch tracking
     */
    async updateBatchProgress(currentBatch: string[], batchProgress: number): Promise<void> {
        const state = await this.loadState();
        if (!state || state.status !== 'indexing') return;
        
        state.currentBatch = currentBatch;
        state.batchProgress = batchProgress;
        await this.saveState(state);
    }
    
    /**
     * Get the current operation type
     */
    async getOperationType(): Promise<'initial' | 'reindex' | 'incremental' | null> {
        const state = await this.loadState();
        return state?.operationType || null;
    }
}