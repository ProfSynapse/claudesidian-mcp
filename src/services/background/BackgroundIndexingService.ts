/**
 * BackgroundIndexingService - Manages background HNSW index building with progress tracking
 * 
 * This service coordinates background HNSW index creation and updates without blocking startup.
 * It provides progress tracking for MCP error responses and handles background processing
 * using similar patterns to the existing FileEventScheduler and queue systems.
 * 
 * Key responsibilities:
 * - Schedule background index building for missing/stale indexes
 * - Track progress across multiple collections with time estimates
 * - Coordinate with existing HNSW services for actual index creation
 * - Provide progress information for MCP error responses
 * - Handle cancellation and error recovery
 * 
 * Dependencies:
 * - HnswSearchService: For actual index building operations
 * - HnswIndexHealthChecker: For health status validation
 * - Existing background processing patterns from file-events services
 */

import { Plugin } from 'obsidian';
import { HnswSearchService } from '../../database/services/hnsw/HnswSearchService';
import { HnswIndexHealthChecker, IndexHealthSummary } from '../../database/services/hnsw/health/HnswIndexHealthChecker';

export interface IndexingProgress {
    isActive: boolean;
    currentCollection?: string;
    completed: number;
    total: number;
    percentage: number;
    estimatedTimeRemaining?: string;
    startedAt?: number;
    completedCollections: string[];
    failedCollections: string[];
    errors: string[];
    phase: 'initializing' | 'building' | 'persisting' | 'verifying' | 'completed' | 'error';
}

export interface BackgroundIndexingTask {
    collectionName: string;
    taskType: 'build' | 'update' | 'rebuild';
    priority: 'high' | 'normal' | 'low';
    scheduledAt: number;
    attempts: number;
    maxAttempts: number;
    lastError?: string;
}

export interface IndexingOptions {
    batchSize?: number;
    processingDelay?: number;
    maxConcurrent?: number;
    enableProgressLogging?: boolean;
    retryFailedTasks?: boolean;
}

/**
 * Background service for non-blocking HNSW index building and progress tracking
 */
export class BackgroundIndexingService {
    private plugin: Plugin;
    private hnswService: HnswSearchService;
    private healthChecker: HnswIndexHealthChecker;
    
    // Task management
    private taskQueue: Map<string, BackgroundIndexingTask> = new Map();
    private isProcessing = false;
    private currentProgress: IndexingProgress;
    private processingStartTime?: number;
    private abortController?: AbortController;
    
    // Configuration
    private options: Required<IndexingOptions> = {
        batchSize: 3, // Process 3 collections concurrently
        processingDelay: 1000, // 1 second delay between collections
        maxConcurrent: 1, // Only one indexing operation at a time
        enableProgressLogging: true,
        retryFailedTasks: true
    };

    constructor(
        plugin: Plugin,
        hnswService: HnswSearchService,
        healthChecker: HnswIndexHealthChecker,
        options: IndexingOptions = {}
    ) {
        this.plugin = plugin;
        this.hnswService = hnswService;
        this.healthChecker = healthChecker;
        this.options = { ...this.options, ...options };
        
        this.currentProgress = this.createEmptyProgress();
        
        // Set up cleanup on plugin unload
        this.plugin.register(() => this.cleanup());
    }

    /**
     * Schedule background indexing for collections that need building/updating
     * Non-blocking operation that queues work for background processing
     */
    async scheduleIndexing(collections: string[]): Promise<void> {
        if (collections.length === 0) {
            console.log('[BackgroundIndexingService] No collections to schedule');
            return;
        }

        console.log(`[BackgroundIndexingService] Scheduling background indexing for ${collections.length} collections`);

        // Create tasks for each collection
        for (const collectionName of collections) {
            const existingTask = this.taskQueue.get(collectionName);
            
            if (existingTask && existingTask.attempts < existingTask.maxAttempts) {
                // Update existing task
                existingTask.scheduledAt = Date.now();
                console.log(`[BackgroundIndexingService] Updated task for collection: ${collectionName}`);
            } else {
                // Create new task
                const task: BackgroundIndexingTask = {
                    collectionName,
                    taskType: 'build', // Default to build, will be refined during processing
                    priority: 'normal',
                    scheduledAt: Date.now(),
                    attempts: 0,
                    maxAttempts: 3
                };
                
                this.taskQueue.set(collectionName, task);
                console.log(`[BackgroundIndexingService] Queued new task for collection: ${collectionName}`);
            }
        }

        // Start processing if not already running
        if (!this.isProcessing) {
            // Use setTimeout to make this truly non-blocking
            setTimeout(() => this.startBackgroundProcessing(), 100);
        }
    }

