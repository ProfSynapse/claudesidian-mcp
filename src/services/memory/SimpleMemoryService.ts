import { MemoryTraceCollection } from '../../database/collections/MemoryTraceCollection';
import { VectorStoreFactory } from '../../database/factory/VectorStoreFactory';
import { MemoryTraceStorageCoordinator, StorageResult } from './MemoryTraceStorageCoordinator';
import { CollectionService } from "../../database/services/core/CollectionService";
import { SessionService } from '../session/SessionService';

/**
 * Lightweight in-memory storage service for immediate memory capture.
 * Provides basic functionality that can be upgraded to full MemoryTraceService
 * when background services are ready.
 * 
 * CRITICAL: Now persists traces to vector database to ensure they survive restarts
 */
export class SimpleMemoryService {
    private toolCalls = new Map<string, any>();
    private sessions = new Map<string, any>();
    private traces = new Map<string, any>();
    private metadata = new Map<string, any>();
    private pendingTraces = new Map<string, any>();
    private vectorStore: any = null;
    private memoryTraceCollection: MemoryTraceCollection | null = null;
    private storageCoordinator: MemoryTraceStorageCoordinator | null = null;

    constructor(private sessionService?: SessionService) {}
    
    /**
     * Store a tool call capture immediately in memory
     */
    async storeToolCall(id: string, capture: any): Promise<void> {
        this.toolCalls.set(id, {
            ...capture,
            timestamp: Date.now(),
            stored: new Date().toISOString()
        });
    }
    
    /**
     * Retrieve a tool call capture by ID
     */
    async getToolCall(id: string): Promise<any | null> {
        return this.toolCalls.get(id) || null;
    }
    
    /**
     * Get all tool call captures
     */
    async getAllToolCalls(): Promise<any[]> {
        return Array.from(this.toolCalls.values());
    }
    
    /**
     * Store session information
     */
    async storeSession(sessionId: string, sessionData: any): Promise<void> {
        this.sessions.set(sessionId, {
            ...sessionData,
            timestamp: Date.now(),
            stored: new Date().toISOString()
        });
    }
    
    /**
     * Retrieve session data by ID
     */
    async getSession(sessionId: string): Promise<any | null> {
        return this.sessions.get(sessionId) || null;
    }
    
    /**
     * Get all sessions
     */
    async getAllSessions(): Promise<any[]> {
        return Array.from(this.sessions.values());
    }
    
    /**
     * Set vector store reference for persistence and initialize storage coordinator
     */
    setVectorStore(vectorStore: any): void {
        this.vectorStore = vectorStore;
        
        // Create storage coordinator with collection lifecycle management
        if (vectorStore && vectorStore.collectionManager) {
            const collectionLifecycleManager = new CollectionService(
                vectorStore, 
                vectorStore.collectionManager
            );
            
            this.storageCoordinator = new MemoryTraceStorageCoordinator(
                vectorStore,
                collectionLifecycleManager,
                this.sessionService || null as any
            );
            
        }

        // Legacy collection creation for backward compatibility
        this.memoryTraceCollection = VectorStoreFactory.createMemoryTraceCollection(vectorStore);
        
        
        // Attempt to persist any traces that were captured before vector store was available
        this.persistPendingTraces();
    }

    /**
     * Store memory trace - ENHANCED WITH GUARANTEED PERSISTENCE
     */
    async storeTrace(traceId: string, trace: any): Promise<void> {
        // Always store in memory for immediate access
        this.traces.set(traceId, {
            ...trace,
            timestamp: Date.now(),
            stored: new Date().toISOString()
        });

        // Attempt persistence via storage coordinator
        if (this.storageCoordinator) {
            try {
                const result: StorageResult = await this.storageCoordinator.storeMemoryTrace(traceId, trace);
                
                if (!result.success) {
                    console.error(`[SimpleMemoryService] Failed to persist trace ${traceId}`);
                } else if (result.warning) {
                    console.warn(`[SimpleMemoryService] Persistence warning for ${traceId}:`, result.warning);
                }

            } catch (error) {
                console.error(`[SimpleMemoryService] Storage coordinator error for ${traceId}:`, error);
                // Trace is still in memory, so not completely lost
            }
        } else if (this.memoryTraceCollection) {
            // Fallback to legacy persistence method
            try {
                const memoryTraceData = {
                    workspaceId: trace.workspaceId || 'default',
                    workspacePath: trace.workspacePath || [],
                    contextLevel: trace.contextLevel || 'workspace',
                    activityType: trace.activityType || 'research',
                    content: trace.content || `Tool call: ${trace.agent}.${trace.mode}`,
                    embedding: trace.embedding || [], // Required by WorkspaceMemoryTrace interface
                    sessionId: trace.sessionId || '',
                    timestamp: trace.timestamp || Date.now(),
                    importance: trace.importance || 0.7,
                    tags: trace.tags || ['tool_call', trace.agent, trace.mode],
                    metadata: {
                        tool: trace.agent || 'unknown',
                        params: trace.metadata?.parameters || {},
                        result: trace.metadata?.result || {},
                        relatedFiles: trace.metadata?.relatedFiles || [],
                        ...trace.metadata
                    }
                };

                await this.memoryTraceCollection.createMemoryTrace(memoryTraceData);
            } catch (error) {
                console.error('[SimpleMemoryService] Legacy persistence failed:', error);
            }
        } else {
            // Queue for later persistence when vector store becomes available
            if (!this.pendingTraces) {
                this.pendingTraces = new Map();
            }
            this.pendingTraces.set(traceId, trace);
        }
    }
    
