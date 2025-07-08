import { Plugin } from 'obsidian';
import { IEmbeddingScheduler, FileEvent, EmbeddingStrategy, ProcessingResult } from '../interfaces/IFileEventServices';
import { EmbeddingService } from '../../../database/services/EmbeddingService';

export class EmbeddingScheduler implements IEmbeddingScheduler {
    private strategy: EmbeddingStrategy;
    private lastActivityTime: number = Date.now();
    private isIdleMode = false;

    constructor(
        private plugin: Plugin,
        private embeddingService: EmbeddingService,
        initialStrategy: EmbeddingStrategy
    ) {
        this.strategy = initialStrategy;
        this.initializeIdleTracking();
    }

    setStrategy(strategy: EmbeddingStrategy): void {
        this.strategy = { ...strategy };
    }

    shouldProcessEmbedding(event: FileEvent): boolean {
        // Never process embeddings for system operations to prevent loops
        if (event.isSystemOperation) {
            return false;
        }

        switch (this.strategy.type) {
            case 'idle':
                return this.isIdleMode; // Queue and process when idle
                
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
                console.log(`[EmbeddingScheduler] Skipped ${events.length} events (strategy: ${this.strategy.type})`);
            }
            return;
        }

        console.log(`[EmbeddingScheduler] Processing ${eventsToProcess.length}/${events.length} events (strategy: ${this.strategy.type})`);


        if (this.strategy.type === 'idle') {
            // Add processing delay for idle strategy
            await this.delay(this.strategy.processingDelay);
        }

        await this.batchProcessEmbeddings(eventsToProcess);
    }

    /**
     * Force process embeddings regardless of strategy - used for startup processing
     */
    async forceProcessEmbeddings(events: FileEvent[]): Promise<void> {
        console.log(`[EmbeddingScheduler] Force processing ${events.length} events (startup queue)`);
        await this.batchProcessEmbeddings(events);
    }

    async batchProcessEmbeddings(events: FileEvent[]): Promise<ProcessingResult[]> {
        const results: ProcessingResult[] = [];
        const batchSize = this.strategy.batchSize;

        // Group events by operation for efficient processing
        const createEvents = events.filter(e => e.operation === 'create');
        const modifyEvents = events.filter(e => e.operation === 'modify');

        // Process in batches
        const allFileEvents = [...createEvents, ...modifyEvents];
        
        for (let i = 0; i < allFileEvents.length; i += batchSize) {
            const batch = allFileEvents.slice(i, i + batchSize);
            const batchResults = await this.processBatch(batch);
            results.push(...batchResults);

            // Add delay between batches to prevent overwhelming the system
            if (i + batchSize < allFileEvents.length) {
                await this.delay(100); // 100ms between batches
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

    private initializeIdleTracking(): void {
        if (this.strategy.type !== 'idle') return;

        // Track user activity to determine idle state
        const updateActivity = () => {
            this.lastActivityTime = Date.now();
            this.isIdleMode = false;
        };

        // Register activity listeners
        document.addEventListener('mousedown', updateActivity);
        document.addEventListener('keydown', updateActivity);
        document.addEventListener('scroll', updateActivity);

        // Check idle state periodically
        const checkIdleState = () => {
            const timeSinceActivity = Date.now() - this.lastActivityTime;
            const wasIdle = this.isIdleMode;
            this.isIdleMode = timeSinceActivity >= this.strategy.idleTimeThreshold;

            if (!wasIdle && this.isIdleMode) {
            } else if (wasIdle && !this.isIdleMode) {
            }
        };

        // Check every 30 seconds
        setInterval(checkIdleState, 30000);
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
        // Remove event listeners if they were added
        // This would need to store references to the actual functions if we want to remove them
    }
}