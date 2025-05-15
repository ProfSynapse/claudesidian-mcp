import { App, TFile, Events, Notice } from 'obsidian';
import { VectorStore } from '../db/memory-db';
import { BaseEmbeddingProvider } from '../providers/embeddings-provider';
import { ChunkingOptions, chunkMarkdownText } from './text-chunker';
import { EmbeddingRecord, MemorySettings, MemoryUsageStats } from '../../../types';
import { DatabaseOperations } from './DatabaseOperations';
import { FilePathOperations } from './FilePathOperations';
import { UsageStatsOperations } from './UsageStatsOperations';
import { LinkOperations } from './LinkOperations';

/**
 * Interface for indexing progress state
 */
export interface IndexingProgressState {
    operationId: string;
    total: number;
    processed: string[];
    failed: string[];
    startTime: number;
    isCancelled: boolean;
}

/**
 * Utility class for indexing operations related to memory management
 * Centralizes logic for handling file indexing, batch indexing, etc.
 */
export class IndexingOperations {
    // Store in-progress indexing operations
    private static activeOperations: Map<string, IndexingProgressState> = new Map();
    
    /**
     * Get the current progress state for an operation
     * 
     * @param operationId The ID of the operation
     * @returns The progress state or null if not found
     */
    static getProgressState(operationId: string): IndexingProgressState | null {
        return this.activeOperations.get(operationId) || null;
    }
    
    /**
     * Save the current progress state to localStorage
     * 
     * @param state The progress state to save
     */
    static saveProgressState(state: IndexingProgressState): void {
        // Update the in-memory state
        this.activeOperations.set(state.operationId, state);
        
        // Save to localStorage
        localStorage.setItem(`indexing-progress-${state.operationId}`, JSON.stringify(state));
    }
    
    /**
     * Load a progress state from localStorage
     * 
     * @param operationId The ID of the operation
     * @returns The progress state or null if not found
     */
    static loadProgressState(operationId: string): IndexingProgressState | null {
        // Check if we have an in-memory state
        const inMemoryState = this.activeOperations.get(operationId);
        if (inMemoryState) {
            return inMemoryState;
        }
        
        // Try to load from localStorage
        const storedState = localStorage.getItem(`indexing-progress-${operationId}`);
        if (storedState) {
            try {
                const state = JSON.parse(storedState) as IndexingProgressState;
                this.activeOperations.set(operationId, state);
                return state;
            } catch (error) {
                console.error('Error parsing stored progress state:', error);
            }
        }
        
        return null;
    }
    
    /**
     * Clear a progress state from storage
     * 
     * @param operationId The ID of the operation
     */
    static clearProgressState(operationId: string): void {
        // Remove from in-memory map
        this.activeOperations.delete(operationId);
        
        // Remove from localStorage
        localStorage.removeItem(`indexing-progress-${operationId}`);
    }
    
