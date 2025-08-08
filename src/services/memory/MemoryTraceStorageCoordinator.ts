/**
 * MemoryTraceStorageCoordinator
 * 
 * Comprehensive memory trace storage pipeline that ensures reliable persistence
 * of tool calls and user interactions to the vector database. Implements guaranteed
 * persistence with retry mechanisms, collection validation, and error recovery.
 * 
 * Location: /mnt/c/Users/jrose/Documents/Plugin Tester/.obsidian/plugins/claudesidian-mcp/src/services/memory/MemoryTraceStorageCoordinator.ts
 * 
 * Usage: Coordinates between ToolCallCaptureService and SimpleMemoryService to
 * ensure tool call traces are reliably stored in both in-memory cache and
 * vector database collections. Used by SimpleMemoryService.storeTrace() method.
 */

import { IVectorStore } from '../../database/interfaces/IVectorStore';
import { CollectionService } from "../../database/services/core/CollectionService";
import { MemoryTraceCollection } from '../../database/collections/MemoryTraceCollection';
import { VectorStoreFactory } from '../../database/factory/VectorStoreFactory';
import { SessionService } from '../session/SessionService';

export interface MemoryTraceData {
    id?: string;
    workspaceId: string;
    workspacePath: string[];
    contextLevel: 'workspace' | 'phase' | 'task';
    activityType: 'project_plan' | 'question' | 'checkpoint' | 'completion' | 'research';
    content: string;
    embedding?: number[];
    importance: number;
    tags: string[];
    sessionId: string;
    timestamp: number;
    metadata: {
        tool: string;
        params: any;
        result: any;
        relatedFiles: string[];
        agent?: string;
        mode?: string;
        parameters?: any;
        duration?: number;
        error?: string;
        [key: string]: any;
    };
}

export interface StorageResult {
    success: boolean;
    traceId: string;
    persistenceMethod: 'immediate' | 'queued';
    timestamp: number;
    warning?: string;
    error?: string;
}

export interface PersistenceResult {
    success: boolean;
    result?: any;
    error?: Error;
    method: 'immediate' | 'queued';
}

export interface MemoryTracePersistenceItem {
    traceId: string;
    trace: MemoryTraceData;
    timestamp: number;
    retryCount: number;
    maxRetries: number;
    lastError?: string;
    originalError?: string;
}

export interface QueueStatus {
    size: number;
    processing: boolean;
    oldestItem: number | null;
    retryItems: number;
    averageProcessingTime?: number;
    successRate?: number;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export class MemoryTraceValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MemoryTraceValidationError';
    }
}

export class MemoryTraceCollectionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MemoryTraceCollectionError';
    }
}

// Constants for validation and configuration
const MAX_TRACE_CONTENT_LENGTH = 10000;
const MAX_TAGS_COUNT = 20;

/**
 * Memory Trace Persistence Queue
 * Handles background processing of failed persistence attempts
 */
class MemoryTracePersistenceQueue {
    private queue: MemoryTracePersistenceItem[] = [];
    private processing = false;
    private batchSize = 10;
    private processingInterval = 5000; // 5 seconds
    private retryDelay = 30000; // 30 seconds

    constructor(private vectorStore: IVectorStore) {}

    async enqueue(item: MemoryTracePersistenceItem): Promise<void> {
        this.queue.push(item);
        console.log(`[MemoryTracePersistenceQueue] Queued trace ${item.traceId}, queue size: ${this.queue.length}`);
    }

    async startBackgroundProcessing(): Promise<void> {
        if (this.processing) {
            return;
        }

        this.processing = true;
        console.log('[MemoryTracePersistenceQueue] Starting background processing');

        while (this.processing && this.queue.length > 0) {
            try {
                await this.processBatch();
                await this.delay(this.processingInterval);
            } catch (error) {
                console.error('[MemoryTracePersistenceQueue] Batch processing error:', error);
                await this.delay(this.retryDelay);
            }
        }

        this.processing = false;
        console.log('[MemoryTracePersistenceQueue] Background processing stopped');
    }

