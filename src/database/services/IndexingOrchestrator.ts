import { Plugin, Notice, TFile } from 'obsidian';
import { 
    IIndexingOrchestrator, 
    IndexingOptions, 
    UpdateOptions, 
    IndexingResult, 
    IndexingStatus 
} from '../interfaces/IIndexingOrchestrator';
import { IFileContentService } from '../interfaces/IFileContentService';
import { IProgressNotificationService } from '../interfaces/IProgressNotificationService';
import { IVectorStoreOperationsService } from '../interfaces/IVectorStoreOperationsService';
import { IEmbeddingProviderService } from '../interfaces/IEmbeddingProviderService';
import { IChunkingService } from '../interfaces/IChunkingService';
import { ITokenUsageService } from '../interfaces/ITokenUsageService';
import { IndexingStateManager } from './IndexingStateManager';
import { v4 as uuidv4 } from 'uuid';
import { FileEmbedding } from '../workspace-types';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Service for orchestrating indexing operations
 * Coordinates multiple specialized services to perform indexing tasks
 */
export class IndexingOrchestrator implements IIndexingOrchestrator {
    private plugin: Plugin;
    private fileContentService: IFileContentService;
    private progressService: IProgressNotificationService;
    private vectorStoreService: IVectorStoreOperationsService;
    private embeddingProviderService: IEmbeddingProviderService;
    private chunkingService: IChunkingService;
    private tokenUsageService: ITokenUsageService;
    private stateManager: IndexingStateManager;
    
    private currentStatus: IndexingStatus = {
        isIndexing: false,
        canResume: false
    };

    constructor(
        plugin: Plugin,
        fileContentService: IFileContentService,
        progressService: IProgressNotificationService,
        vectorStoreService: IVectorStoreOperationsService,
        embeddingProviderService: IEmbeddingProviderService,
        chunkingService: IChunkingService,
        tokenUsageService: ITokenUsageService
    ) {
        this.plugin = plugin;
        this.fileContentService = fileContentService;
        this.progressService = progressService;
        this.vectorStoreService = vectorStoreService;
        this.embeddingProviderService = embeddingProviderService;
        this.chunkingService = chunkingService;
        this.tokenUsageService = tokenUsageService;
        this.stateManager = new IndexingStateManager(plugin);
    }