    /**
     * Cancel an indexing operation
     * 
     * @param operationId The ID of the operation to cancel
     */
    static cancelOperation(operationId: string): void {
        const state = this.activeOperations.get(operationId);
        if (state) {
            state.isCancelled = true;
            this.saveProgressState(state);
        }
    }
    /**
     * Index a single file from the vault
     * 
     * @param app Obsidian app instance
     * @param db Vector store instance
     * @param provider Embedding provider
     * @param filePath Path to the file to index
     * @param settings Memory settings
     * @param usageStats Usage statistics to update
     * @param force Whether to force re-indexing even if the file hasn't changed
     * @returns Result object with success flag, chunks count, and error message if any
     */
    static async indexFile(
        app: App,
        db: VectorStore | null,
        provider: BaseEmbeddingProvider | null,
        filePath: string,
        settings: MemorySettings,
        usageStats: MemoryUsageStats,
        force: boolean = false
    ): Promise<{
        success: boolean;
        chunks?: number;
        error?: string;
        filePath: string;
    }> {
        if (!settings.enabled || !db || !provider) {
            return { 
                success: false, 
                error: 'Memory Manager is not enabled or initialized',
                filePath
            };
        }
        
        try {
            // Skip if file is excluded
            if (FilePathOperations.isFileExcluded(filePath, settings.excludePaths)) {
                return { 
                    success: false, 
                    error: 'File is excluded by settings',
                    filePath
                };
            }
            
            // Get the file
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) {
                return { 
                    success: false, 
                    error: 'File not found',
                    filePath
                };
            }
            
            // Skip if not a markdown file
            if (!FilePathOperations.isMarkdownFile(file)) {
                return { 
                    success: false, 
                    error: 'Only markdown files can be indexed',
                    filePath
                };
            }
            
            // Check if we've already indexed this file and it hasn't changed
            if (!force) {
                const shouldReindex = await DatabaseOperations.shouldReindexFile(db, filePath, file);
                if (!shouldReindex) {
                    const existingEmbeddings = await db.getEmbeddingsForFile(filePath);
                    return { 
                        success: true, 
                        chunks: existingEmbeddings.length,
                        error: 'File already indexed and not modified',
                        filePath
                    };
                }
            }
            
            // Read the file content
            const content = await app.vault.read(file);
            
            // Delete existing embeddings for this file
            await DatabaseOperations.deleteEmbeddingsForFile(db, filePath);
            
            // Create chunking options
            const chunkingOptions: ChunkingOptions = {
                strategy: settings.chunkStrategy,
                maxTokens: settings.chunkSize,
                overlap: settings.chunkOverlap,
                includeFrontmatter: settings.includeFrontmatter,
                minLength: settings.minContentLength
            };
            
            // Chunk the content
            const chunks = chunkMarkdownText(content, chunkingOptions);
            
            // Skip if no chunks were created
            if (chunks.length === 0) {
                return { 
                    success: false, 
                    error: 'No valid chunks created from file',
                    filePath
                };
            }
            
            // Track total tokens
            let totalTokens = 0;
            
            // Create embeddings for each chunk
            const embeddings: EmbeddingRecord[] = [];
            let limitExceeded = false;
            
            for (const chunk of chunks) {
                try {
                    // Get token count for this chunk
                    const tokenCount = provider.getTokenCount(chunk.content);
                    
                    // Check if adding this chunk would exceed the monthly token limit
                    if (UsageStatsOperations.isTokenLimitExceeded(usageStats, settings.maxTokensPerMonth)) {
                        // Stop processing if we've hit the limit
                        limitExceeded = true;
                        new Notice(`Monthly token limit (${settings.maxTokensPerMonth.toLocaleString()}) reached. Indexing paused. Reset the counter or increase the limit in settings.`, 10000);
                        break;
                    }
                    
                    totalTokens += tokenCount;
                    
                    // Skip if too large
                    if (tokenCount > 8100) { // Slightly below the 8191 token limit
                        console.warn(`Skipping chunk with ${tokenCount} tokens (exceeds limit)`);
                        continue;
                    }
                    
                    // Generate embedding
                    const embedding = await provider.getEmbedding(chunk.content);
                    
                    // Update token usage and check if we've hit the limit after this chunk
                    const hitLimit = UsageStatsOperations.updateTokenUsage(usageStats, tokenCount, settings.maxTokensPerMonth);
                    if (hitLimit) {
                        // We'll still process this chunk but then stop
                        limitExceeded = true;
                    }
                    
                    // Extract links and backlinks from the file
                    const outgoingLinks = LinkOperations.extractOutgoingLinks(app, file);
                    const incomingLinks = LinkOperations.extractIncomingLinks(app, file);
                    
                    // Create record
                    const now = Date.now();
                    const record: EmbeddingRecord = {
                        id: `${filePath}-${chunk.startLine}-${chunk.endLine}`,
                        filePath: filePath,
                        lineStart: chunk.startLine,
                        lineEnd: chunk.endLine,
                        content: chunk.content,
                        embedding: embedding,
                        createdAt: now,
                        updatedAt: now,
                        metadata: {
                            frontmatter: chunk.frontmatter || {},
                            tags: chunk.tags || [],
                            createdDate: file.stat.ctime.toString(),
                            modifiedDate: file.stat.mtime.toString(),
                            links: {
                                outgoing: outgoingLinks, 
                                incoming: incomingLinks
                            }
                        }
                    };
                    
                    embeddings.push(record);
                    
                    // If we've hit the limit, show a notice and stop after this chunk
                    if (limitExceeded) {
                        new Notice(`Monthly token limit (${settings.maxTokensPerMonth.toLocaleString()}) reached. Indexing paused. Reset the counter or increase the limit in settings.`, 10000);
                        break;
                    }
                } catch (error) {
                    console.error(`Error embedding chunk from ${filePath}:`, error);
                    // Continue with other chunks
                }
            }
            
            // Add embeddings to database
            await DatabaseOperations.addEmbeddings(db, embeddings);
            
            // Update last indexed time
            UsageStatsOperations.updateLastIndexedTime(usageStats);
            
            // Return early with a specific message if the limit was exceeded
            if (limitExceeded) {
                return {
                    success: false,
                    chunks: embeddings.length,
                    error: 'Monthly token limit reached. Indexing paused.',
                    filePath
                };
            }
            
            return { 
                success: true, 
                chunks: embeddings.length,
                filePath
            };
        } catch (error: any) {
            console.error(`Error indexing file ${filePath}:`, error);
            return { 
                success: false, 
                error: error.message,
                filePath
            };
        }
    }
    
    /**
     * Reindex all files in the vault with support for resuming
     * 
     * @param app Obsidian app instance
     * @param db Vector store instance
     * @param provider Embedding provider
     * @param settings Memory settings
     * @param usageStats Usage statistics to update
     * @param events Events manager for progress reporting
     * @param operationId Optional ID to resume a specific operation
     * @returns Result object with success flag, processed count, failed count, and error message if any
     */
    static async reindexAll(
        app: App,
        db: VectorStore | null,
        provider: BaseEmbeddingProvider | null,
        settings: MemorySettings,
        usageStats: MemoryUsageStats,
        events: Events,
        operationId?: string
    ): Promise<{
        success: boolean;
        processed: number;
        failed: number;
        error?: string;
        operationId: string;
        completed: boolean;
    }> {
        if (!settings.enabled || !db || !provider) {
            return {
                success: false,
                processed: 0,
                failed: 0,
                error: 'Memory Manager is not enabled or initialized',
                operationId: '',
                completed: true
            };
        }
        
        // Set indexing flag
        UsageStatsOperations.setIndexingInProgress(usageStats, true);
        
        // Generate a unique operation ID if none provided
        if (!operationId) {
            operationId = `indexing-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        }
        
        try {
            // Try to load existing progress state
            let progressState = this.loadProgressState(operationId);
            let processedFiles: string[] = [];
            let failedFiles: string[] = [];
            
            // Get all markdown files that match the exclusion criteria
            const files = FilePathOperations.getEligibleMarkdownFiles(
                app,
                settings.excludePaths
            );
            
            // If we have a progress state and it's for the same set of files, use it
            if (progressState && progressState.total === files.length && !progressState.isCancelled) {
                processedFiles = progressState.processed;
                failedFiles = progressState.failed;
                
                // Notify about resuming
                new Notice(`Resuming indexing from ${processedFiles.length + failedFiles.length}/${files.length} files`);
            } else {
                // Create a new progress state
                progressState = {
                    operationId,
                    total: files.length,
                    processed: [],
                    failed: [],
                    startTime: Date.now(),
                    isCancelled: false
                };
                
                // First, clean up orphaned embeddings
                await DatabaseOperations.cleanOrphanedEmbeddings(app, db, usageStats);
                
                // Save initial state
                this.saveProgressState(progressState);
                
                // Register global cancellation handler
                // @ts-ignore - Using window for cross-component communication
                if (window.mcpProgressHandlers) {
                    // @ts-ignore
                    window.mcpProgressHandlers.cancelProgress = (data: { operationId: string }) => {
                        if (data.operationId === operationId) {
                            this.cancelOperation(operationId!);
                        }
                    };
                }
            }
            
            // Filter out files that have already been processed
            const remainingFiles = files.filter(file => {
                return !processedFiles.includes(file.path) && !failedFiles.includes(file.path);
            });
            
            // Process files in batches with rate limiting
            for (let i = 0; i < remainingFiles.length; i += settings.batchSize) {
                // Check if operation has been cancelled
                if (progressState.isCancelled) {
                    // Call completion handler if available
                    // @ts-ignore - Using window for cross-component communication
                    if (window.mcpProgressHandlers && window.mcpProgressHandlers.completeProgress) {
                        // @ts-ignore
                        window.mcpProgressHandlers.completeProgress({
                            success: false,
                            processed: processedFiles.length,
                            failed: failedFiles.length,
                            error: 'Operation cancelled by user',
                            operationId
                        });
                    }
                    
                    return {
                        success: false,
                        processed: processedFiles.length,
                        failed: failedFiles.length,
                        error: 'Operation cancelled by user',
                        operationId,
                        completed: false
                    };
                }
                
                const batch = remainingFiles.slice(i, i + settings.batchSize);
                
                // Process files with concurrency limit
                const concurrentLimit = Math.min(settings.concurrentRequests, 3); // Cap concurrency at 3
                const chunks = [];
                
                // Split the batch into chunks based on concurrency limit
                for (let j = 0; j < batch.length; j += concurrentLimit) {
                    chunks.push(batch.slice(j, j + concurrentLimit));
                }
                
                // Process each chunk sequentially, but allow concurrency within each chunk
                for (const chunk of chunks) {
                    // Check if token limit has been hit before processing this chunk
                    if (UsageStatsOperations.isTokenLimitExceeded(usageStats, settings.maxTokensPerMonth)) {
                        new Notice(`Monthly token limit (${settings.maxTokensPerMonth.toLocaleString()}) reached. Indexing paused. Reset the counter or increase the limit in settings.`, 10000);
                        
                        // Call completion handler with token limit error
                        // @ts-ignore - Using window for cross-component communication
                        if (window.mcpProgressHandlers && window.mcpProgressHandlers.completeProgress) {
                            // @ts-ignore
                            window.mcpProgressHandlers.completeProgress({
                                success: false,
                                processed: processedFiles.length,
                                failed: failedFiles.length,
                                error: 'Monthly token limit reached. Indexing paused.',
                                operationId
                            });
                        }
                        
                        return {
                            success: false,
                            processed: processedFiles.length,
                            failed: failedFiles.length,
                            error: 'Monthly token limit reached. Indexing paused.',
                            operationId,
                            completed: false
                        };
                    }
                    
                    const chunkPromises = chunk.map(async (file: TFile) => {
                        try {
                            const result = await IndexingOperations.indexFile(
                                app,
                                db,
                                provider,
                                file.path,
                                settings,
                                usageStats,
                                true // Force reindex
                            );
                            
                            if (result.success) {
                                processedFiles.push(file.path);
                            } else {
                                failedFiles.push(file.path);
                                
                                // If the error is about token limit, we should propagate it
                                if (result.error && result.error.includes('Monthly token limit reached')) {
                                    throw new Error('Monthly token limit reached');
                                }
                            }
                            
                            return result;
                        } catch (error) {
                            console.error(`Error indexing ${file.path}:`, error);
                            failedFiles.push(file.path);
                            
                            // Propagate token limit errors
                            if (error.message && error.message.includes('Monthly token limit reached')) {
                                throw error;
                            }
                            
                            return { success: false, error: error.message, filePath: file.path };
                        }
                    });
                    
                    try {
                        // Wait for this chunk to complete before moving to the next
                        await Promise.all(chunkPromises);
                    } catch (error) {
                        // If this is a token limit error, stop processing and return
                        if (error.message && error.message.includes('Monthly token limit reached')) {
                            new Notice(`Monthly token limit (${settings.maxTokensPerMonth.toLocaleString()}) reached. Indexing paused. Reset the counter or increase the limit in settings.`, 10000);
                            
                            // Call completion handler with token limit error
                            // @ts-ignore - Using window for cross-component communication
                            if (window.mcpProgressHandlers && window.mcpProgressHandlers.completeProgress) {
                                // @ts-ignore
                                window.mcpProgressHandlers.completeProgress({
                                    success: false,
                                    processed: processedFiles.length,
                                    failed: failedFiles.length,
                                    error: 'Monthly token limit reached. Indexing paused.',
                                    operationId
                                });
                            }
                            
                            return {
                                success: false,
                                processed: processedFiles.length,
                                failed: failedFiles.length,
                                error: 'Monthly token limit reached. Indexing paused.',
                                operationId,
                                completed: false
                            };
                        }
                    }
                    
                    // Update progress state after each chunk
                    progressState.processed = processedFiles;
                    progressState.failed = failedFiles;
                    this.saveProgressState(progressState);
                    
                    // Call progress update handler if available
                    // @ts-ignore - Using window for cross-component communication
                    if (window.mcpProgressHandlers && window.mcpProgressHandlers.updateProgress) {
                        // @ts-ignore
                        window.mcpProgressHandlers.updateProgress({
                            total: files.length,
                            processed: processedFiles.length + failedFiles.length,
                            remaining: files.length - (processedFiles.length + failedFiles.length),
                            operationId
                        });
                    }
                    
                    // Add a brief pause between chunks to avoid overwhelming the system
                    // and give the UI a chance to update
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                // Add a pause between batches to give the system time to breathe
                // This helps prevent the UI from freezing during large indexing operations
                await new Promise(resolve => setTimeout(resolve, settings.processingDelay || 1000));
            }
            
            // Update last indexed time
            UsageStatsOperations.updateLastIndexedTime(usageStats);
            
            // Get updated stats
            await DatabaseOperations.updateDatabaseStats(db, usageStats);
            
            // Clear progress state as operation is complete
            this.clearProgressState(operationId);
            
            // Call completion handler if available
            // @ts-ignore - Using window for cross-component communication
            if (window.mcpProgressHandlers && window.mcpProgressHandlers.completeProgress) {
                // @ts-ignore
                window.mcpProgressHandlers.completeProgress({
                    success: true,
                    processed: processedFiles.length,
                    failed: failedFiles.length,
                    operationId
                });
            }
            
            return {
                success: true,
                processed: processedFiles.length,
                failed: failedFiles.length,
                operationId,
                completed: true
            };
        } catch (error: any) {
            console.error('Error reindexing all files:', error);
            
            // Call completion handler if available
            // @ts-ignore - Using window for cross-component communication
            if (window.mcpProgressHandlers && window.mcpProgressHandlers.completeProgress) {
                // @ts-ignore
                window.mcpProgressHandlers.completeProgress({
                    success: false,
                    processed: 0,
                    failed: 0,
                    error: error.message,
                    operationId
                });
            }
            
            return {
                success: false,
                processed: 0,
                failed: 0,
                error: error.message,
                operationId,
                completed: true
            };
        } finally {
            // Clear indexing flag
            UsageStatsOperations.setIndexingInProgress(usageStats, false);
        }
    }
}