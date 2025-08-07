import { Plugin, normalizePath } from 'obsidian';

export interface ProcessedFileState {
    filePath: string;
    contentHash: string;
    lastProcessed: number;
    status: 'completed' | 'failed' | 'skipped';
    embeddingProvider: string;
    vectorStoreId: string;
    errorMessage?: string;
}

export class ProcessedFilesStateManager {
    private plugin: Plugin;
    private processedFiles: Map<string, ProcessedFileState> = new Map();
    private loaded: boolean = false;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    async loadState(): Promise<void> {
        if (this.loaded) {
            // State already loaded, skipping
            return;
        }

        try {
            // Loading state from data.json
            const data = await this.plugin.loadData();
            const processedFilesData = data?.processedFiles;
            
            // Initialize with empty state if no data found
            if (!processedFilesData) {
                // No processed files data found in data.json, starting fresh
                this.loaded = true;
                return;
            }

            // Load processed files data
            const finalData = await this.plugin.loadData();
            const finalProcessedFilesData = finalData?.processedFiles;
            
            if (finalProcessedFilesData) {
                // Parsed processed files data from storage
                
                // Validate and load state data
                if (finalProcessedFilesData.version && finalProcessedFilesData.files) {
                    this.processedFiles.clear();
                    
                    for (const [filePath, state] of Object.entries(finalProcessedFilesData.files)) {
                        if (this.isValidProcessedFileState(state)) {
                            this.processedFiles.set(filePath, state as ProcessedFileState);
                        }
                    }
                    
                    // Successfully loaded files from data.json
                }
            }
        } catch (error) {
            console.error('CRITICAL: Failed to load from data.json:', error);
            throw new Error(`ProcessedFilesStateManager failed to load state: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        this.loaded = true;
    }

    async saveState(): Promise<void> {
        if (!this.loaded) {
            // State not loaded, skipping save
            return;
        }

        try {
            // Saving files to data.json
            
            // Load existing data to preserve other settings
            const data = await this.plugin.loadData() || {};
            
            // Update processed files data
            data.processedFiles = {
                version: '1.0.0',
                lastUpdated: Date.now(),
                files: Object.fromEntries(this.processedFiles)
            };

            // Save back to plugin data
            await this.plugin.saveData(data);
            // Successfully saved processed files to data.json
        } catch (error) {
            console.error('CRITICAL: Failed to save to data.json:', error);
            throw new Error(`ProcessedFilesStateManager failed to save state: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    isFileProcessed(filePath: string, currentContentHash: string): boolean {
        const normalizedPath = normalizePath(filePath);
        const state = this.processedFiles.get(normalizedPath);
        
        
        if (!state) {
            // No state found for file
            return false;
        }
        
        // File is processed if:
        // 1. Status is completed
        // 2. Content hash matches (file hasn't changed)
        const isProcessed = state.status === 'completed' && state.contentHash === currentContentHash;
        return isProcessed;
    }

    markFileProcessed(filePath: string, contentHash: string, provider: string, vectorStoreId: string = 'default'): void {
        const normalizedPath = normalizePath(filePath);
        
        // Marking file as processed
        
        this.processedFiles.set(normalizedPath, {
            filePath: normalizedPath,
            contentHash,
            lastProcessed: Date.now(),
            status: 'completed',
            embeddingProvider: provider,
            vectorStoreId,
        });
        
        // File marked as processed
    }

    markFileFailed(filePath: string, contentHash: string, errorMessage: string): void {
        const normalizedPath = normalizePath(filePath);
        
        // Marking file as failed
        
        this.processedFiles.set(normalizedPath, {
            filePath: normalizedPath,
            contentHash,
            lastProcessed: Date.now(),
            status: 'failed',
            embeddingProvider: 'unknown',
            vectorStoreId: 'unknown',
            errorMessage,
        });
        
        // File marked as failed
    }

    removeFile(filePath: string): void {
        const normalizedPath = normalizePath(filePath);
        this.processedFiles.delete(normalizedPath);
    }

    getProcessedFilesCount(): number {
        const count = Array.from(this.processedFiles.values())
            .filter(state => state.status === 'completed')
            .length;
        // Getting processed files count
        return count;
    }

    getFailedFilesCount(): number {
        return Array.from(this.processedFiles.values())
            .filter(state => state.status === 'failed')
            .length;
    }

    getAllProcessedFiles(): ProcessedFileState[] {
        return Array.from(this.processedFiles.values());
    }

    getProcessedFileState(filePath: string): ProcessedFileState | undefined {
        const normalizedPath = normalizePath(filePath);
        return this.processedFiles.get(normalizedPath);
    }

    clearFailedFiles(): void {
        for (const [filePath, state] of this.processedFiles.entries()) {
            if (state.status === 'failed') {
                this.processedFiles.delete(filePath);
            }
        }
    }


    private isValidProcessedFileState(state: any): boolean {
        return (
            state &&
            typeof state.filePath === 'string' &&
            typeof state.contentHash === 'string' &&
            typeof state.lastProcessed === 'number' &&
            ['completed', 'failed', 'skipped'].includes(state.status) &&
            typeof state.embeddingProvider === 'string' &&
            typeof state.vectorStoreId === 'string'
        );
    }
}