    /**
     * Retrieve memory trace by ID
     */
    async getTrace(traceId: string): Promise<any | null> {
        return this.traces.get(traceId) || null;
    }
    
    /**
     * Get all memory traces
     */
    async getAllTraces(): Promise<any[]> {
        return Array.from(this.traces.values());
    }
    
    /**
     * Store metadata
     */
    async storeMetadata(key: string, value: any): Promise<void> {
        this.metadata.set(key, {
            value,
            timestamp: Date.now(),
            stored: new Date().toISOString()
        });
    }
    
    /**
     * Retrieve metadata by key
     */
    async getMetadata(key: string): Promise<any | null> {
        const item = this.metadata.get(key);
        return item ? item.value : null;
    }
    
    /**
     * Clear all stored data
     */
    async clear(): Promise<void> {
        this.toolCalls.clear();
        this.sessions.clear();
        this.traces.clear();
        this.metadata.clear();
    }
    
    /**
     * Export all data for backup or migration
     */
    async exportData(): Promise<any> {
        return {
            toolCalls: Object.fromEntries(this.toolCalls),
            sessions: Object.fromEntries(this.sessions),
            traces: Object.fromEntries(this.traces),
            metadata: Object.fromEntries(this.metadata),
            exported: new Date().toISOString()
        };
    }
    
    /**
     * Import data from backup or migration
     */
    async importData(data: any): Promise<void> {
        if (data.toolCalls) {
            for (const [key, value] of Object.entries(data.toolCalls)) {
                this.toolCalls.set(key, value);
            }
        }
        if (data.sessions) {
            for (const [key, value] of Object.entries(data.sessions)) {
                this.sessions.set(key, value);
            }
        }
        if (data.traces) {
            for (const [key, value] of Object.entries(data.traces)) {
                this.traces.set(key, value);
            }
        }
        if (data.metadata) {
            for (const [key, value] of Object.entries(data.metadata)) {
                this.metadata.set(key, value);
            }
        }
    }
    
    private async persistPendingTraces(): Promise<void> {
        if (!this.pendingTraces || this.pendingTraces.size === 0 || !this.storageCoordinator) {
            return;
        }


        const persistencePromises: Promise<any>[] = [];
        
        for (const [traceId, trace] of this.pendingTraces.entries()) {
            const promise = this.storageCoordinator.storeMemoryTrace(traceId, trace)
                .then(result => {
                    return { traceId, success: result.success };
                })
                .catch(error => {
                    console.error(`[SimpleMemoryService] Failed to persist pending trace ${traceId}:`, error);
                    return { traceId, success: false, error };
                });
            
            persistencePromises.push(promise);
        }

        const results = await Promise.allSettled(persistencePromises);
        const successCount = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
        
        
        // Clear pending traces after persistence attempt
        this.pendingTraces.clear();
    }

    async getStorageStatus(): Promise<{
        inMemoryCount: number;
        vectorStoreAvailable: boolean;
        storageCoordinatorAvailable: boolean;
        pendingCount: number;
        queueStatus: any;
        collectionHealthy: boolean;
    }> {
        const status = {
            inMemoryCount: this.traces.size,
            vectorStoreAvailable: !!this.vectorStore,
            storageCoordinatorAvailable: !!this.storageCoordinator,
            pendingCount: this.pendingTraces?.size || 0,
            queueStatus: null as any,
            collectionHealthy: false
        };

        if (this.storageCoordinator) {
            try {
                const queueStatus = await this.storageCoordinator.getQueueStatus();
                status.queueStatus = queueStatus;
                
                const validationResult = await this.storageCoordinator.validateStorage();
                status.collectionHealthy = validationResult.collectionHealthy;
            } catch (error) {
                console.error('[SimpleMemoryService] Failed to get storage status:', error);
            }
        }

        return status;
    }

    /**
     * Get storage statistics
     */
    getStats(): { toolCalls: number; sessions: number; traces: number; metadata: number } {
        return {
            toolCalls: this.toolCalls.size,
            sessions: this.sessions.size,
            traces: this.traces.size,
            metadata: this.metadata.size
        };
    }
}