    /**
     * Batch index multiple files with progress reporting
     */
    async batchIndexFiles(
        filePaths: string[], 
        options?: IndexingOptions,
        progressCallback?: (current: number, total: number) => void
    ): Promise<IndexingResult> {
        if (!this.embeddingProviderService.areEmbeddingsEnabled()) {
            throw new Error('Embeddings are disabled in settings');
        }

        if (!filePaths || filePaths.length === 0) {
            return this.createEmptyResult();
        }

        const startTime = Date.now();
        const opts = this.getDefaultOptions(options);
        
        // Update status
        this.currentStatus = {
            isIndexing: true,
            currentOperation: 'batch-index',
            progress: { current: 0, total: filePaths.length, processed: 0, failed: 0 },
            canResume: true
        };

        // Set reindexing flag to prevent file update queue processing
        (this.plugin as any).isReindexing = true;

        let progressNotice: any = null;
        if (opts.showNotifications) {
            progressNotice = this.progressService.createProgressNotice(
                `Generating embeddings: 0/${filePaths.length} files`
            );
        }

        try {
            // Check if resuming or starting new
            const existingState = await this.stateManager.loadState();
            const isResuming = existingState && existingState.pendingFiles.length > 0;

            if (!isResuming) {
                await this.stateManager.initializeIndexing(filePaths);
                
                // Purge existing embeddings if requested
                if (opts.purgeExisting) {
                    await this.purgeExistingEmbeddings();
                }
            }

            const result = await this.processFilesInBatches(
                filePaths, 
                opts, 
                progressNotice, 
                progressCallback
            );

            // Calculate duration and finalize result
            result.duration = Date.now() - startTime;
            
            // Update token usage statistics
            if (result.totalTokensProcessed > 0) {
                const model = this.embeddingProviderService.getProviderType() || 'text-embedding-3-small';
                const cost = this.tokenUsageService.calculateCost(result.totalTokensProcessed, model);
                await this.tokenUsageService.updateTokenUsage(
                    result.totalTokensProcessed, 
                    model,
                    cost
                );
            }

            // Complete progress notification
            if (progressNotice) {
                this.progressService.completeProgress(
                    progressNotice,
                    `Completed: ${result.filesSuccess} files processed, ${result.filesFailed} failed`
                );
            }
            
            this.progressService.notifyBatchCompletion({
                success: true,
                processedCount: result.filesSuccess,
                totalTokensProcessed: result.totalTokensProcessed,
                failed: result.filesFailed,
                operationId: 'batch-index'
            });

            // Clean up
            await this.stateManager.clearState();
            
            if (progressNotice) {
                progressNotice.setMessage(`Completed embedding generation for ${result.filesProcessed} files (${result.totalTokensProcessed} tokens)`);
                setTimeout(() => progressNotice.hide(), 3000);
            }

            return result;

        } catch (error: unknown) {
            // Handle error
            const state = await this.stateManager.loadState();
            if (state) {
                state.status = 'error';
                state.errorMessage = getErrorMessage(error);
                await this.stateManager.saveState(state);
            }

            if (progressNotice) {
                this.progressService.completeProgress(
                    progressNotice,
                    `Error: ${getErrorMessage(error)}`
                );
            }
            
            this.progressService.notifyBatchCompletion({
                success: false,
                processedCount: this.currentStatus.progress?.processed || 0,
                totalTokensProcessed: 0,
                failed: this.currentStatus.progress?.failed || 0,
                error: getErrorMessage(error),
                operationId: 'batch-index'
            });


            throw error;

        } finally {
            // Reset status and flags
            this.currentStatus.isIndexing = false;
            (this.plugin as any).isReindexing = false;
        }
    }

    /**
     * Incrementally update embeddings for specific files
     */
    async incrementalIndexFiles(
        filePaths: string[], 
        options?: IndexingOptions,
        progressCallback?: (current: number, total: number) => void
    ): Promise<IndexingResult> {
        // For incremental updates, we don't purge existing embeddings
        const opts = { ...this.getDefaultOptions(options), purgeExisting: false };
        
        this.currentStatus = {
            isIndexing: true,
            currentOperation: 'incremental-index',
            progress: { current: 0, total: filePaths.length, processed: 0, failed: 0 },
            canResume: false
        };

        return this.batchIndexFiles(filePaths, opts, progressCallback);
    }

