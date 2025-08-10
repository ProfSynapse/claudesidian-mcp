import { Plugin } from 'obsidian';
import { IEmbeddingScheduler, FileEvent, EmbeddingStrategy, ProcessingResult } from '../interfaces/IFileEventServices';
import { EmbeddingService } from '../../../database/services/core/EmbeddingService';

export class EmbeddingScheduler implements IEmbeddingScheduler {
    private strategy: EmbeddingStrategy;
    private lastActivityTime: number = Date.now();
    private isIdleMode = false;
    private queueProcessingCallback?: () => void;
    private idleCheckInterval?: NodeJS.Timeout;
    private waitingForChanges = false; // New state: waiting for file changes before starting timer

    constructor(
        private plugin: Plugin,
        private embeddingService: EmbeddingService,
        initialStrategy: EmbeddingStrategy
    ) {
        this.strategy = initialStrategy;
        this.initializeIdleTracking();
    }

    /**
     * Set callback for triggering queue processing when idle mode activates
     */
    setQueueProcessingCallback(callback: () => void): void {
        this.queueProcessingCallback = callback;
    }

    setStrategy(strategy: EmbeddingStrategy): void {
        const oldStrategy = this.strategy.type;
        this.strategy = { ...strategy };
        
        // Clean up old strategy
        if (oldStrategy === 'idle' && strategy.type !== 'idle') {
            if (this.idleCheckInterval) {
                clearInterval(this.idleCheckInterval);
                this.idleCheckInterval = undefined;
            }
            this.isIdleMode = false;
            this.waitingForChanges = true; // Stop idle processing
        }
        
        // Initialize new strategy
        if (strategy.type === 'idle') {
            this.initializeIdleTracking();
        }
    }

    shouldProcessEmbedding(event: FileEvent): boolean {
        // Never process embeddings for system operations to prevent loops
        if (event.isSystemOperation) {
            return false;
        }

        switch (this.strategy.type) {
            case 'idle':
                const shouldProcess = this.isIdleMode;
                return shouldProcess; // Queue and process when idle
                
            case 'startup':
                return false; // Queue but NEVER process live (only on startup)
                
            default:
                return false;
        }
    }

    async scheduleEmbedding(events: FileEvent[]): Promise<void> {
        const eventsToProcess = events.filter(event => this.shouldProcessEmbedding(event));
        
        if (eventsToProcess.length === 0) {
            if (events.length > 0) {
            }
            return;
        }


        if (this.strategy.type === 'idle') {
            // Add processing delay for idle strategy
            await this.delay(this.strategy.processingDelay);
        }

        await this.batchProcessEmbeddings(eventsToProcess);
        
        // After processing, stop the idle timer until next file change
        if (this.strategy.type === 'idle') {
            this.onEmbeddingProcessingComplete();
        }
    }

    /**
     * Notify scheduler about new file events (for idle strategy)
     */
    notifyFileEvents(events: FileEvent[]): void {
        if (this.strategy.type === 'idle' && events.length > 0) {
            this.onFileEventsAdded();
        }
    }

    /**
     * Called when new file events are added - starts idle timer
     * NOTE: This should ONLY be called for actual file changes, not internal processing
     */
    private onFileEventsAdded(): void {
        this.lastActivityTime = Date.now();
        this.isIdleMode = false;
        this.waitingForChanges = false;
    }

    /**
     * Called after embedding processing completes - stops idle timer
     */
    private onEmbeddingProcessingComplete(): void {
        this.isIdleMode = false;
        this.waitingForChanges = true; // Stop idle checking until next file change
    }

    /**
     * Force process embeddings regardless of strategy - used for startup processing
     */
    async forceProcessEmbeddings(events: FileEvent[]): Promise<void> {
        const strategy = this.strategy.type;
        
        if (strategy === 'startup') {
        }
        
        await this.batchProcessEmbeddings(events);
        
        if (strategy === 'startup') {
        }
    }

    async batchProcessEmbeddings(events: FileEvent[]): Promise<ProcessingResult[]> {
        const results: ProcessingResult[] = [];
        const batchSize = this.strategy.batchSize;

        // Group events by operation for efficient processing
        const createEvents = events.filter(e => e.operation === 'create');
        const modifyEvents = events.filter(e => e.operation === 'modify');

        // Process in batches
        const allFileEvents = [...createEvents, ...modifyEvents];
        const totalFiles = allFileEvents.length;
        
        // Initialize overall progress tracking for the entire batch operation
        if (totalFiles > 0) {
            const embeddingService = this.embeddingService as any;
            if (embeddingService.progressTracker) {
                embeddingService.progressTracker.initializeProgress(
                    totalFiles,
                    'batch-embedding-discovery',
                    true
                );
            }
        }
        
        for (let i = 0; i < allFileEvents.length; i += batchSize) {
            const batch = allFileEvents.slice(i, i + batchSize);
            const batchResults = await this.processBatchWithOverallProgress(batch, i, totalFiles);
            results.push(...batchResults);

            // Add delay between batches to prevent overwhelming the system
            if (i + batchSize < allFileEvents.length) {
                await this.delay(100); // 100ms between batches
            }
        }

        // Complete overall progress tracking
        if (totalFiles > 0) {
            const embeddingService = this.embeddingService as any;
            if (embeddingService.progressTracker) {
                embeddingService.progressTracker.completeProgress(
                    true,
                    undefined,
                    `✅ Completed embedding ${totalFiles} files`
                );
            }
        }

        return results;
    }