    /**
     * Get current indexing progress for MCP error responses
     */
    getProgress(): IndexingProgress {
        return { ...this.currentProgress };
    }

    /**
     * Check if background indexing is currently in progress
     */
    isIndexingInProgress(): boolean {
        return this.isProcessing;
    }

    /**
     * Cancel ongoing background indexing
     */
    cancelIndexing(): void {
        if (this.isProcessing && this.abortController) {
            console.log('[BackgroundIndexingService] Cancelling background indexing');
            this.abortController.abort();
            this.isProcessing = false;
            this.currentProgress.phase = 'error';
            this.currentProgress.errors.push('Indexing cancelled by user');
        }
    }

    /**
     * Get collections that are ready for searching (have healthy indexes)
     */
    async getReadyCollections(): Promise<string[]> {
        try {
            const healthSummary = await this.healthChecker.checkAllIndexes();
            return healthSummary.healthyCollections;
        } catch (error) {
            console.warn('[BackgroundIndexingService] Failed to get ready collections:', error);
            return [];
        }
    }

    /**
     * Check if a specific collection is ready for searching
     */
    async isCollectionReady(collectionName: string): Promise<boolean> {
        try {
            const health = await this.healthChecker.checkCollectionHealth(collectionName);
            return health.isHealthy;
        } catch (error) {
            console.warn(`[BackgroundIndexingService] Failed to check collection '${collectionName}':`, error);
            return false;
        }
    }

    /**
     * Start background processing of queued indexing tasks
     * Private method that runs the main background loop
     */
    private async startBackgroundProcessing(): Promise<void> {
        if (this.isProcessing) {
            return; // Already processing
        }

        this.isProcessing = true;
        this.processingStartTime = Date.now();
        this.abortController = new AbortController();
        
        const tasks = Array.from(this.taskQueue.values()).sort((a, b) => {
            // Priority order: high > normal > low
            const priorityOrder = { high: 0, normal: 1, low: 2 };
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            
            // Then by scheduled time (older first)
            return a.scheduledAt - b.scheduledAt;
        });

        this.updateProgress({
            isActive: true,
            phase: 'initializing',
            total: tasks.length,
            completed: 0,
            percentage: 0,
            completedCollections: [],
            failedCollections: [],
            errors: [],
            startedAt: this.processingStartTime
        });

        console.log(`[BackgroundIndexingService] Starting background processing of ${tasks.length} tasks`);

        try {
            // Process tasks in batches
            for (let i = 0; i < tasks.length; i += this.options.batchSize) {
                if (this.abortController.signal.aborted) {
                    console.log('[BackgroundIndexingService] Processing aborted');
                    break;
                }

                const batch = tasks.slice(i, Math.min(i + this.options.batchSize, tasks.length));
                await this.processBatch(batch);

                // Add delay between batches to prevent system overload
                if (i + this.options.batchSize < tasks.length) {
                    await this.delay(this.options.processingDelay);
                }
            }

            this.updateProgress({
                phase: 'completed',
                isActive: false,
                percentage: 100
            });

            console.log('[BackgroundIndexingService] Background processing completed successfully');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[BackgroundIndexingService] Background processing failed:', error);
            this.updateProgress({
                phase: 'error',
                isActive: false,
                errors: [...(this.currentProgress.errors || []), `Processing failed: ${errorMessage}`]
            });
        }

        this.isProcessing = false;
        this.abortController = undefined;
    }

    /**
     * Process a batch of indexing tasks concurrently
     */
    private async processBatch(tasks: BackgroundIndexingTask[]): Promise<void> {
        const batchPromises = tasks.map(task => this.processTask(task));
        await Promise.allSettled(batchPromises);
    }

