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
        console.log('[StateManager] Initialized with plugin data.json storage');
    }

    async loadState(): Promise<void> {
        if (this.loaded) {
            console.log('[StateManager] State already loaded, skipping');
            return;
        }

        try {
            console.log('[StateManager] Loading state from data.json');
            const data = await this.plugin.loadData();
            const processedFilesData = data?.processedFiles;
            
            // Check for migration from old state file
            if (!processedFilesData) {
                console.log('[StateManager] No processed files data found in data.json');
                await this.migrateFromOldStateFile();
                
                // Try loading again after migration
                const updatedData = await this.plugin.loadData();
                const migratedData = updatedData?.processedFiles;
                
                if (!migratedData) {
                    console.log('[StateManager] No data after migration, starting fresh');
                    this.loaded = true;
                    return;
                }
                
                console.log(`[StateManager] ✅ Migrated ${Object.keys(migratedData.files || {}).length} files from old state file`);
            }

            // Load processed files data
            const finalData = await this.plugin.loadData();
            const finalProcessedFilesData = finalData?.processedFiles;
            
            if (finalProcessedFilesData) {
                console.log('[StateManager] Parsed processed files data:', { 
                    version: finalProcessedFilesData.version, 
                    lastUpdated: finalProcessedFilesData.lastUpdated,
                    filesCount: finalProcessedFilesData.files ? Object.keys(finalProcessedFilesData.files).length : 0
                });
                
                // Validate and load state data
                if (finalProcessedFilesData.version && finalProcessedFilesData.files) {
                    this.processedFiles.clear();
                    
                    for (const [filePath, state] of Object.entries(finalProcessedFilesData.files)) {
                        if (this.isValidProcessedFileState(state)) {
                            this.processedFiles.set(filePath, state as ProcessedFileState);
                        }
                    }
                    
                    console.log(`[StateManager] ✅ Loaded ${this.processedFiles.size} files from data.json`);
                }
            }
        } catch (error) {
            console.error('[StateManager] ❌ CRITICAL: Failed to load from data.json:', error);
            console.error('[StateManager] ❌ DIAGNOSTIC: Plugin instance:', {
                hasPlugin: !!this.plugin,
                hasLoadData: !!(this.plugin?.loadData),
                pluginType: this.plugin?.constructor?.name
            });
            throw new Error(`ProcessedFilesStateManager failed to load state: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        this.loaded = true;
    }

    async saveState(): Promise<void> {
        if (!this.loaded) {
            console.log('[StateManager] State not loaded, skipping save');
            return;
        }

        try {
            console.log(`[StateManager] Saving ${this.processedFiles.size} files to data.json`);
            
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
            console.log('[StateManager] ✅ Saved processed files to data.json');
        } catch (error) {
            console.error('[StateManager] ❌ CRITICAL: Failed to save to data.json:', error);
            console.error('[StateManager] ❌ DIAGNOSTIC: Plugin instance:', {
                hasPlugin: !!this.plugin,
                hasSaveData: !!(this.plugin?.saveData),
                pluginType: this.plugin?.constructor?.name,
                processedFilesCount: this.processedFiles.size
            });
            throw new Error(`ProcessedFilesStateManager failed to save state: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    isFileProcessed(filePath: string, currentContentHash: string): boolean {
        const normalizedPath = normalizePath(filePath);
        const state = this.processedFiles.get(normalizedPath);
        
        
        if (!state) {
            console.log(`[StateManager] No state found for: ${normalizedPath}`);
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
        
        console.log(`[StateManager] Marking file as processed: ${normalizedPath}`, {
            contentHash,
            provider,
            vectorStoreId
        });
        
        this.processedFiles.set(normalizedPath, {
            filePath: normalizedPath,
            contentHash,
            lastProcessed: Date.now(),
            status: 'completed',
            embeddingProvider: provider,
            vectorStoreId,
        });
        
        console.log(`[StateManager] ✅ File marked as processed. Total processed files: ${this.processedFiles.size}`);
    }

    markFileFailed(filePath: string, contentHash: string, errorMessage: string): void {
        const normalizedPath = normalizePath(filePath);
        
        console.log(`[StateManager] Marking file as failed: ${normalizedPath}`, {
            contentHash,
            errorMessage
        });
        
        this.processedFiles.set(normalizedPath, {
            filePath: normalizedPath,
            contentHash,
            lastProcessed: Date.now(),
            status: 'failed',
            embeddingProvider: 'unknown',
            vectorStoreId: 'unknown',
            errorMessage,
        });
        
        console.log(`[StateManager] ❌ File marked as failed. Total processed files: ${this.processedFiles.size}`);
    }

    removeFile(filePath: string): void {
        const normalizedPath = normalizePath(filePath);
        this.processedFiles.delete(normalizedPath);
    }

    getProcessedFilesCount(): number {
        const count = Array.from(this.processedFiles.values())
            .filter(state => state.status === 'completed')
            .length;
        console.log(`[StateManager] Get processed files count: ${count}`);
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

    /**
     * Migrate from old state file to data.json
     * This provides backward compatibility for existing installations
     */
    private async migrateFromOldStateFile(): Promise<void> {
        try {
            const oldStateFile = this.plugin.app.vault.getAbstractFileByPath('processed-files-state.json');
            if (!oldStateFile) {
                console.log('[StateManager] No old state file found, skipping migration');
                return;
            }

            console.log('[StateManager] 🔄 Migrating from old state file');
            const oldContent = await this.plugin.app.vault.read(oldStateFile as any);
            const oldStateData = JSON.parse(oldContent);
            
            if (oldStateData.version && oldStateData.processedFiles) {
                // Load existing plugin data
                const data = await this.plugin.loadData() || {};
                
                // Migrate old format to new format
                data.processedFiles = {
                    version: '1.0.0',
                    lastUpdated: Date.now(),
                    files: oldStateData.processedFiles
                };
                
                // Save migrated data
                await this.plugin.saveData(data);
                
                // Delete old state file
                await this.plugin.app.vault.delete(oldStateFile);
                
                console.log('[StateManager] ✅ Successfully migrated and cleaned up old state file');
            }
        } catch (error) {
            console.error('[StateManager] ❌ CRITICAL: Failed to migrate old state file:', error);
            console.error('[StateManager] ❌ DIAGNOSTIC: Migration failure details:', {
                hasPlugin: !!this.plugin,
                hasApp: !!(this.plugin?.app),
                hasVault: !!(this.plugin?.app?.vault),
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`ProcessedFilesStateManager migration failed: ${error instanceof Error ? error.message : String(error)}`);
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