    private async processBatch(events: FileEvent[]): Promise<ProcessingResult[]> {
        const results: ProcessingResult[] = [];
        
        try {
            
            // Extract file paths for the embedding service
            const filePaths = events.map(event => event.path);
            
            // Use the embedding service to process the files
            // Note: Using incrementalIndexFiles which is available in EmbeddingService
            await this.embeddingService.incrementalIndexFiles(filePaths);

            // Mark all as successful
            for (const event of events) {
                results.push({
                    success: true,
                    embeddingCreated: true,
                    activityRecorded: false
                });
            }
            
            
        } catch (error) {
            console.error('[EmbeddingScheduler] Error processing batch:', error);
            
            // Mark all as failed
            for (const event of events) {
                results.push({
                    success: false,
                    embeddingCreated: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
        
        return results;
    }

    private async processBatchWithOverallProgress(events: FileEvent[], currentIndex: number, totalFiles: number): Promise<ProcessingResult[]> {
        const results: ProcessingResult[] = [];
        
        try {
            // Extract file paths for the embedding service
            const filePaths = events.map(event => event.path);
            
            // Use the embedding service to process the files silently (no batch progress notification)
            await this.embeddingService.incrementalIndexFilesSilent(filePaths);

            // Update overall progress
            const embeddingService = this.embeddingService as any;
            if (embeddingService.progressTracker) {
                const completedFiles = currentIndex + events.length;
                embeddingService.progressTracker.updateProgress(
                    completedFiles,
                    completedFiles,
                    0
                );
            }

            // Mark all as successful
            for (const event of events) {
                results.push({
                    success: true,
                    embeddingCreated: true,
                    activityRecorded: false
                });
            }
        } catch (error) {
            console.error('[EmbeddingScheduler] Error processing batch with overall progress:', error);
            
            // Mark all as failed
            for (const event of events) {
                results.push({
                    success: false,
                    embeddingCreated: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        return results;
    }

    /**
     * Trigger queue processing - called when entering idle mode
     */
    private triggerQueueProcessing(): void {
        if (this.queueProcessingCallback) {
            // Force processing mode - we know we're idle
            this.isIdleMode = true;
            this.queueProcessingCallback();
            // After triggering, mark as complete to stop timer
            this.onEmbeddingProcessingComplete();
        } else {
            console.warn(`[EmbeddingScheduler] Queue processing callback not set - cannot trigger processing`);
        }
    }

    private initializeIdleTracking(): void {
        if (this.strategy.type !== 'idle') return;

        // Track user activity to determine idle state
        const updateActivity = () => {
            // Only reset if we're not already waiting for changes (avoid interfering with file change detection)
            if (!this.waitingForChanges) {
                this.lastActivityTime = Date.now();
                this.isIdleMode = false;
            }
        };

        // Register activity listeners
        document.addEventListener('mousedown', updateActivity);
        document.addEventListener('keydown', updateActivity);
        document.addEventListener('scroll', updateActivity);

        // Check idle state periodically
        const checkIdleState = () => {
            // Skip idle checking if we're waiting for file changes
            if (this.waitingForChanges) {
                return;
            }

            const timeSinceActivity = Date.now() - this.lastActivityTime;
            const wasIdle = this.isIdleMode;
            this.isIdleMode = timeSinceActivity >= this.strategy.idleTimeThreshold;

            // Debug logging every check

            if (!wasIdle && this.isIdleMode) {
                // Immediately trigger queue processing when we enter idle mode
                this.triggerQueueProcessing();
            } else if (wasIdle && !this.isIdleMode) {
            }
        };

        // Check frequently for responsive idle detection (every 5 seconds)
        this.idleCheckInterval = setInterval(checkIdleState, 5000);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Utility methods
    getStrategy(): EmbeddingStrategy {
        return { ...this.strategy };
    }

    isIdle(): boolean {
        return this.isIdleMode;
    }

    getLastActivityTime(): number {
        return this.lastActivityTime;
    }


    // Cleanup method
    cleanup(): void {
        if (this.idleCheckInterval) {
            clearInterval(this.idleCheckInterval);
            this.idleCheckInterval = undefined;
        }
        // Remove event listeners if they were added
        // This would need to store references to the actual functions if we want to remove them
    }
}