import { EventEmitter } from 'events';
import { CacheManager } from './CacheManager';
import { WorkspaceService } from '../../../agents/memoryManager/services/WorkspaceService';
import { MemoryService } from '../../../agents/memoryManager/services/MemoryService';

export interface PrefetchOptions {
    maxConcurrentPrefetches?: number;
    prefetchDelay?: number;
    enableSmartPrefetch?: boolean;
}

export class PrefetchManager extends EventEmitter {
    private prefetchQueue: string[] = [];
    private isPrefetching = false;
    private prefetchHistory = new Map<string, number>(); // entityId -> last prefetch timestamp
    
    private readonly defaultMaxConcurrent = 3;
    private readonly defaultPrefetchDelay = 1000; // 1 second between prefetches
    private readonly prefetchCooldown = 5 * 60 * 1000; // 5 minutes cooldown

    constructor(
        private cacheManager: CacheManager,
        private workspaceService: WorkspaceService,
        private memoryService: MemoryService,
        private options: PrefetchOptions = {}
    ) {
        super();
        this.options.maxConcurrentPrefetches = options.maxConcurrentPrefetches || this.defaultMaxConcurrent;
        this.options.prefetchDelay = options.prefetchDelay || this.defaultPrefetchDelay;
        this.options.enableSmartPrefetch = options.enableSmartPrefetch ?? true;
    }

    /**
     * Called when a workspace is loaded - prefetch likely next items
     */
    async onWorkspaceLoaded(workspaceId: string): Promise<void> {
        if (!this.options.enableSmartPrefetch) return;

        try {
            // Get recent sessions for this workspace
            const sessions = await this.memoryService.getSessions(workspaceId);
            const recentSessions = sessions
                .sort((a, b) => b.startTime - a.startTime)
                .slice(0, 5);

            // Queue prefetch for recent sessions
            for (const session of recentSessions) {
                this.queuePrefetch('session', session.id);
            }

            // Get child workspaces if any
            const childWorkspaces = await this.workspaceService.getWorkspaces({
                parentId: workspaceId
            });

            // Queue prefetch for child workspaces
            for (const child of childWorkspaces.slice(0, 3)) {
                this.queuePrefetch('workspace', child.id);
            }

            // Start processing the queue
            this.processPrefetchQueue();
        } catch (error) {
            console.error('Error in onWorkspaceLoaded prefetch:', error);
        }
    }

    /**
     * Called when a session is loaded - prefetch associated data
     */
    async onSessionLoaded(sessionId: string): Promise<void> {
        if (!this.options.enableSmartPrefetch) return;

        try {
            // Get the session to find its workspace
            const session = await this.memoryService.getSession(sessionId, false);
            
            if (session && session.workspaceId) {
                // Prefetch the parent workspace if not already cached
                this.queuePrefetch('workspace', session.workspaceId);
            }

            // Get recent memory traces
            const traces = await this.memoryService.getMemoryTraces(sessionId, 10);
            const relatedFiles = new Set<string>();

            for (const trace of traces) {
                if (trace.metadata?.relatedFiles) {
                    trace.metadata.relatedFiles.forEach(f => relatedFiles.add(f));
                }
            }

            // Prefetch file metadata
            if (relatedFiles.size > 0) {
                await this.cacheManager.getFilesWithMetadata(Array.from(relatedFiles));
            }

            // Start processing the queue
            this.processPrefetchQueue();
        } catch (error) {
            console.error('Error in onSessionLoaded prefetch:', error);
        }
    }

    /**
     * Called when a state is loaded - prefetch related states
     */
    async onStateLoaded(stateId: string): Promise<void> {
        if (!this.options.enableSmartPrefetch) return;

        try {
            // Get the state to find related states
            const snapshots = await this.memoryService.getSnapshots();
            const state = snapshots.find(s => s.id === stateId);
            
            if (state) {
                // Prefetch parent session
                if (state.sessionId) {
                    this.queuePrefetch('session', state.sessionId);
                }

                // Prefetch sibling states (same session)
                if (state.sessionId) {
                    const siblingStates = snapshots
                        .filter(s => s.sessionId === state.sessionId && s.id !== stateId)
                        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
                        .slice(0, 3);

                    for (const sibling of siblingStates) {
                        this.queuePrefetch('state', sibling.id);
                    }
                }
            }

            // Start processing the queue
            this.processPrefetchQueue();
        } catch (error) {
            console.error('Error in onStateLoaded prefetch:', error);
        }
    }

    /**
     * Queue an entity for prefetching
     */
    private queuePrefetch(type: 'workspace' | 'session' | 'state', id: string): void {
        const key = `${type}:${id}`;
        
        // Check if recently prefetched
        const lastPrefetch = this.prefetchHistory.get(key);
        if (lastPrefetch && Date.now() - lastPrefetch < this.prefetchCooldown) {
            return; // Skip if recently prefetched
        }

        // Add to queue if not already there
        if (!this.prefetchQueue.includes(key)) {
            this.prefetchQueue.push(key);
            this.emit('prefetch:queued', { type, id });
        }
    }

    /**
     * Process the prefetch queue
     */
    private async processPrefetchQueue(): Promise<void> {
        if (this.isPrefetching || this.prefetchQueue.length === 0) {
            return;
        }

        this.isPrefetching = true;

        try {
            // Process up to maxConcurrent items
            const itemsToProcess = this.prefetchQueue.splice(0, this.options.maxConcurrentPrefetches || this.defaultMaxConcurrent);
            
            const prefetchPromises = itemsToProcess.map(async (item) => {
                const [type, id] = item.split(':');
                
                try {
                    switch (type) {
                        case 'workspace':
                            await this.cacheManager.preloadWorkspace(id);
                            break;
                        case 'session':
                            await this.cacheManager.preloadSession(id);
                            break;
                        case 'state':
                            await this.cacheManager.preloadState(id);
                            break;
                    }
                    
                    // Record successful prefetch
                    this.prefetchHistory.set(item, Date.now());
                    this.emit('prefetch:completed', { type, id });
                } catch (error) {
                    console.warn(`Failed to prefetch ${type} ${id}:`, error);
                    this.emit('prefetch:failed', { type, id, error });
                }
            });

            await Promise.all(prefetchPromises);

            // If there are more items, continue after a delay
            if (this.prefetchQueue.length > 0) {
                setTimeout(() => {
                    this.isPrefetching = false;
                    this.processPrefetchQueue();
                }, this.options.prefetchDelay || this.defaultPrefetchDelay);
            } else {
                this.isPrefetching = false;
            }
        } catch (error) {
            console.error('Error processing prefetch queue:', error);
            this.isPrefetching = false;
        }
    }

    /**
     * Clear the prefetch queue
     */
    clearQueue(): void {
        this.prefetchQueue = [];
        this.isPrefetching = false;
        this.emit('prefetch:queueCleared');
    }

    /**
     * Get prefetch statistics
     */
    getStats() {
        return {
            queueLength: this.prefetchQueue.length,
            isPrefetching: this.isPrefetching,
            historySize: this.prefetchHistory.size,
            recentPrefetches: Array.from(this.prefetchHistory.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([key, timestamp]) => ({
                    key,
                    timestamp,
                    age: Date.now() - timestamp
                }))
        };
    }
}