    /**
     * Update only changed chunks of a file based on content diff
     */
    async updateChangedChunks(
        filePath: string, 
        oldContent: string, 
        newContent: string, 
        options?: UpdateOptions
    ): Promise<string[]> {
        if (!this.embeddingProviderService.areEmbeddingsEnabled()) {
            throw new Error('Embeddings are disabled in settings');
        }

        const opts = { workspaceId: 'default', showNotifications: true, ...options };

        // Mark as system operation to prevent file event loops
        this.vectorStoreService.startSystemOperation();

        try {
            // Extract content without frontmatter for both versions
            const oldExtraction = this.chunkingService.extractContent(oldContent);
            const newExtraction = this.chunkingService.extractContent(newContent);

            // Get chunking settings
            const settings = this.embeddingProviderService.getProvider()?.getSettings?.() || {};
            const chunkMaxTokens = settings.maxTokensPerChunk || 8000;
            const chunkStrategy = settings.chunkStrategy || 'paragraph';

            // Chunk both versions
            const oldChunks = this.chunkingService.chunkText(oldExtraction.mainContent, {
                maxTokens: chunkMaxTokens,
                strategy: chunkStrategy,
                includeMetadata: true
            });

            const newChunks = this.chunkingService.chunkText(newExtraction.mainContent, {
                maxTokens: chunkMaxTokens,
                strategy: chunkStrategy,
                includeMetadata: true
            });

            // Get existing embeddings for this file
            const existingEmbeddings = await this.vectorStoreService.getFileEmbeddings(filePath);

            // Map old chunks to their embedding IDs
            const oldEmbeddingIds = oldChunks.map(chunk => {
                const embedding = existingEmbeddings.find(e => 
                    e.metadata?.chunkIndex === chunk.metadata.chunkIndex
                );
                return embedding?.id || '';
            });

            // Find matches between old and new chunks
            const matchResults = this.chunkingService.findChunkMatches(
                oldChunks, 
                newChunks, 
                oldEmbeddingIds
            );

            const updatedIds: string[] = [];
            const embeddingsToDelete: string[] = [];

            // Process each match result
            for (const result of matchResults) {
                if (result.matchType === 'exact' && result.oldEmbeddingId) {
                    // Reuse existing embedding
                    updatedIds.push(result.oldEmbeddingId);
                } else {
                    // Need new embedding
                    if (result.oldEmbeddingId) {
                        embeddingsToDelete.push(result.oldEmbeddingId);
                    }
                }
            }

            // Delete old embeddings for changed chunks
            if (embeddingsToDelete.length > 0) {
                await this.vectorStoreService.deleteEmbeddings(embeddingsToDelete);
            }

            // Get chunks that need new embeddings
            const chunksNeedingEmbedding = this.chunkingService.getChunksNeedingEmbedding(matchResults);

            // Generate embeddings for chunks that need them
            for (const request of chunksNeedingEmbedding) {
                const embedding = await this.embeddingProviderService.getEmbedding(request.newChunk.content);
                if (!embedding) {
                    console.warn(`Failed to generate embedding for chunk ${request.newChunk.metadata.chunkIndex}`);
                    continue;
                }

                // Create new file embedding
                const id = uuidv4();
                const fileEmbedding: FileEmbedding = {
                    id,
                    filePath,
                    timestamp: Date.now(),
                    workspaceId: opts.workspaceId,
                    vector: embedding,
                    content: request.newChunk.content,
                    chunkIndex: request.newChunk.metadata.chunkIndex,
                    totalChunks: request.newChunk.metadata.totalChunks,
                    chunkHash: request.newChunk.metadata.contentHash,
                    semanticBoundary: request.newChunk.metadata.semanticBoundary,
                    metadata: {
                        chunkIndex: request.newChunk.metadata.chunkIndex,
                        totalChunks: request.newChunk.metadata.totalChunks,
                        fileSize: newContent.length,
                        indexedAt: new Date().toISOString(),
                        tokenCount: request.newChunk.metadata.tokenCount,
                        startPosition: request.newChunk.metadata.startPosition,
                        endPosition: request.newChunk.metadata.endPosition,
                        contentHash: request.newChunk.metadata.contentHash,
                        semanticBoundary: request.newChunk.metadata.semanticBoundary
                    }
                };

                await this.vectorStoreService.addFileEmbedding(fileEmbedding);
                updatedIds.push(id);
            }

            // Clean up orphaned embeddings
            const allCurrentChunkIndices = new Set(newChunks.map(c => c.metadata.chunkIndex));
            const orphanedEmbeddings = existingEmbeddings.filter(e => 
                !allCurrentChunkIndices.has(e.metadata?.chunkIndex || e.chunkIndex || -1)
            );

            if (orphanedEmbeddings.length > 0) {
                const orphanedIds = orphanedEmbeddings.map(e => e.id);
                await this.vectorStoreService.deleteEmbeddings(orphanedIds);
            }

            console.log(`Chunk-level update complete for ${filePath}: ${updatedIds.length} embeddings updated`);
            return updatedIds;

        } finally {
            this.vectorStoreService.endSystemOperation();
        }
    }

