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
            const stateStr = localStorage.getItem(this.stateKey);
            if (!stateStr) return null;
            
            const state = JSON.parse(stateStr) as IndexingState;
            return state;
        } catch (error) {
            console.error('Failed to load indexing state:', error);
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
    async initializeIndexing(filePaths: string[]): Promise<IndexingState> {
        const state: IndexingState = {
            status: 'indexing',
            totalFiles: filePaths.length,
            processedFiles: 0,
            pendingFiles: [...filePaths],
            completedFiles: [],
            failedFiles: [],
            startTime: new Date().toISOString(),
            lastUpdateTime: new Date().toISOString()
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
        const state = await this.loadState();
        return state !== null && 
               (state.status === 'paused' || state.status === 'indexing') && 
               state.pendingFiles.length > 0;
    }
    
    /**
     * Get files to resume indexing
     */
    async getResumableFiles(): Promise<string[]> {
        const state = await this.loadState();
        if (!state) return [];
        
        return state.pendingFiles;
    }
}