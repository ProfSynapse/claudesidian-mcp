/**
 * Interface for indexing orchestration service
 * Coordinates indexing operations using specialized services
 */
export interface IIndexingOrchestrator {
    /**
     * Batch index multiple files with progress reporting
     * @param filePaths Array of file paths to index
     * @param options Indexing options
     * @param progressCallback Optional callback for progress updates
     * @returns Promise resolving to indexing results
     */
    batchIndexFiles(
        filePaths: string[], 
        options?: IndexingOptions,
        progressCallback?: (current: number, total: number) => void
    ): Promise<IndexingResult>;

    /**
     * Incrementally update embeddings for specific files
     * @param filePaths Array of file paths to update
     * @param options Indexing options
     * @param progressCallback Optional callback for progress updates
     * @returns Promise resolving to indexing results
     */
    incrementalIndexFiles(
        filePaths: string[], 
        options?: IndexingOptions,
        progressCallback?: (current: number, total: number) => void
    ): Promise<IndexingResult>;

    /**
     * Update only changed chunks of a file based on content diff
     * @param filePath File path to update
     * @param oldContent Previous file content
     * @param newContent New file content
     * @param options Update options
     * @returns Promise resolving to array of updated embedding IDs
     */
    updateChangedChunks(
        filePath: string, 
        oldContent: string, 
        newContent: string, 
        options?: UpdateOptions
    ): Promise<string[]>;

    /**
     * Check if there's a resumable indexing operation
     * @returns True if resumable operation exists
     */
    hasResumableIndexing(): Promise<boolean>;

    /**
     * Resume a previously interrupted indexing operation
     * @param progressCallback Optional callback for progress updates
     * @returns Promise resolving to indexing results
     */
    resumeIndexing(progressCallback?: (current: number, total: number) => void): Promise<IndexingResult>;

    /**
     * Cancel any ongoing indexing operation
     */
    cancelIndexing(): Promise<void>;

    /**
     * Get current indexing status
     * @returns Current indexing status
     */
    getIndexingStatus(): IndexingStatus;
}

/**
 * Options for indexing operations
 */
export interface IndexingOptions {
    workspaceId?: string;
    batchSize?: number;
    processingDelay?: number;
    purgeExisting?: boolean;
    showNotifications?: boolean;
}

/**
 * Options for chunk update operations
 */
export interface UpdateOptions {
    workspaceId?: string;
    showNotifications?: boolean;
}

/**
 * Result of indexing operations
 */
export interface IndexingResult {
    embeddingIds: string[];
    totalTokensProcessed: number;
    filesProcessed: number;
    filesSuccess: number;
    filesFailed: number;
    failedFiles: string[];
    totalChunks: number;
    duration: number;
}

/**
 * Current indexing status
 */
export interface IndexingStatus {
    isIndexing: boolean;
    currentOperation?: string;
    progress?: {
        current: number;
        total: number;
        processed: number;
        failed: number;
    };
    canResume: boolean;
}