    /**
     * Check if there's a resumable indexing operation
     */
    async hasResumableIndexing(): Promise<boolean> {
        return await this.stateManager.hasResumableIndexing();
    }

    /**
     * Resume a previously interrupted indexing operation
     */
    async resumeIndexing(progressCallback?: (current: number, total: number) => void): Promise<IndexingResult> {
        const state = await this.stateManager.loadState();
        if (!state || state.pendingFiles.length === 0) {
            throw new Error('No resumable indexing operation found');
        }

        console.log(`Resuming indexing: ${state.completedFiles.length} completed, ${state.pendingFiles.length} remaining`);

        // Update the state to show we're resuming
        state.status = 'indexing';
        await this.stateManager.saveState(state);

        // Process only the pending files
        return this.batchIndexFiles(state.pendingFiles, undefined, (current, total) => {
            // Adjust progress to account for already completed files
            const totalProgress = state.completedFiles.length + current;
            const totalFiles = state.totalFiles;

            if (progressCallback) {
                progressCallback(totalProgress, totalFiles);
            }
        });
    }

    /**
     * Cancel any ongoing indexing operation
     */
    async cancelIndexing(): Promise<void> {
        this.currentStatus.isIndexing = false;
        await this.stateManager.clearState();
        (this.plugin as any).isReindexing = false;
    }

    /**
     * Get current indexing status
     */
    getIndexingStatus(): IndexingStatus {
        return { ...this.currentStatus };
    }

    /**
     * Process files in batches
     */
    private async processFilesInBatches(
        filePaths: string[], 
        options: IndexingOptions, 
        notice: Notice | null,
        progressCallback?: (current: number, total: number) => void
    ): Promise<IndexingResult> {
        const result: IndexingResult = {
            embeddingIds: [],
            totalTokensProcessed: 0,
            filesProcessed: 0,
            filesSuccess: 0,
            filesFailed: 0,
            failedFiles: [],
            totalChunks: 0,
            duration: 0
        };

        let processedCount = 0;

        // Process files in batches
        for (let i = 0; i < filePaths.length; i += options.batchSize!) {
            const batch = filePaths.slice(i, i + options.batchSize!);
            
            const batchResults = await Promise.allSettled(
                batch.map(filePath => this.processFile(filePath, options))
            );

            // Process batch results
            batchResults.forEach((batchResult, index) => {
                const filePath = batch[index];
                result.filesProcessed++;

                if (batchResult.status === 'fulfilled' && batchResult.value) {
                    const fileResult = batchResult.value;
                    result.embeddingIds.push(...fileResult.ids);
                    result.totalTokensProcessed += fileResult.tokens;
                    result.totalChunks += fileResult.chunks;
                    result.filesSuccess++;
                } else {
                    result.filesFailed++;
                    result.failedFiles.push(filePath);
                }
            });

            // Update progress
            processedCount += batch.length;
            
            if (notice) {
                notice.setMessage(`Generating embeddings: ${processedCount}/${filePaths.length} files`);
            }

            if (progressCallback) {
                progressCallback(processedCount, filePaths.length);
            }

            // Update state
            const state = await this.stateManager.loadState();
            if (state) {
                state.completedFiles.push(...batch.filter((_, index) => 
                    batchResults[index].status === 'fulfilled'
                ));
                state.pendingFiles = state.pendingFiles.filter(pending => 
                    !batch.includes(pending)
                );
                await this.stateManager.saveState(state);
            }

            // Add delay between batches
            if (i + options.batchSize! < filePaths.length) {
                await new Promise(resolve => setTimeout(resolve, options.processingDelay));
            }
        }

        return result;
    }