    /**
     * Process a single indexing task
     */
    private async processTask(task: BackgroundIndexingTask): Promise<void> {
        const { collectionName } = task;
        
        try {
            this.updateProgress({
                currentCollection: collectionName,
                phase: 'building'
            });

            console.log(`[BackgroundIndexingService] Processing task for collection: ${collectionName}`);
            task.attempts++;

            // Check current health to determine what type of operation is needed
            const healthCheck = await this.healthChecker.checkCollectionHealth(collectionName);
            
            if (healthCheck.isHealthy) {
                console.log(`[BackgroundIndexingService] Collection '${collectionName}' is already healthy, skipping`);
                this.taskQueue.delete(collectionName);
                this.updateProgress({
                    completed: this.currentProgress.completed + 1,
                    completedCollections: [...this.currentProgress.completedCollections, collectionName]
                });
                return;
            }

            // Update task type based on health check
            if (healthCheck.needsBuilding) {
                task.taskType = healthCheck.status === 'corrupted' ? 'rebuild' : 'build';
            } else if (healthCheck.needsUpdate) {
                task.taskType = 'update';
            }

            this.updateProgress({ phase: 'building' });

            // Perform the actual indexing operation
            if (task.taskType === 'rebuild' || healthCheck.status === 'missing') {
                await this.hnswService.ensureFullyInitialized();
            } else {
                // For updates, use the same method for now (no specific collection method available)
                await this.hnswService.ensureFullyInitialized();
            }

            this.updateProgress({ phase: 'verifying' });

            // Verify the operation succeeded
            const verificationCheck = await this.healthChecker.checkCollectionHealth(collectionName);
            if (verificationCheck.isHealthy) {
                console.log(`[BackgroundIndexingService] Successfully processed collection: ${collectionName}`);
                this.taskQueue.delete(collectionName);
                this.updateProgress({
                    completed: this.currentProgress.completed + 1,
                    completedCollections: [...this.currentProgress.completedCollections, collectionName]
                });
            } else {
                throw new Error(`Verification failed: ${verificationCheck.reason}`);
            }

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorMessage = `Failed to process '${collectionName}': ${errorMsg}`;
            console.error(`[BackgroundIndexingService] ${errorMessage}`);
            
            task.lastError = errorMsg;
            
            if (task.attempts >= task.maxAttempts) {
                console.error(`[BackgroundIndexingService] Max attempts reached for '${collectionName}', giving up`);
                this.taskQueue.delete(collectionName);
                this.updateProgress({
                    failedCollections: [...this.currentProgress.failedCollections, collectionName],
                    errors: [...this.currentProgress.errors, errorMessage]
                });
            } else {
                console.log(`[BackgroundIndexingService] Will retry '${collectionName}' (attempt ${task.attempts}/${task.maxAttempts})`);
            }
        }

        // Update percentage based on completed tasks
        const totalTasks = this.taskQueue.size + this.currentProgress.completed + this.currentProgress.failedCollections.length;
        const completedTasks = this.currentProgress.completed + this.currentProgress.failedCollections.length;
        
        this.updateProgress({
            percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100,
            estimatedTimeRemaining: this.calculateTimeRemaining()
        });
    }

    /**
     * Update progress state with partial updates
     */
    private updateProgress(updates: Partial<IndexingProgress>): void {
        this.currentProgress = { ...this.currentProgress, ...updates };
        
        if (this.options.enableProgressLogging && updates.currentCollection) {
            console.log(`[BackgroundIndexingService] Progress: ${this.currentProgress.percentage}% - Processing ${updates.currentCollection}`);
        }
    }

    /**
     * Calculate estimated time remaining based on current progress
     */
    private calculateTimeRemaining(): string | undefined {
        if (!this.processingStartTime || this.currentProgress.completed === 0) {
            return undefined;
        }

        const elapsed = Date.now() - this.processingStartTime;
        const avgTimePerTask = elapsed / this.currentProgress.completed;
        const remaining = this.currentProgress.total - this.currentProgress.completed;
        const estimatedMs = remaining * avgTimePerTask;

        if (estimatedMs < 60000) {
            return `${Math.round(estimatedMs / 1000)}s`;
        } else if (estimatedMs < 3600000) {
            return `${Math.round(estimatedMs / 60000)}m`;
        } else {
            return `${Math.round(estimatedMs / 3600000)}h`;
        }
    }

    /**
     * Create empty progress state
     */
    private createEmptyProgress(): IndexingProgress {
        return {
            isActive: false,
            completed: 0,
            total: 0,
            percentage: 0,
            completedCollections: [],
            failedCollections: [],
            errors: [],
            phase: 'completed'
        };
    }

    /**
     * Utility method for delays
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cleanup resources when service is destroyed
     */
    private cleanup(): void {
        if (this.isProcessing) {
            this.cancelIndexing();
        }
        this.taskQueue.clear();
        this.currentProgress = this.createEmptyProgress();
    }
}