    private async processBatch(): Promise<void> {
        if (this.queue.length === 0) {
            return;
        }

        const batch = this.queue.splice(0, this.batchSize);
        console.log(`[MemoryTracePersistenceQueue] Processing batch of ${batch.length} items`);

        for (const item of batch) {
            try {
                const memoryTraceCollection = VectorStoreFactory.createMemoryTraceCollection(this.vectorStore);
                
                const result = await memoryTraceCollection.createMemoryTrace({
                    workspaceId: item.trace.workspaceId,
                    workspacePath: item.trace.workspacePath,
                    contextLevel: this.mapContextLevel(item.trace.contextLevel),
                    activityType: this.mapActivityType(item.trace.activityType),
                    content: item.trace.content,
                    embedding: item.trace.embedding || [],
                    importance: item.trace.importance,
                    tags: item.trace.tags,
                    sessionId: item.trace.sessionId,
                    timestamp: item.trace.timestamp,
                    metadata: this.mapMetadata(item.trace.metadata)
                });

                console.log(`[MemoryTracePersistenceQueue] Successfully persisted queued trace ${item.traceId}`);

            } catch (error) {
                console.error(`[MemoryTracePersistenceQueue] Failed to persist trace ${item.traceId}:`, error);
                
                // Retry logic
                if (item.retryCount < item.maxRetries) {
                    item.retryCount++;
                    item.lastError = error instanceof Error ? error.message : String(error);
                    this.queue.push(item); // Re-queue for retry
                    console.log(`[MemoryTracePersistenceQueue] Re-queued ${item.traceId} for retry ${item.retryCount}/${item.maxRetries}`);
                } else {
                    console.error(`[MemoryTracePersistenceQueue] Permanently failed to persist ${item.traceId} after ${item.maxRetries} retries`);
                }
            }
        }
    }

    stopProcessing(): void {
        this.processing = false;
    }

    getQueueSize(): number {
        return this.queue.length;
    }

    getQueueStatus(): QueueStatus {
        return {
            size: this.queue.length,
            processing: this.processing,
            oldestItem: this.queue.length > 0 ? this.queue[0].timestamp : null,
            retryItems: this.queue.filter(item => item.retryCount > 0).length
        };
    }

    /**
     * Map context level to valid HierarchyType
     */
    private mapContextLevel(contextLevel: any): 'workspace' | 'phase' | 'task' {
        switch (contextLevel) {
            case 'global':
            case 'workspace': return 'workspace';
            case 'session': return 'phase';  
            case 'interaction': return 'task';
            default: return 'workspace';
        }
    }

    /**
     * Map activity type to valid WorkspaceMemoryTrace activity type
     */
    private mapActivityType(activityType: any): 'project_plan' | 'question' | 'checkpoint' | 'completion' | 'research' {
        switch (activityType) {
            case 'tool_call': return 'research';
            case 'user_interaction': return 'question';
            case 'system_event': return 'checkpoint';
            case 'search': return 'research';
            case 'content_modification': return 'completion';
            default: return 'research';
        }
    }