    /**
     * Process a single file
     */
    private async processFile(filePath: string, options: IndexingOptions): Promise<{ ids: string[]; tokens: number; chunks: number }> {
        // Validate and read file content
        if (!this.fileContentService.validateFile(filePath)) {
            throw new Error(`Invalid file: ${filePath}`);
        }

        const content = await this.fileContentService.readFileContent(filePath);
        if (!content || content.trim().length === 0) {
            throw new Error(`File is empty: ${filePath}`);
        }

        // Extract content and chunk it
        const extraction = this.chunkingService.extractContent(content);
        const settings = this.embeddingProviderService.getProvider()?.getSettings?.() || {};
        
        const chunks = this.chunkingService.chunkText(extraction.mainContent, {
            maxTokens: settings.maxTokensPerChunk || 8000,
            strategy: settings.chunkStrategy || 'paragraph',
            includeMetadata: true
        });

        const chunkIds: string[] = [];
        let totalTokens = 0;

        // Process each chunk
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            totalTokens += chunk.metadata.tokenCount;

            // Generate embedding
            const embedding = await this.embeddingProviderService.getEmbedding(chunk.content);
            if (!embedding) {
                console.warn(`Failed to generate embedding for chunk ${i + 1}/${chunks.length} of file: ${filePath}`);
                continue;
            }

            // Create file embedding
            const id = uuidv4();
            const fileEmbedding: FileEmbedding = {
                id,
                filePath,
                timestamp: Date.now(),
                workspaceId: options.workspaceId || 'default',
                vector: embedding,
                content: chunk.content,
                chunkIndex: chunk.metadata.chunkIndex,
                totalChunks: chunk.metadata.totalChunks,
                chunkHash: chunk.metadata.contentHash,
                semanticBoundary: chunk.metadata.semanticBoundary,
                metadata: {
                    chunkIndex: chunk.metadata.chunkIndex,
                    totalChunks: chunk.metadata.totalChunks,
                    fileSize: content.length,
                    indexedAt: new Date().toISOString(),
                    tokenCount: chunk.metadata.tokenCount,
                    startPosition: chunk.metadata.startPosition,
                    endPosition: chunk.metadata.endPosition,
                    contentHash: chunk.metadata.contentHash,
                    semanticBoundary: chunk.metadata.semanticBoundary,
                    frontmatter: i === 0 ? extraction.frontmatter : undefined
                }
            };

            await this.vectorStoreService.addFileEmbedding(fileEmbedding);
            chunkIds.push(id);
        }

        return { ids: chunkIds, tokens: totalTokens, chunks: chunks.length };
    }

    /**
     * Purge existing embeddings from the collection
     */
    private async purgeExistingEmbeddings(): Promise<void> {
        try {
            const count = await this.vectorStoreService.getCollectionCount('file_embeddings');
            console.log(`Found ${count} existing file embeddings before reindexing`);

            if (count > 0) {
                console.log('Purging file_embeddings collection before reindexing...');
                await this.vectorStoreService.deleteCollection('file_embeddings');
                await this.vectorStoreService.createCollection('file_embeddings');
                console.log('Successfully purged file_embeddings collection');
            }
        } catch (error: unknown) {
            console.error('Error purging file_embeddings collection:', error);
            // Don't throw here, continue with reindexing
        }
    }

    /**
     * Get default indexing options
     */
    private getDefaultOptions(options?: IndexingOptions): Required<IndexingOptions> {
        return {
            workspaceId: 'default',
            batchSize: 5,
            processingDelay: 1000,
            purgeExisting: false,
            showNotifications: true,
            ...options
        };
    }

    /**
     * Create empty result object
     */
    private createEmptyResult(): IndexingResult {
        return {
            embeddingIds: [],
            totalTokensProcessed: 0,
            filesProcessed: 0,
            filesSuccess: 0,
            filesFailed: 0,
            failedFiles: [],
            totalChunks: 0,
            duration: 0
        };
    }
}