    /**
     * Map metadata to required WorkspaceMemoryTrace metadata format
     */
    private mapMetadata(metadata: any): { tool: string; params: any; result: any; relatedFiles: string[]; [key: string]: any } {
        return {
            tool: metadata?.agent || metadata?.tool || 'unknown',
            params: metadata?.parameters || metadata?.params || {},
            result: metadata?.result || {},
            relatedFiles: metadata?.relatedFiles || [],
            ...metadata
        };
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Memory Trace Validator
 * Validates trace data and ensures collection health
 */
class MemoryTraceValidator {
    constructor(
        private vectorStore: IVectorStore,
        private collectionLifecycleManager: CollectionService
    ) {}

    async validateTraceData(trace: MemoryTraceData): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields validation
        if (!trace.content || trace.content.trim().length === 0) {
            errors.push('Trace content is required');
        }

        if (!trace.sessionId) {
            warnings.push('Missing sessionId - will use default');
        }

        if (!trace.workspaceId) {
            warnings.push('Missing workspaceId - will use default');
        }

        // Content length validation
        if (trace.content && trace.content.length > MAX_TRACE_CONTENT_LENGTH) {
            errors.push(`Trace content too long: ${trace.content.length} > ${MAX_TRACE_CONTENT_LENGTH}`);
        }

        // Importance value validation
        if (trace.importance !== undefined && (trace.importance < 0 || trace.importance > 1)) {
            errors.push('Importance must be between 0 and 1');
        }

        // Tags validation
        if (trace.tags && trace.tags.length > MAX_TAGS_COUNT) {
            warnings.push(`Too many tags: ${trace.tags.length} > ${MAX_TAGS_COUNT}, will truncate`);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    async ensureCollectionReady(): Promise<void> {
        try {
            // Check if collection exists
            const hasCollection = await this.vectorStore.hasCollection('memory_traces');
            
            if (!hasCollection) {
                console.log('[MemoryTraceValidator] Creating missing memory_traces collection');
                await this.collectionLifecycleManager.ensureStandardCollections();
            } else {
                // Validate existing collection health
                const validation = await this.collectionLifecycleManager.validateCollection('memory_traces');
                
                if (!validation.valid) {
                    console.warn('[MemoryTraceValidator] Unhealthy memory_traces collection, attempting recovery');
                    await this.collectionLifecycleManager.recoverCollection('memory_traces', 'soft');
                }
            }

            // Final validation
            const finalCheck = await this.vectorStore.hasCollection('memory_traces');
            if (!finalCheck) {
                throw new Error('Failed to ensure memory_traces collection exists');
            }

        } catch (error) {
            console.error('[MemoryTraceValidator] Collection validation failed:', error);
            throw new MemoryTraceCollectionError(`memory_traces collection not available: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async validateCollectionAccess(): Promise<boolean> {
        try {
            // Test basic operations
            await this.vectorStore.count('memory_traces');
            
            // Test query capability
            await this.vectorStore.query('memory_traces', {
                queryTexts: ['test'],
                nResults: 1
            });

            return true;

        } catch (error) {
            console.error('[MemoryTraceValidator] Collection access test failed:', error);
            return false;
        }
    }
}

/**
 * Main Memory Trace Storage Coordinator
 * Coordinates the complete memory trace storage pipeline
 */
export class MemoryTraceStorageCoordinator {
    private persistenceQueue: MemoryTracePersistenceQueue;
    private validator: MemoryTraceValidator;

    constructor(
        private vectorStore: IVectorStore,
        private collectionLifecycleManager: CollectionService,
        private sessionService: SessionService
    ) {
        this.persistenceQueue = new MemoryTracePersistenceQueue(vectorStore);
        this.validator = new MemoryTraceValidator(vectorStore, collectionLifecycleManager);
    }

    /**
     * Store memory trace with guaranteed persistence
     */
    async storeMemoryTrace(traceId: string, trace: MemoryTraceData): Promise<StorageResult> {
        try {
            console.log(`[MemoryTraceStorageCoordinator] Storing memory trace: ${traceId}`);

            // 1. Validate trace data
            const validationResult = await this.validator.validateTraceData(trace);
            if (!validationResult.valid) {
                throw new MemoryTraceValidationError(`Invalid trace data: ${validationResult.errors.join(', ')}`);
            }

            // Log warnings
            if (validationResult.warnings.length > 0) {
                console.warn(`[MemoryTraceStorageCoordinator] Trace validation warnings for ${traceId}:`, validationResult.warnings);
            }

            // 2. Ensure collection exists and is healthy
            await this.validator.ensureCollectionReady();

            // 3. Attempt immediate persistence
            const persistenceResult = await this.persistTraceImmediate(traceId, trace);
            
            if (persistenceResult.success) {
                return {
                    success: true,
                    traceId,
                    persistenceMethod: 'immediate',
                    timestamp: Date.now()
                };
            }

            // 4. Fallback to queued persistence
            return await this.queueTraceForPersistence(traceId, trace);

        } catch (error) {
            console.error('[MemoryTraceStorageCoordinator] Storage failed:', error);
            
            // Queue for retry even on error
            return await this.queueTraceForPersistence(traceId, trace, error as Error);
        }
    }

    private async persistTraceImmediate(traceId: string, trace: MemoryTraceData): Promise<PersistenceResult> {
        const memoryTraceCollection = VectorStoreFactory.createMemoryTraceCollection(this.vectorStore);
        
        try {
            const result = await memoryTraceCollection.createMemoryTrace({
                workspaceId: trace.workspaceId || 'default',
                workspacePath: trace.workspacePath || [],
                contextLevel: this.mapContextLevel(trace.contextLevel) || 'workspace',
                activityType: this.mapActivityType(trace.activityType) || 'research',
                content: trace.content || `Tool call: ${trace.metadata?.agent}.${trace.metadata?.mode}`,
                embedding: trace.embedding || [],
                importance: trace.importance || 0.5,
                tags: trace.tags || [],
                sessionId: trace.sessionId,
                timestamp: trace.timestamp || Date.now(),
                metadata: this.mapMetadata(trace.metadata) || { tool: 'unknown', params: {}, result: {}, relatedFiles: [] }
            });

            console.log(`[MemoryTraceStorageCoordinator] Immediate persistence successful for ${traceId}`);
            return { success: true, result, method: 'immediate' };

        } catch (error) {
            console.warn('[MemoryTraceStorageCoordinator] Immediate persistence failed:', error);
            return { success: false, error: error as Error, method: 'immediate' };
        }
    }

    private async queueTraceForPersistence(traceId: string, trace: MemoryTraceData, error?: Error): Promise<StorageResult> {
        await this.persistenceQueue.enqueue({
            traceId,
            trace,
            timestamp: Date.now(),
            retryCount: 0,
            maxRetries: 3,
            originalError: error?.message
        });

        // Start background processing if not already running
        this.startBackgroundProcessing();

        return {
            success: true,
            traceId,
            persistenceMethod: 'queued',
            timestamp: Date.now(),
            warning: error?.message
        };
    }

    private startBackgroundProcessing(): void {
        // Start background processing (non-blocking)
        this.persistenceQueue.startBackgroundProcessing().catch(error => {
            console.error('[MemoryTraceStorageCoordinator] Background processing error:', error);
        });
    }

    /**
     * Get queue status for monitoring
     */
    async getQueueStatus(): Promise<QueueStatus> {
        return this.persistenceQueue.getQueueStatus();
    }

    /**
     * Flush the queue and stop background processing
     */
    async shutdown(): Promise<void> {
        console.log('[MemoryTraceStorageCoordinator] Shutting down...');
        this.persistenceQueue.stopProcessing();
        
        // Wait for any ongoing processing to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    /**
     * Map context level to valid HierarchyType
     */
    private mapContextLevel(contextLevel: any): 'workspace' | 'phase' | 'task' {
        switch (contextLevel) {
            case 'global':
            case 'workspace': return 'workspace';
            case 'session': return 'phase';  
            case 'interaction': return 'task';
            default: return 'workspace';
        }
    }

    /**
     * Map activity type to valid WorkspaceMemoryTrace activity type
     */
    private mapActivityType(activityType: any): 'project_plan' | 'question' | 'checkpoint' | 'completion' | 'research' {
        switch (activityType) {
            case 'tool_call': return 'research';
            case 'user_interaction': return 'question';
            case 'system_event': return 'checkpoint';
            case 'search': return 'research';
            case 'content_modification': return 'completion';
            default: return 'research';
        }
    }

    /**
     * Map metadata to required WorkspaceMemoryTrace metadata format
     */
    private mapMetadata(metadata: any): { tool: string; params: any; result: any; relatedFiles: string[]; [key: string]: any } {
        return {
            tool: metadata?.agent || metadata?.tool || 'unknown',
            params: metadata?.parameters || metadata?.params || {},
            result: metadata?.result || {},
            relatedFiles: metadata?.relatedFiles || [],
            ...metadata
        };
    }

    /**
     * Validate storage health
     */
    async validateStorage(): Promise<{
        collectionHealthy: boolean;
        queueStatus: QueueStatus;
        validatorWorking: boolean;
    }> {
        let collectionHealthy = false;
        let validatorWorking = false;

        try {
            collectionHealthy = await this.validator.validateCollectionAccess();
            validatorWorking = true;
        } catch (error) {
            console.error('[MemoryTraceStorageCoordinator] Storage validation failed:', error);
        }

        const queueStatus = await this.getQueueStatus();

        return {
            collectionHealthy,
            queueStatus,
            validatorWorking
        };
    }
}